"""PREPARATION ONLY: opt-in single database backup. No schedule is installed."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from urllib.parse import urlsplit, unquote

PREFIX = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,100}/$')

def validate(env):
    # Deployment must opt in separately after storage, access and cost approval.
    if env.get('BACKUP_ACTIVATION_APPROVED') != 'yes':
        raise ValueError('activation not approved')
    for name in ('DATABASE_URL', 'BACKUP_BUCKET', 'BACKUP_ENDPOINT',
                 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'BACKUP_PREFIX'):
        if not env.get(name):
            raise ValueError('missing required configuration')
    if not PREFIX.fullmatch(env['BACKUP_PREFIX']) or '..' in env['BACKUP_PREFIX']:
        raise ValueError('invalid backup prefix')
    if not env['BACKUP_ENDPOINT'].startswith('https://'):
        raise ValueError('storage requires HTTPS')
    # Retention is intentionally disabled, even after activation.
    if env.get('BACKUP_RETENTION_DELETE', 'no') != 'no':
        raise ValueError('retention deletion not implemented or approved')
    max_bytes = int(env.get('BACKUP_MAX_BYTES', '0'))
    if max_bytes <= 0:
        raise ValueError('explicit positive size safeguard required')
    u = urlsplit(env['DATABASE_URL'])
    if u.scheme not in ('postgres', 'postgresql') or not u.hostname or not u.username or not u.path.strip('/'):
        raise ValueError('invalid database configuration')
    return u, max_bytes

def pg_environment(env, u, directory):
    # libpq fields only, never expose the full URL or pass it in process args.
    # Query options are not forwarded implicitly. TLS policy must be chosen.
    sslmode = env.get('BACKUP_PGSSLMODE')
    if sslmode not in ('verify-full', 'require', 'disable'):
        raise ValueError('explicit database transport policy required')
    if sslmode == 'disable' and env.get('BACKUP_PRIVATE_NETWORK_APPROVED') != 'yes':
        raise ValueError('unencrypted libpq requires approved private transport')
    def esc(value):
        return str(value).replace('\\', '\\\\').replace(':', '\\:')
    password_file = Path(directory) / 'pgpass'
    password_file.write_text(':'.join(esc(x) for x in
        (u.hostname, u.port or 5432, unquote(u.path[1:]), unquote(u.username), unquote(u.password or ''))) + '\n')
    password_file.chmod(0o600)
    pg = {k: v for k, v in env.items() if k not in ('DATABASE_URL', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE')}
    pg.update(PGHOST=u.hostname, PGPORT=str(u.port or 5432), PGDATABASE=unquote(u.path[1:]),
              PGUSER=unquote(u.username), PGPASSFILE=str(password_file), PGSSLMODE=sslmode,
              PGOPTIONS='-c default_transaction_read_only=on', PGCONNECT_TIMEOUT='10')
    return pg

def run_private(args, env, timeout=180):
    # Tool stderr may contain connection details or object values. Never print it.
    p = subprocess.run(args, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if p.returncode:
        raise RuntimeError('database tool failed')
    return p.stdout

def digest_stream(stream):
    digest, size = hashlib.sha256(), 0
    while True:
        chunk = stream.read(1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
        size += len(chunk)
    return digest.hexdigest(), size

def upload_verified(s3, bucket, key, dump, sha, size):
    # Never treat a multipart ETag as a checksum. Read uploaded bytes back.
    s3.upload_file(str(dump), bucket, key, ExtraArgs={'Metadata': {'sha256': sha}})
    head = s3.head_object(Bucket=bucket, Key=key)
    if head['ContentLength'] != size or head.get('Metadata', {}).get('sha256') != sha:
        raise RuntimeError('upload metadata verification failed')
    response = s3.get_object(Bucket=bucket, Key=key)
    try:
        remote_sha, remote_size = digest_stream(response['Body'])
    finally:
        response['Body'].close()
    if remote_sha != sha or remote_size != size:
        raise RuntimeError('uploaded bytes verification failed')

def main(env=None, client=None):
    env = dict(os.environ if env is None else env)
    u, max_bytes = validate(env)
    os.umask(0o077)
    if client is None:
        import boto3
        from botocore.config import Config
        client = boto3.client('s3', endpoint_url=env['BACKUP_ENDPOINT'],
             region_name=env.get('AWS_DEFAULT_REGION', 'auto'),
             config=Config(connect_timeout=10, read_timeout=30, retries={'max_attempts': 2}))
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    key = env['BACKUP_PREFIX'] + stamp + '.dump'
    with tempfile.TemporaryDirectory(prefix='crm-backup-') as directory:
        pg = pg_environment(env, u, directory)
        target = Path(directory) / 'database.dump'
        run_private(['pg_dump', '--format=custom', '--no-password', '--lock-wait-timeout=10s',
                     '--file', str(target)], pg)
        size = target.stat().st_size
        if size == 0 or size > max_bytes:
            raise RuntimeError('backup exceeds approved size safeguard or is empty')
        run_private(['pg_restore', '--list', str(target)], pg, timeout=30)
        with target.open('rb') as stream:
            sha, size = digest_stream(stream)
        upload_verified(client, env['BACKUP_BUCKET'], key, target, sha, size)
        # Manifest contains metadata only. No customer contents or connection string.
        manifest = {'created_at_utc': stamp, 'size_bytes': size, 'sha256': sha,
                    'archive_listing_ok': True, 'uploaded_bytes_verified': True,
                    'restore_tested': False}
        client.put_object(Bucket=env['BACKUP_BUCKET'], Key=key + '.verified.json',
                          Body=json.dumps(manifest).encode(), ContentType='application/json')
        print(json.dumps({'status': 'verified_upload', 'created_at_utc': stamp, 'size_bytes': size,
                          'restore_tested': False}))
    return manifest

if __name__ == '__main__':
    try:
        main()
    except Exception:
        # No stack traces or underlying exception texts in unattended job logs.
        print(json.dumps({'status': 'failed', 'reason': 'backup did not complete; private diagnostics required'}))
        raise SystemExit(1)

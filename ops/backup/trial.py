"""Finite, opt-in Drive trial. Must be wrapped by an external 300-second timeout."""
import hashlib,json,os,resource,signal,subprocess,tempfile,time,urllib.parse,urllib.request
from pathlib import Path
from datetime import datetime,timezone
from urllib.parse import urlsplit
from backup import pg_environment,run_private,digest_stream
from drive import Drive,SCOPE

def guard(env):
    if env.get('BACKUP_SINGLE_TRIAL_APPROVED')!='yes':raise ValueError('inactive')
    if env.get('BACKUP_RETENTION_DELETE','no')!='no':raise ValueError('deletion disabled')
    u=urlsplit(env.get('DATABASE_URL',''))
    if u.scheme not in ('postgres','postgresql') or not u.hostname or not u.username or not u.password or not u.path.strip('/'):
        raise ValueError('invalid database reference')
    maximum=int(env.get('BACKUP_MAX_BYTES','0'))
    if not (0<maximum<=256*1024*1024):raise ValueError('invalid size limit')
    if env.get('BACKUP_PGSSLMODE')=='disable' and (not u.hostname.endswith('.railway.internal') or env.get('BACKUP_PRIVATE_NETWORK_APPROVED')!='yes'):
        raise ValueError('private transport not confirmed')
    return u,maximum

def refresh(config):
    if config.get('scope')!=SCOPE:raise ValueError('scope mismatch')
    body=urllib.parse.urlencode({k:config[k] for k in ('client_id','client_secret','refresh_token')}|{'grant_type':'refresh_token'}).encode()
    req=urllib.request.Request('https://oauth2.googleapis.com/token',body,headers={'Content-Type':'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req,timeout=20) as r:token=json.load(r)
    # Refresh responses may omit scope. The original grant must be exact too.
    if token.get('scope',SCOPE)!=SCOPE:raise ValueError('scope mismatch')
    token['scope']=SCOPE
    return token

def main(env=None):
    started=time.monotonic()
    env=dict(os.environ if env is None else env)
    u,maximum=guard(env)
    os.umask(0o077)
    resource.setrlimit(resource.RLIMIT_FSIZE,(maximum,maximum))
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    config=json.loads(env['DRIVE_OAUTH_JSON'])
    token=refresh(config)
    client=Drive({},token)
    with tempfile.TemporaryDirectory(prefix='tashgheel-trial-') as directory:
        pg=pg_environment(env,u,directory)
        # Tools get only DB configuration and PATH, never Drive credentials.
        pg={k:v for k,v in pg.items() if k.startswith('PG') or k in ('PATH','HOME','LANG','LC_ALL','LD_LIBRARY_PATH')}
        server=run_private(['psql','--no-password','-X','-At','-c','SHOW server_version_num'],pg,15).decode().strip()
        if not server.isdigit() or int(server)//10000!=18:raise RuntimeError('server major changed')
        version=run_private(['pg_dump','--version'],pg,10).decode().strip()
        if '18.' not in version:raise RuntimeError('wrong dump client')
        target=Path(directory)/('tashgheel-'+stamp+'.dump')
        run_private(['pg_dump','--format=custom','--no-password','--lock-wait-timeout=10s','--file',str(target)],pg,150)
        if not (0<target.stat().st_size<=maximum):raise RuntimeError('archive size guard')
        run_private(['pg_restore','--list',str(target)],pg,20)
        with target.open('rb') as f:sha,size=digest_stream(f)
        folder=client.folder('Tashgheel backup trial '+stamp)
        obj=client.upload(target,target.name,folder['id'],sha)
        manifest={'created_at_utc':stamp,'sha256':sha,'size_bytes':size,'server_version_num':server,
                  'pg_dump_version':version,'archive_listing_ok':True,'uploaded_bytes_verified':True,
                  'restore_tested':False,'excludes':['cluster global roles','external object/file storage'],
                  'elapsed_seconds':round(time.monotonic()-started,2)}
        marker=Path(directory)/(target.name+'.verified.json')
        marker.write_text(json.dumps(manifest,indent=2))
        client.upload(marker,marker.name,folder['id'],hashlib.sha256(marker.read_bytes()).hexdigest())
        print(json.dumps({'status':'verified_upload',**manifest,'folder_url':folder.get('webViewLink'),
                          'backup_url':obj.get('webViewLink'),'daily_schedule_active':False}),flush=True)

if __name__=='__main__':
    try:main()
    except BaseException:
        print(json.dumps({'status':'failed','reason':'trial incomplete; inspect private diagnostics, no automatic retry'}),flush=True)
        raise SystemExit(1)

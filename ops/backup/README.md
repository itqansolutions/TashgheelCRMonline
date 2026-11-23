# Daily backup, source preparation only

NOT ACTIVE. No Railway service, schedule, bucket, dependency image, notification integration or retention deletion is installed by this directory. Never attach its configuration to the existing CRM app or database start command. This branch is separate from HR migration preparation.

## Owner decisions needed

- Approve private durable destination and its account/security audience. Railway bucket is proposed, not created. Same-account deletion or outage remains a risk; preserve the owner's local backup.
- Approve initial metered measurement before ongoing activation. No backup-only dollar cap has been verified. Workspace hard caps stop all shared workloads. Never silently change one.
- Proposed time:03:00 Africa/Cairo. Railway cron is UTC. Need timezone-safe scheduler design/testing, including daylight-saving transition cases. No cron is included here.
- Proposed retention:30 SUCCESSFUL verified copies, not30 elapsed days. Delete oldest matching daily copies only after newer verified success, never delete the last verified copy or touch owner's local copy. Retention is not implemented in this preparation.
- Approved maximum dump bytes and runtime/resource safeguards. The observed46MB database size does not establish the dump's actual bytes or runtime.
- Failure notification destination and independent missed-success heartbeat monitor. Railway deployment crash notifications alone miss jobs that never start. No WhatsApp/email send route or new external account assumed.
- Approve handling a backup in an isolated restore-test environment. Archive listing and byte verification are not restore proof. No production restore or HR migration approval follows from this backup request.
- Approve necessary runtime credential placement. No new DB role or grant is created. Dedicated least-privilege credentials are preferred but require their own approval. Do not paste secrets in chat or source.

## Prepared behavior

The Python source is inert unless explicitly activated with complete configuration. It uses libpq password-file permissions0600, no password in process command-line arguments, read-only DB sessions, a lock wait timeout, a full custom archive, archive listing, a unique timestamp object key, metadata length and a read-back SHA256 check. No multipart-ETag-as-MD5 assumption. It publishes a metadata-only verified marker after byte verification, never prints dump contents or credentials. Temporary files are cleaned on normal success/failure. No overwrite or delete call exists. All fixtures are synthetic.

## Work still required before production

- Verify actual PostgreSQL SERVER major and use matching supported client tools. Earlier client banner18.6 is not itself server-version evidence.
- Freeze/verify container image and Python/S3 dependencies, install a real whole-process timeout including startup and uploads, set restart policy NEVER for cron, and verify resource limits on actual account. Current subprocess timeouts do not bound the complete process.
- Implement/test retention after approval, including malicious/unrelated object keys, failed/corrupt uploads, insufficient storage, delayed listing and preservation of last verified copy. Active indefinite retention is not an acceptable substitute for the proposed30-copy policy.
- Implement DST-aware triggering/deduplication and define exact tolerance. Do not schedule both UTC candidates then dump twice. Ensure daily success marker, first-run handling and concurrent-run behavior.
- Implement explicit CA policy for database/public object connections. Private DB transport may be approved with Railway WireGuard. Public DB connections need certificate verification policy; never infer TLS from a URL name.
- Add independent missing-success notification, verified recipient, approved sending identity and no secret/dump content in messages. Test without exposing real backup data.
- Add server/client versions, recovery dependency metadata, extension list and backup consistency requirements. Do not silently export role password hashes/global security objects. Database dump excludes external file/object storage.
- Real controlled first export and isolated restore test require authority, a destination and measured cost. Test catalog/table counts/constraints and app read smoke without logging customer rows. Do not run untrusted dump SQL on a privileged network-connected host.
- Separate grant needed for deleting old production backups or changing credentials/roles/settings outside the final approved plan.

## Tests

Run `python3 -m unittest discover -s ops/backup -p 'test_*.py' -v`.

No customer or production database is contacted by tests. Tests cover inactive/missing configuration, scope/transport/size gates, secret handling, corrupt upload, safe errors, complete synthetic success, archive-failure no-upload, byte limit no-upload and unique copies. These tests do not establish production readiness, vendor durability, whole-process timeout, retention, scheduling, alert delivery or restore success.

## Sources

- https://docs.railway.com/cron-jobs
- https://docs.railway.com/storage-buckets
- https://docs.railway.com/storage-buckets/billing
- https://docs.railway.com/pricing/plans
- https://docs.railway.com/pricing/cost-control
- https://docs.railway.com/networking/private-networking/how-it-works
- https://docs.railway.com/observability/webhooks
- https://docs.railway.com/deployments/deployment-actions
- https://www.postgresql.org/docs/18/app-pgdump.html
- https://www.postgresql.org/docs/18/app-pgrestore.html

## 2026-11-23 one-trial revision, NOT DEPLOYED

Owner chose personal Google Drive, not Railway bucket storage. Owner authorized a
restricted drive.file offline grant and ONE measured Railway trial within a $1
operational stop/report budget, not an enforceable invoice ceiling. No daily
activation or retention deletion is authorized. Original S3 adapter remains
preparation only and is not the selected destination.

`trial.py` plus `drive.py` prepare that finite run: PostgreSQL18 clients, explicit
private-network DB reference, read-only transaction default, 256MiB maximum file
size,150-second dump timeout, archive listing, new private app-created Drive
folder, unique archive upload, full readback SHA256 comparison, and a verified
manifest with restore_tested:false. It excludes cluster roles and external file
storage. No delete, permissions/share, schedule, migration or restore operation.
`Dockerfile` overrides the inherited database entrypoint with GNU timeout300s
plus5s kill grace. It never runs a PostgreSQL server. The upstream Postgres image
is digest-pinned; OS Python/CA packages still come from signed Debian apt sources
at build time. Final build/tool/runtime evidence remains to be obtained.

Before the single deploy, inspect the actual Railway worker settings: no cron,
restart NEVER,1CPU/0.5GB ceilings where supported, exact branch/root/Dockerfile,
private DATABASE_URL reference, masked OAuth JSON variable and no auto-deploy.
Nothing goes on the production app or DB start command. A crash must not retry
or remain idle. Verify the deployment stopped after completion/failure. Measure
actual runtime, archive bytes and available provider usage, with attribution
limits for shared DB work. Do not claim invoice-level isolation.

The current External Testing grant is suitable for the trial, not proven
permanent daily credentials. Token expiration/readiness, retention, missing-success
monitoring, restore proof and daily scheduler require further work before any
claim of reliable daily backup. Secrets must never enter Git, artifact reports,
console exception traces or ordinary messages.

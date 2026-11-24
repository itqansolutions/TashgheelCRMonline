# Customer-number onboarding release

Base commit:73143058e7c6255cd2f350f5a15897e3ab6f9b85
Private source only. No production migration, deployment, configuration or Meta activation performed.

## Scope
Buyer administrators can begin Embedded Signup, authorize their number, inspect the server-verified number and confirm its exact tenant/branch claim. Supports multiple numbers per buyer; never silently takes a number from another tenant. Existing legacy identities require reconciliation, not automatic adoption. Explicit cancel, expiry and pending-subscription resume are included.

Bot, automated CRM creation, bot handoff, lifecycle revocation automation, old history import and address-book import are deferred. Both bot entry points decline verified-path execution. No private bot-turn/customer-review/lifecycle extension tables or workers are included. Current-phone inbound durable capture/projection and exact sender safety dependencies remain because enabling verified ownership must not revive legacy unsafe writers or ambiguous sender selection.

## Before any live effect
1. Independent source/test review of this exact archive.
2. Approve executing core install once on the bound production database, after fresh collision/count-only preflight and verified recovery backup. Entry:services/whatsappOwnershipInstaller.js install({pool,schemaDirectory:'ops/proposals'}). Transactional additive DDL, no backfill or data deletion. Repeat rejects drift. Source schema role is postgres superuser, not a least-privilege qualification.
3. Approve deployment of exact archive with flags OFF and webhook containment unchanged. Verify health/build without visiting mutation-capable pages.
4. Separately verify Meta app2276031913229045/config2589326388202465/Portfolio1066729752302533, provider/advanced permissions needed for third-party buyer signup, coexistence eligibility and webhook configuration. Supplied IDs are not provider attestation. Secret via secure configuration only.
5. Explicit config/activation approval: META_APP_ID, META_EMBEDDED_SIGNUP_CONFIG_ID, META_APP_SECRET; ENABLE_WHATSAPP_COEXISTENCE and WHATSAPP_VERIFIED_ONBOARDING. Independent WHATSAPP_VERIFIED_INBOUND_CAPTURE stays false until signed callback acceptance is approved. WHATSAPP_WEBHOOK_PROCESSING_SUSPENDED remains true until that separate approval. No bot/exclusive-turn flag.
6. Schedule expiry cleanup once per minute only at approved activation. ops/whatsapp/expire-previews.cjs does nothing before importing DB when feature OFF. Entry consume-inbound.cjs is one-shot up to20 ticks, not a supervised production consumer or a wall-clock bound. Production capture processing needs approved supervision and timeout/recovery monitoring. No provider replay.
7. Owner-controlled customer signup, exact branch/number confirmation and signed callback acceptance are required before describing onboarding as working. A local test or app-role/own-number success does not establish third-party market eligibility.

## Containment and rollback
Before disabling verified ownership after any live claim, suspend webhook processing and stop onboarding/expiry/consumer scheduling; do not fall through to legacy writers. Keep ownership guards and journal/inbox data. Binary rollback with verified flags turned off can re-enable unsafe legacy behavior and is NOT an approved rollback after claims exist. Any schema rollback requires a separate reviewed data-preserving plan. No DROP, delete, merge, reassign or automatic provider unsubscribe.

## Evidence
Complete production schema-only161tables restored to disposable exact PostgreSQL18.6, matching native extensions/functions/triggers and postgres role. Core first install/repeat/drift-refusal and dump/restore/fingerprint passed. No application rows copied. Actual JWT/auth/branch/subscription/router/runtime path with synthetic provider passed two numbers, foreign tenant denial, wrongapp proof denial, pending subscription recovery, stale JWT role denial, DB-error fail-closed and OFF denial. Real frontend production build passed; actual mounted page signup, cancel, lost-response recovery, branch late-response fences and18 session-coordinator tests passed. Real Meta delivery is untested. Local synthetic values are not real credentials or ownership attestations.

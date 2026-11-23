# Scoped contract convergence checkpoint, local only

This is NOT a release-ready whole-application contract. It replaces neither productionstartup nor current historicalbaseline yet. No live/env/deploy/workerchoice. Scope kept to core identity/context, event wiring, two known lazyDDL workers and narrow deletecapability.

Added offline candidate groups:
- core: auth user/tenant branchcontext/entitlements columns/types/nullability and primarykey structure.
- events: eventstore/outbox/activity/systemnotification persistence fields and primarykeys.
- activity-reminders: scanned activity/user/customer/deal+notification fields, PKs, due-reminderindex, advisorylock/unlock builtinfunctionavailability.
- contract-expiry: contract/deal/recipient/notification fields and PKs.
- warehouse-delete remains separate14column structuralcapability, not globalacceptance.

Group checks use READONLY catalogs; compare constraintstructure not names for PKs; check required omitted id/created_at defaults presence; proposed trigger/RLS presence requires review and failsclosed. Indexdefinition comparison still pins names inside SQLtext and can overreject equivalence. Defaultpresence is not exactdefaultexpression safety. Requiredfunctions are PostgreSQLbuiltinfunctions used by activityscanner, no customfunction invented. No allroutes completenessclaim.

Local workerpath changes replace activity/contract ensureDDLhelpers with validateGroup. Empty/missing syntheticcatalog probes now produce noDDL and stopscan, not successful dueprocessing. Missing prerequisites logged by existing scannererrorhandling; no rowmutations attempted. These are candidatechanges, not fullpreservemodecertification. Need actualschemafixture groupchecks and populateddueworkflow simulation with blockedexternalprovider before readiness; no authorization to send followsfromfixture.

Next finite acceptance set:
1. Complete actual core/event/twoscanner group validations on sanitizedstructuralfixture with reviewed defaults/PKs/indexes, and missingprereqnegativecases.
2. Simulate two dueworker paths end-to-end on syntheticrows, assert same notification/marking semantics and noDDL; provider calls intercepted.
3. Explicitly list remaining preserveworkers task/SLA/reservation/outbox/notification contracts and decide if supportseparategates is needed. Do not pretend these fourgroups certify all modules or ordinaryinboundwrites.
4. Independentreview then ownerworkerdecision: resume ordinarybackgroundwork vs temporarypause with deferredexpiry/reminders/delivery/backlog and explicitresumption. No broadmaintenanceauthorization.

Lifecyclelimits unchanged: synchronousstartercapture, not callbackspawnedtimer/drain/generalrollback. Boundpoolcleanupdeadline/listenercounterparthandlercleanup fixed. Fixture attachment generated empty structuralSQL, no rowdata/secrets/defaultfunctions/transcripts.

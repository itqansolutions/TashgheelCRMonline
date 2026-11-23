# Local startup revision2 status

NOT READY for production. No live/config/deploy, no worker decision inferred.

Fixed independently identified lifecycle defects locally:
- Await actual listener listening/error, not app.listen return.
- Capture and clear every synchronously registered legacy worker timer if partial starter failure or listenerbind failure; successful runtime exposes stopRuntime for timer+listener shutdown.
- Startup failure cleanup closes DB then explicit process.exit1, not exitCode under global swallow handlers. Testchild intercepts exit only to inspect failure, productioncandidate does not.
- Actualboot test requires explicit LOCAL_SCHEMA_ARCHIVE and LOCAL_PG_RESTORE; no private hardcoded archive/client paths orDATABASE_URLfallback. Dependency path also explicit.
- Unit realHTTP lifecycle test proves partial worker failure andEADDRINUSE clear timers, no callbackfired; actualserver schema-only boot still passes both explicitmodes with timers captured and network/writeguard.

Remaining lifecycle caveat: timerhandle capture wrapsglobal timers while legacy synchronousstarters run. This is a localcandidate compatibilityshim, not ideal durable workerlifecycle design. Internal isRunning/timer singleton flags not reset after failure, but process terminates deterministically. Before retries in-process are allowed, explicit worker stop/start handles should replace capture. No backgroundcallback executed during boot test.

Narrow prerequisite work:
startup/contracts/warehouse-delete.json plus readonly validator covers ONLY narrowdeletecapability.17columns withtype/nullability, requiredPK/keeperuniqueness/warehouseFKs and purchase/stockdependencyFKs plus supportinguniqueindexes. No applicationSQLfunction is invoked by that handler, so no invented function requirement. Actual isolated restore passes; droppedpurchaseFK or keeperuniqueconstraint fails without repair. NOT wired as whole-app readiness, excludes auth/tenant/branch/global/runtime/otherfeature requirements. Broad1955columnbaseline remains quarantined in originalstartupcandidate and is NOTfinalappcontract. Replacing it with a small core+enabledfeaturecontract requires reviewing those source prerequisites, not guessing allfeaturesready from deletion.

Workerhelper audit:
Intercepted actual scan functions with syntheticemptyresults, granted syntheticadvisorylock: activityreminder emitsDDL even with no due rows(18queries), contractexpiry emitsDDL even with no rows(7queries). taskoverdue/reservation empty scans execute onlySELECT, but nonemptybusinesspaths mutate/dispatch. No network or SQL executed by these probes. Notificationdispatcher enqueuesWhatsApp only when recipientphone/rulespermit; worker can sendqueuedjobs; dryrun itself still writesjob/logstate. No historicalsend evidence inferred.

Thus preserve-existing cannot be called no-migration until activity/contracthelpers are replaced with readonlyprerequisitechecks in worker paths, plus dependencycontracts reviewed. Pausedmaintenance leaves ordinaryinbound/event-drivenwrites active. Exact ownerdecision remains workerresume versus time-boundedpause/backlogresumptionplan AFTER architecture/contractreview, not approval for legacymaintenance. Main owns decision, no default selected.

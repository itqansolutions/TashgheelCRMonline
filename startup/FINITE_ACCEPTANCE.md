# Existing-worker finite acceptance checkpoint

Local only. No worker mode selected, no live/config/deploy. Preserve-mode proposal is not yet a production-ready contract.

Actual isolatedSQL now covers:
- core/events/activity/contract and directly used existing-background-worker table-local contract. Requiredcolumns/types/nullability,PKstructure, id/created_at defaultpresence, dueindex/dedupindex, advisorybuiltinavailability, RLS/triggerhold. Existingworker group conservatively includes all columns of16direct worker tables, not global1955columnsnapshot. It is still overbroad within those tables and not allroute certification.
- Populatedreservationexpiry releases reservedunit, transitions reserveddeal to negotiation, not lost, writes log, noDDL.
- DealSLA overdue cycle writes confirmednotificationmarkers and samecycle deduplicates.
- Taskoverdue actualdispatcher persistsinapp and capturesWhatsAppqueue, secondscan deduplicates.
- Outbox pendingevent routes to intercepted eventBus publication and markspublished. Transitive arbitraryeventsubscriber execution intentionallyblocked, not certified.
- Existing queue regression passes invalidrecipient/disabledrule/channel/dedup/atomicjob+log failure rollback, providerhelperstubbed.
- Existing notificationworker regression passes concurrentclaim onecompletion, stubbedproviderfailure/backoff/maxattempts. No real sends; dryrunstatewrites only in syntheticDB.
- Two previous lazyDDLworkers nowreadonlyprerequisites; populatedactivity realinapp/queueboundary/marking/retry/no-repeat pass. Contractworker localfix now honors notificationnullfailure, leavingbothflagsNULL, then retries. Prior claim contractconfirmedmarking was wrong for oldcode; newfix separate meaningfulbehaviorcorrection. Concurrentcontractscans/partialrecipientfailure can still duplicate deliverednotices, noexactlyonceclaim.

Irreducible bounded safety/decision gap:
1. Preserving ordinary workers necessarily permits queuednotifications/messages and domainwrites. It cannot satisfy a literal no-real-message/no-business-write observation period. Owner must choose ordinaryworkerresume on restart with existingrules vs explicittemporarypause/deferredexpiry/reminders/delivery/backlogresumptionplan. Neitherchosen.
2. Outbox arbitrarypendingevent types invoke subscriber logic across domains. Fully certifying everypayload/subscriber is materially wider than startupguard. Currentnetwork/timercapture+interceptedeventpublication proves no unintendedbootcalls, not futurequeue safety. Don't ask broad consent for unknownjobs or inspectliveprivatequeuewithoutscope.
3. Current serving still pins broadschema-baseline. Core+worker+delete groups are not fullrequestfeaturecontracts and cannot honestly replace it as readinessfor all existingAPIroutes. To converge without allprojectrewrite: readiness should be scoped (databaseconnectivity + declaredcapabilities), unknown/unvalidatedcapabilities return unavailable at guard; that changes ordinaryavailablefeatures and requires productdecision. Alternatively preserve ordinaryroute behavior and call readiness onlystartup/core, expresslynot fullschemaacceptance, with existinglazyDDLrequestpaths stillknown. No silentfeaturegating.
4. Local indexnormalization strips casts/parentheses to absorb18.6/18.7deparser; potentialoverbroad equivalence acceptance needs independentreview. Defaults onlypresence, not exactsemantics. Trigger/RLSheld, not automaticallydisabled.
5. Synchronousstartertimercapture does not stopcallbackspawnedtimers ordrain inflightwork. No graceful/generalrollbackguarantee. Missingprereq beforelisten/workeractivation is tested; failureaftercallbackstarts is broadernormalruntime lifecycle.

Recommendation: stop adding prototypegroups, get architectural decision on scopedstartupreadiness vs per-featuregating and ownerworkerpolicy. Narrowdeletefix remains independentlyready but cannot be deployed under current strictnoeffectsrestartguard. Existinglive untouched and deleteavoidancewarning remains.

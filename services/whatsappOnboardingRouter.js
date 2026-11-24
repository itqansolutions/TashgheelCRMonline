'use strict';
// Candidate route factory. Dedicated permission, not generic screen-PBAC fallback.
// It exposes only prepared workflow operations and performs no schema helpers.
function createOnboardingRouter({ express, workflow, enabled, pool }) {
 const router=express.Router();
 router.use((req,res,next)=>{
   if(!req.user?.tenant_id || !req.user?.id) return res.status(401).json({code:'AUTHENTICATION_REQUIRED'});
   if(req.user.role!=='admin') return res.status(403).json({code:'INTEGRATION_ADMIN_REQUIRED'});
   if(!enabled()) return res.status(403).json({code:'COEXISTENCE_FEATURE_DISABLED'});
   next();
 });
 // This boundary revalidates principal in the database. Global auth's legacy
 // cached/fail-open lookups cannot authorize a new number claim.
 router.use(async(req,res,next)=>{
  try{
   if(!pool)throw Error('ONBOARDING_PRINCIPAL_DB_REQUIRED');
   const result=await pool.query(`SELECT u.role,u.is_working,t.status FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id::text=$1 AND u.tenant_id::text=$2`,[String(req.user.id),String(req.user.tenant_id)]);
   const principal=result.rows[0];
   if(result.rowCount!==1||principal.role!=='admin'||principal.is_working!==true||principal.status!=='active')return res.status(403).json({code:'ONBOARDING_PRINCIPAL_REJECTED'});
   if(!req.branchId)return res.status(403).json({code:'ONBOARDING_BRANCH_REQUIRED'});
   const branch=await pool.query('SELECT id FROM branches WHERE id::text=$1 AND tenant_id::text=$2',[String(req.branchId),String(req.user.tenant_id)]);
   if(branch.rowCount!==1)return res.status(403).json({code:'ONBOARDING_BRANCH_REJECTED'});
   next();
  }catch{return res.status(503).json({code:'ONBOARDING_AUTHORIZATION_UNAVAILABLE'});}
 });
 const context=req=>({tenantId:String(req.user.tenant_id),userId:String(req.user.id),branchId:req.branchId ? String(req.branchId):null});
 const handler=fn=>async(req,res)=>{try{res.json({status:'success',data:await fn(req)});}catch(e){
   // No raw provider message, token, code or DB error is sent to the browser.
   const code=/CONTEXT|BRANCH|AUTHORIZED/.test(e.message)?'ONBOARDING_CONTEXT_REJECTED':/PHONE_RESERVED|EXISTING_ACCOUNT/.test(e.message)?'PHONE_REQUIRES_RECONCILIATION':/SUBSCRIPTION/.test(e.message)?'ONBOARDING_PENDING':'ONBOARDING_NOT_COMPLETED';
   res.status(code==='PHONE_REQUIRES_RECONCILIATION'?409:400).json({status:'error',code});
 }};
 router.get('/attempts/:id',handler(req=>workflow.status({...context(req),attemptId:req.params.id})));
 router.post('/attempts',handler(req=>workflow.begin({...context(req),appId:req.body.app_id,configId:req.body.config_id})));
 router.post('/attempts/:id/complete',handler(req=>workflow.complete({...context(req),attemptId:req.params.id,code:req.body.code,phoneId:req.body.phone_number_id,wabaId:req.body.waba_id})));
 router.post('/attempts/:id/confirm',handler(req=>workflow.confirm({...context(req),attemptId:req.params.id,phoneId:req.body.phone_number_id})));
 router.post('/attempts/:id/cancel',handler(req=>workflow.cancel({...context(req),attemptId:req.params.id})));
 router.post('/attempts/:id/resume',handler(req=>workflow.resume({...context(req),attemptId:req.params.id})));
 return router;
}
module.exports={createOnboardingRouter};

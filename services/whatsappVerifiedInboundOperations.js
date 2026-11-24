'use strict';
// Read-only operational view. No raw payload, message body, phone, token, BSUID
// or provider error text is exposed. No schema helpers or implicit retries.
function createInboundOperations({pool}){
 return async function inspect({tenantId,branchId,accountId}){
  if(!tenantId||!branchId||!Number.isSafeInteger(Number(accountId)))throw Error('OPERATIONS_CONTEXT_REQUIRED');
  const client=await pool.connect();
  try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await client.query("SET LOCAL lock_timeout='2s'");await client.query("SET LOCAL statement_timeout='5s'");
  const owned=await client.query('SELECT a.id,c.generation,c.app_id,c.waba_id FROM whatsapp_accounts a JOIN whatsapp_phone_claims c ON c.phone_number_id=a.phone_number_id AND c.tenant_id=a.tenant_id JOIN branches b ON b.id::text=a.branch_id AND b.tenant_id=a.tenant_id WHERE a.id=$1 AND a.tenant_id=$2 AND a.branch_id=$3 FOR SHARE OF a,c,b',[Number(accountId),tenantId,branchId]);
  if(owned.rowCount!==1)throw Error('OPERATIONS_CONTEXT_REJECTED');
  const binding=owned.rows[0];
  const queue=await client.query('SELECT state,count(*)::int AS count,min(created_at) AS oldest_at FROM whatsapp_verified_event_work WHERE tenant_id=$1 AND account_id=$2 AND branch_id=$3 GROUP BY state ORDER BY state',[tenantId,Number(accountId),branchId]);
  const review=await client.query("SELECT id,state,attempts,created_at,available_at,CASE WHEN error_code='STATUS_AWAITING_EXACT_OUTBOUND_TARGET' THEN 'awaiting_outbound_target' WHEN state='quarantined' THEN 'manual_review_required' ELSE 'processing' END AS reason FROM whatsapp_verified_event_work WHERE tenant_id=$1 AND account_id=$2 AND branch_id=$3 AND (state='quarantined' OR error_code IS NOT NULL) ORDER BY id DESC LIMIT 50",[tenantId,Number(accountId),branchId]);
  const contacts=await client.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE is_removed)::int AS removed FROM whatsapp_verified_contact_state WHERE tenant_id=$1 AND account_id=$2 AND branch_id=$3 AND claim_generation=$4 AND app_id=$5 AND waba_id=$6',[tenantId,Number(accountId),branchId,binding.generation,binding.app_id,binding.waba_id]);
  // Captured operations hold historical attribution only. Authorization comes
  // from current account/owned branch above, never payload-provided tenant IDs.
  const inboxScope=[tenantId,Number(accountId),branchId];
  const inbox=await client.query(`SELECT i.state,count(*)::int AS count,min(i.created_at) AS oldest_at FROM whatsapp_verified_webhook_inbox i WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(i.operations) op WHERE op->>'tenantId'=$1 AND op->>'accountId'=$2::text AND op->>'branchId'=$3) GROUP BY i.state ORDER BY i.state`,inboxScope);
  const inboxReview=await client.query(`SELECT i.id,i.state,i.created_at,CASE WHEN i.quarantine_reason IN ('INBOX_SCHEMA_UNSUPPORTED','OPERATION_SCHEMA_UNSUPPORTED','TARGET_CONTEXT_CHANGED','EVENT_IDENTITY_CONFLICT') THEN i.quarantine_reason ELSE 'MANUAL_REVIEW_REQUIRED' END AS reason FROM whatsapp_verified_webhook_inbox i WHERE i.state='quarantined' AND EXISTS(SELECT 1 FROM jsonb_array_elements(i.operations) op WHERE op->>'tenantId'=$1 AND op->>'accountId'=$2::text AND op->>'branchId'=$3) ORDER BY i.id DESC LIMIT 50`,inboxScope);
  let botTurns={available:false,states:[],review:[]};
  const installed=await client.query("SELECT to_regclass('public.whatsapp_verified_bot_turns') IS NOT NULL AS available");
  if(installed.rows[0].available){
   const states=await client.query('SELECT state,count(*)::int AS count FROM whatsapp_verified_bot_turns WHERE tenant_id=$1 AND account_id=$2 AND branch_id=$3 GROUP BY state ORDER BY state',inboxScope);
   const turns=await client.query("SELECT t.id,t.state,t.journal_id,t.created_at,(j.state IN ('accepted','mirrored') AND t.state='review') AS can_finalize_accepted,CASE WHEN t.state='dispatching' THEN 'BOT_DISPATCH_OUTCOME_REQUIRES_REVIEW' ELSE 'BOT_TURN_MANUAL_REVIEW' END AS reason FROM whatsapp_verified_bot_turns t JOIN whatsapp_delivery_journal j ON j.id=t.journal_id WHERE t.tenant_id=$1 AND t.account_id=$2 AND t.branch_id=$3 AND t.state<>'applied' ORDER BY t.created_at DESC LIMIT 50",inboxScope);
   botTurns={available:true,states:states.rows,review:turns.rows};
  }
  await client.query('COMMIT');
  return{accountId:Number(accountId),botTurns,queue:queue.rows,review:review.rows,inbox:inbox.rows,inboxReview:inboxReview.rows,capturedAuthorityIsHistorical:true,contacts:contacts.rows[0],reviewReadOnly:true,automaticProviderReplay:false};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 };
}
function createInboundOperationsRouter({express,pool,enabled}){
 const router=express.Router();
 router.get('/accounts/:id',async(req,res)=>{
  if(!req.user?.tenant_id||!req.user?.id)return res.status(401).json({code:'AUTHENTICATION_REQUIRED'});
  if(req.user.role!=='admin')return res.status(403).json({code:'INTEGRATION_ADMIN_REQUIRED'});
  if(!enabled())return res.status(403).json({code:'VERIFIED_OPERATIONS_DISABLED'});
  if(!req.branchId)return res.status(400).json({code:'EXACT_BRANCH_REQUIRED'});
  try{return res.json({status:'success',data:await createInboundOperations({pool})({tenantId:String(req.user.tenant_id),branchId:String(req.branchId),accountId:req.params.id})});}
  catch{return res.status(400).json({code:'OPERATIONS_NOT_AVAILABLE'});}
 });
 return router;
}
module.exports={createInboundOperations,createInboundOperationsRouter};

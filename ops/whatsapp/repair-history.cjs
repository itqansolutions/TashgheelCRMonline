'use strict';
// History only. No provider sender is imported. Schedule only after approval,
// schema installation and operational monitoring are verified.
(async()=>{
 const db=require('../../config/db');
 try{
  if(process.env.WHATSAPP_VERIFIED_ONBOARDING!=='true')return;
  const mirror=require('../../services/whatsappVerifiedMessageMirror').createVerifiedMessageMirror({pool:db.pool});
  const {repair}=require('../../services/whatsappVerifiedDelivery').createVerifiedDelivery({pool:db.pool,mirror});
  const rows=await db.query("SELECT j.id FROM whatsapp_delivery_journal j WHERE state='accepted' OR (state='mirrored' AND EXISTS(SELECT 1 FROM notification_jobs n WHERE n.id::text=j.mirror_context->>'notificationJobId' AND n.tenant_id=j.tenant_id AND n.error_message='HISTORY_PENDING journal='||j.id::text||'; provider accepted, never resend.')) ORDER BY created_at LIMIT 100");
  let repaired=0,pending=0;
  for(const row of rows.rows){try{await repair(row.id);repaired++;}catch{pending++;}}
  const unresolved=await db.query("SELECT count(*)::int n FROM whatsapp_delivery_journal WHERE state IN ('prepared','unknown')");
  console.log(JSON.stringify({repaired,pending,unknownOrInterrupted:unresolved.rows[0].n}));
  if(pending||unresolved.rows[0].n)process.exitCode=2;
 }finally{await db.pool.end();}
})().catch(()=>{console.error('WhatsApp history-only repair failed');process.exitCode=1;});

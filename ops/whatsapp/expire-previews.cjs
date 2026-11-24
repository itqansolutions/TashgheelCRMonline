'use strict';
// Deployment must explicitly schedule this once per minute when verified
// onboarding is enabled. Temporary token retention bound: attempt TTL (5m) +
// cadence (1m) + runtime delay. Never deletes audit/history or releases claims.
// No schedule is installed by this file. Run only after reviewed migration.
(async()=>{
 if(process.env.WHATSAPP_VERIFIED_ONBOARDING!=='true')return;
 const db=require('../../config/db');
 try{
  if(process.env.WHATSAPP_VERIFIED_ONBOARDING!=='true')return;
  const result=await db.query("UPDATE whatsapp_onboarding_attempts SET preview_token=NULL,status=CASE WHEN status IN ('open','processing','preview') THEN 'expired' ELSE status END WHERE expires_at<=now() AND (preview_token IS NOT NULL OR status IN ('open','processing','preview')) RETURNING id");
  console.log(JSON.stringify({expiredPreviewCredentialsCleared:result.rowCount}));
 }finally{await db.pool.end();}
})().catch(()=>{console.error('WhatsApp preview credential cleanup failed');process.exitCode=1;});

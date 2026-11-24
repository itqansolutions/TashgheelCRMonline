'use strict';
// Transport-format policy only: callers already supply an international address.
// The optional leading plus is not part of the provider's digits identity. Do
// not infer country codes, trim punctuation, map BSUIDs or merge customer rows.
function canonicalPhone(value){
 if(typeof value!=='string'||!/^\+?\d{1,50}$/.test(value))throw Error('PHONE_TRANSPORT_FORMAT_INVALID');
 return value.replace(/^\+/,'');
}
async function findPhoneConversation({client,tenantId,accountId,branchId,phone}){
 const canonical=canonicalPhone(phone);
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['wa-mirror',tenantId,accountId,canonical])]);
 const r=await client.query('SELECT id,branch_id,phone_number FROM whatsapp_conversations WHERE tenant_id=$1 AND account_id=$2 AND phone_number=ANY($3::text[]) ORDER BY id FOR UPDATE',[tenantId,accountId,[canonical,'+'+canonical]]);
 // A single historical alias may be reused without rewriting its phone,
 // customer or history. Two rows are ambiguous: never pick one or merge them.
 if(r.rowCount>1)throw Error('PHONE_ALIAS_RECONCILIATION_REQUIRED');
 if(r.rowCount===1&&r.rows[0].branch_id!==branchId)throw Error('PHONE_ALIAS_BRANCH_CONTEXT_CONFLICT_REQUIRES_RECONCILIATION');
 return{phone:canonical,conversation:r.rows[0]||null};
}
module.exports={canonicalPhone,findPhoneConversation};

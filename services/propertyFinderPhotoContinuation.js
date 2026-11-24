'use strict';
const store=require('./propertyFinderPhotoStorage');
// Explicit authenticated continuation only. No listing/lead/settings edits or jobs.
async function continuePhotos({pool,tenantId,cursor='',download}){
 if(!tenantId||typeof cursor!=='string'||cursor.length>100)throw Error('INVALID_PHOTO_CONTEXT');
 const r=await pool.query(`SELECT p.external_listing_id,p.unit_id,p.last_payload_snapshot FROM property_finder_listing_mappings p JOIN re_units u ON u.id=p.unit_id AND u.tenant_id::text=p.tenant_id::text WHERE p.tenant_id::text=$1::text AND p.external_listing_id>$2 ORDER BY p.external_listing_id LIMIT 1`,[String(tenantId),cursor]);
 if(!r.rows.length)return{done:true,cursor,photos:null};
 const row=r.rows[0],budget=store.createBudget();budget.deadline=Date.now()+20000;
 const photos=await store.persistListingPhotos({pool,tenantId,unitId:row.unit_id,listingId:row.external_listing_id,payload:row.last_payload_snapshot,budget,...(download?{download}:{})});
 // At20retainedphotos the gallery cap, not retryable admission deadline, is reached.
 const count=await pool.query("SELECT count(*)::int n FROM attachments WHERE tenant_id::text=$1 AND linked_id=$2 AND linked_type='pf_unit_private'",[String(tenantId),String(row.unit_id)]);
 const retry=photos.retryablePending>0&&count.rows[0].n<store.MAX_IMAGES_PER_UNIT&&photos.errors.length===0;
 return{done:false,cursor:retry||photos.errors.length?cursor:row.external_listing_id,retry,listingId:row.external_listing_id,photos};
}
module.exports={continuePhotos};

'use strict';
const https=require('node:https'),dns=require('node:dns').promises,crypto=require('node:crypto'),ipaddr=require('ipaddr.js');
const {extractPhotos,safeImageUrl}=require('./propertyFinderPhotos');
const MAX_IMAGE_BYTES=5*1024*1024,MAX_RUN_BYTES=100*1024*1024,MAX_IMAGES_PER_UNIT=20,LINK_TYPE='pf_unit_private';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function publicAddress(address){try{const ip=ipaddr.process(address);return ip.range()==='unicast';}catch{return false}}
function rasterType(bytes){
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR')return'image/png';
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return'image/webp';
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217)return'image/jpeg';
 return null;
}
// HTTPS only, pinned public DNS address, no redirects/cookies/provider credentials.
async function downloadImage(value,{lookup=dns.lookup,request=https.request,maxBytes=MAX_IMAGE_BYTES,timeoutMs=12000}={}){
 const safe=safeImageUrl(value);if(!safe)throw Error('UNSAFE_IMAGE_URL');const url=new URL(safe);
 const addresses=await Promise.race([lookup(url.hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('IMAGE_DNS_TIMEOUT')),3000);t.unref();})]);
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('IMAGE_ADDRESS_NOT_PUBLIC');
 const target=addresses[0];
 return new Promise((resolve,reject)=>{
  let settled=false,req;const end=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){req?.destroy();reject(error);}else resolve(value)};
  const timer=setTimeout(()=>end(Error('IMAGE_TIMEOUT')),timeoutMs);timer.unref();
  req=request(url,{method:'GET',agent:false,lookup:(_host,opts,cb)=>{if(opts?.all)cb(null,[target]);else cb(null,target.address,target.family)},headers:{Accept:'image/jpeg,image/png,image/webp','Accept-Encoding':'identity','User-Agent':'Tashgheel-PhotoImport/1.0'}},res=>{
   if(res.statusCode!==200){res.resume();return end(Error(res.statusCode>=300&&res.statusCode<400?'IMAGE_REDIRECT_REJECTED':'IMAGE_HTTP_'+res.statusCode));}
   if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.resume();return end(Error('IMAGE_ENCODING_REJECTED'));}
   if(Number(res.headers['content-length'])>maxBytes){res.resume();return end(Error('IMAGE_TOO_LARGE'));}
   let n=0;const chunks=[];res.on('data',b=>{n+=b.length;if(n>maxBytes){res.destroy();return end(Error('IMAGE_TOO_LARGE'))}chunks.push(b)});
   res.on('error',()=>end(Error('IMAGE_STREAM_FAILED')));res.on('aborted',()=>end(Error('IMAGE_STREAM_ABORTED')));
   res.on('end',()=>{if(settled)return;const bytes=Buffer.concat(chunks),mime=rasterType(bytes),header=String(res.headers['content-type']||'').split(';')[0].trim().toLowerCase();if(!mime||header!==mime)return end(Error('IMAGE_TYPE_MISMATCH'));end(null,{bytes,mime});});
  });req.on('error',()=>end(Error('IMAGE_FETCH_FAILED')));req.end();
 });
}
function createBudget(maxBytes=MAX_RUN_BYTES){if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>MAX_RUN_BYTES)throw Error('INVALID_PHOTO_BUDGET');return{remaining:maxBytes,downloadedBytes:0,attempts:0,deadline:Date.now()+60000};}
// All writes are explicit import work, never triggered by a GET or page render.
async function persistListingPhotos({pool,tenantId,unitId,listingId,payload,budget=createBudget(),download=downloadImage}){
 if(!tenantId||!unitId||!listingId)throw Error('PHOTO_CONTEXT_REQUIRED');
 const summary={available:0,saved:0,duplicates:0,pending:0,downloadedBytes:0,errors:[]};
 const refs=extractPhotos(payload);summary.available=refs.length;
 const own=await pool.query('SELECT u.id FROM re_units u JOIN property_finder_listing_mappings p ON p.unit_id=u.id AND p.tenant_id::text=u.tenant_id::text WHERE u.id::text=$1::text AND u.tenant_id::text=$2::text AND p.external_listing_id=$3',[String(unitId),String(tenantId),String(listingId)]);
 if(!own.rows.length)throw Error('PHOTO_MAPPING_NOT_AUTHORIZED');
 for(let i=0;i<refs.length;i++){
  if(i>=MAX_IMAGES_PER_UNIT||budget.remaining<1||budget.attempts>=100||Date.now()>budget.deadline){summary.pending++;continue;}
  const source=hash(refs[i].url).slice(0,32),prefix='pf-'+source+'-';
  const prev=await pool.query('SELECT id FROM attachments WHERE tenant_id::text=$1::text AND linked_type=$2 AND linked_id=$3 AND filename LIKE $4 LIMIT 1',[String(tenantId),LINK_TYPE,String(unitId),prefix+'%']);
  if(prev.rows.length){summary.duplicates++;continue;}
  try{
   // Reserve worst case before fetch; don't run parallel requests against one budget.
   const remaining=Math.min(MAX_IMAGE_BYTES,budget.remaining);budget.remaining-=remaining;budget.attempts++;
   const image=await download(refs[i].url,{maxBytes:remaining});
   if(!Buffer.isBuffer(image.bytes)||image.bytes.length>remaining||rasterType(image.bytes)!==image.mime)throw Error('IMAGE_VALIDATION_FAILED');
   budget.remaining+=remaining-image.bytes.length;budget.downloadedBytes+=image.bytes.length;summary.downloadedBytes+=image.bytes.length;
   const content=hash(image.bytes),suffix='-'+content+'.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[image.mime]);const filename=prefix+content+'.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[image.mime]);
   const client=await pool.connect();try{
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='3000ms'");
    await client.query("SET LOCAL statement_timeout='5000ms'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='10000ms'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['pf-photo:'+tenantId]);
    const check=await client.query('SELECT u.id,u.branch_id FROM re_units u JOIN property_finder_listing_mappings p ON p.unit_id=u.id AND p.tenant_id::text=u.tenant_id::text WHERE u.id::text=$1::text AND u.tenant_id::text=$2::text AND p.external_listing_id=$3 FOR UPDATE OF u,p',[String(unitId),String(tenantId),String(listingId)]);
    if(!check.rows.length)throw Error('PHOTO_MAPPING_CHANGED');
    const duplicate=await client.query('SELECT id FROM attachments WHERE tenant_id::text=$1::text AND linked_type=$2 AND linked_id=$3 AND (filename LIKE $4 OR filename LIKE $5) LIMIT 1',[String(tenantId),LINK_TYPE,String(unitId),prefix+'%','%'+suffix]);
    if(duplicate.rows.length)summary.duplicates++;
    else {
    const unitCount=await client.query('SELECT count(*)::int AS n FROM attachments WHERE tenant_id::text=$1::text AND linked_type=$2 AND linked_id=$3',[String(tenantId),LINK_TYPE,String(unitId)]);
    if(unitCount.rows[0].n>=MAX_IMAGES_PER_UNIT)throw Error('PHOTO_UNIT_STORAGE_LIMIT');
    const usage=await client.query("SELECT COALESCE(sum(octet_length(file_data))*3/4,0)::bigint AS bytes FROM attachments WHERE tenant_id::text=$1::text AND linked_type=$2",[String(tenantId),LINK_TYPE]);
    if(Number(usage.rows[0].bytes)+image.bytes.length>MAX_RUN_BYTES)throw Error('PHOTO_TENANT_STORAGE_LIMIT');
    await client.query('INSERT INTO attachments(filename,original_name,mime_type,file_path,linked_type,linked_id,tenant_id,branch_id,file_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[filename,'Property Finder photo '+(i+1),image.mime,'uploads/'+tenantId+'/pf/'+filename,LINK_TYPE,String(unitId),String(tenantId),check.rows[0].branch_id||null,image.bytes.toString('base64')]);summary.saved++;}
    await client.query('COMMIT');
   }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }catch(e){summary.errors.push({index:i+1,code:/^[A-Z_0-9]+$/.test(e.message)?e.message:'PHOTO_SAVE_FAILED'});}
 }
 return summary;
}
module.exports={downloadImage,publicAddress,rasterType,persistListingPhotos,createBudget,MAX_IMAGE_BYTES,MAX_RUN_BYTES,MAX_IMAGES_PER_UNIT,LINK_TYPE};

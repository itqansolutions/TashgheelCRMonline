const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'static-accept-'));
fs.mkdirSync(path.join(temp,'synthetic-tenant'));fs.writeFileSync(path.join(temp,'synthetic-tenant','private.png'),'synthetic image');
const id=require.resolve(root+'/config/db');require.cache[id]={id,filename:id,loaded:true,exports:{query:async()=>({rows:[{tenant_id:'synthetic-tenant',linked_type:'deal',linked_id:'123'}]})}};
const secure=require(root+'/middleware/secureUploads')(temp);const res=()=>({code:200,status(n){this.code=n;return this},json(x){this.body=x;return this},sendFile(p){this.sent=p;return this},setHeader(){},send(x){this.bytes=x;return this}});
(async()=>{let r=res();await secure({path:'/synthetic-tenant/private.png',headers:{},query:{}},r);assert.equal(r.code,401);assert(!r.sent);console.log('PASS unauthenticated deal image denied before file serving');console.log('SYNTHETIC_STATIC_UPLOAD_REPRO_COMPLETE');})().catch(e=>{console.error(e);process.exitCode=1});

// Runs only against an ephemeral local PostgreSQL cluster. Never loads app DB config.
// NODE_PATH=/tmp/pgtest/node_modules node tests/four_workflow_fixes.integration.cjs
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const EmbeddedPostgres=require('embedded-postgres').default,{Pool}=require('pg');
const root=path.resolve(__dirname,'..');
const TA='11111111-1111-4111-8111-111111111111',TB='22222222-2222-4222-8222-222222222222',BA='33333333-3333-4333-8333-333333333333',BB='44444444-4444-4444-8444-444444444444',U='55555555-5555-4555-8555-555555555555';
let pool,cluster;const results=[];
function mock(file,exports){const id=require.resolve(path.join(root,file));require.cache[id]={id,filename:id,loaded:true,exports};}
function response(){return{code:200,body:null,status(n){this.code=n;return this;},json(x){this.body=x;return this;}};}
async function check(name,fn){await fn();results.push(name);console.log('PASS',name);}
(async()=>{try{
 const port=57900+Math.floor(Math.random()*100);
 cluster=new EmbeddedPostgres({databaseDir:fs.mkdtempSync(path.join(os.tmpdir(),'four-workflow-fixes-')),user:'local',password:'local',port,persistent:false});
 await cluster.initialise();await cluster.start();await cluster.createDatabase('isolated_fixes');
 pool=new Pool({host:'127.0.0.1',port,user:'local',password:'local',database:'isolated_fixes'});
 mock('config/db',{query:(...a)=>pool.query(...a),pool});
 mock('services/accessScopeService',{});mock('services/notificationService',{});mock('services/loggerService',{});mock('utils/activityLogger',{logActivity:async()=>{}});
 await pool.query(`CREATE TABLE tasks(id int primary key,title text NOT NULL,description text,priority text,status text,status_id int,assigned_to int,director_id int,created_by int,parent_type text,parent_id int,due_date timestamptz,tenant_id uuid,branch_id uuid,updated_at timestamptz);
 CREATE TABLE task_followers(task_id int,user_id int);
 CREATE TABLE attachments(id int,linked_type text,linked_id text,tenant_id uuid,branch_id uuid,created_at timestamptz,file_data text,mime_type text,file_path text);
 CREATE TABLE customers(id int,name text,email text,phone text,budget_min numeric,budget_max numeric,preferred_area_min numeric,preferred_area_max numeric,preferred_location text,preferred_rooms int,company_name text,source text,status text,tenant_id uuid,branch_id uuid,is_blacklisted bool,entity_type text,is_active bool);
 CREATE TABLE re_units(id uuid,name text,unit_number text,price numeric,area_sqm numeric,rooms int,location text,status text,project_name text,developer_id uuid,project_id uuid,phase_id uuid,building_id uuid,tenant_id uuid,branch_id uuid);
 CREATE TABLE re_developers(id uuid,name text,tenant_id uuid);CREATE TABLE re_projects(id uuid,name text,tenant_id uuid);CREATE TABLE re_phases(id uuid,name text,tenant_id uuid);CREATE TABLE re_buildings(id uuid,name text,tenant_id uuid);`);
 await pool.query(`INSERT INTO tasks VALUES(1,'Retain title','Retain description','high','todo',1,7,8,7,'customer',9,'2026-12-01',$1,$2,NOW())`,[TA,BA]);
 await pool.query('INSERT INTO task_followers VALUES(1,10)');
 const task=require(path.join(root,'controllers/tasksController'));
 const req=(body,tenant=TA,branch=BA)=>({body,params:{id:1},user:{id:7,role:'admin',tenant_id:tenant},branchId:branch});
 await check('status-only update preserves all task fields and followers',async()=>{const before=(await pool.query('SELECT * FROM tasks')).rows[0],res=response();await task.updateTask(req({status_id:2}),res);assert.equal(res.code,200);const after=res.body.data;for(const k of Object.keys(before).filter(k=>!['status_id','updated_at'].includes(k)))assert.deepEqual(after[k],before[k]);assert.equal(after.status_id,2);assert.equal((await pool.query('SELECT * FROM task_followers')).rows.length,1);});
 await check('full edit updates supplied values and explicit [] clears followers',async()=>{let res=response();await task.updateTask(req({title:'Edited',description:'',priority:'low',status:'done',status_id:3,assigned_to:7,director_id:null,parent_type:null,parent_id:null,due_date:null,follower_ids:[]}),res);assert.equal(res.code,200);assert.equal(res.body.data.title,'Edited');assert.equal(res.body.data.due_date,null);assert.equal(res.body.data.director_id,null);assert.equal((await pool.query('SELECT * FROM task_followers')).rows.length,0);});
 await check('wrong tenant and wrong branch cannot update task',async()=>{for(const [t,b] of [[TB,BA],[TA,BB]]){const res=response();await task.updateTask(req({status_id:99},t,b),res);assert.equal(res.code,404);}assert.equal((await pool.query('SELECT status_id FROM tasks')).rows[0].status_id,3);});
 await pool.query(`INSERT INTO attachments VALUES(1,'unit','u',$1,$2,NOW(),null,'image/png','one'),(2,'re_unit','u',$1,null,NOW(),null,'image/png','two'),(3,'unit','u',$3,$2,NOW(),null,'image/png','other tenant'),(4,'unit','u',$1,$4,NOW(),null,'image/png','other branch'),(5,'customer','u',$1,$2,NOW(),null,'image/png','customer')`,[TA,BA,TB,BB]);
 const files=require(path.join(root,'controllers/filesController'));
 await check('unit and re_unit alias queries both execute and preserve tenant/branch scope',async()=>{for(const type of ['unit','re_unit']){let res=response();await files.getAttachments({params:{entityType:type,entityId:'u'},user:{tenant_id:TA},branchId:BA},res);assert.equal(res.code,200);assert.deepEqual(res.body.data.map(x=>x.id).sort(),[1,2]);}});
 await check('non-unit attachment query remains exact',async()=>{let res=response();await files.getAttachments({params:{entityType:'customer',entityId:'u'},user:{tenant_id:TA},branchId:BA},res);assert.equal(res.code,200);assert.deepEqual(res.body.data.map(x=>x.id),[5]);});
 await pool.query(`INSERT INTO re_units(id,unit_number,price,area_sqm,rooms,status,tenant_id,branch_id) VALUES($1,'Synthetic',1000000,125,1,'Available',$2,$3)`,[U,TA,BA]);
 for(const [id,t,b,active,entity] of [[1,TA,BA,true,'customer'],[2,TA,null,true,'customer'],[3,TB,BA,true,'customer'],[4,TA,BB,true,'customer'],[5,TA,BA,false,'customer'],[6,TA,BA,true,'vendor']])await pool.query(`INSERT INTO customers(id,name,budget_max,status,tenant_id,branch_id,is_blacklisted,entity_type,is_active) VALUES($1,'Synthetic',1100000,'lead',$2,$3,false,$4,$5)`,[id,t,b,entity,active]);
 const match=require(path.join(root,'services/reMatchingService'));
 await check('buyer matching works against real UUID schema and keeps scope/eligibility',async()=>{const r=await match.matchCustomersForUnit({tenantId:TA,branchId:BA,unitId:U});assert.equal(r.matches_count,2);assert.deepEqual(r.matches.map(x=>x.customer.id).sort(),[1,2]);});
 await check('buyer matching wrong-tenant unit remains 404',async()=>{await assert.rejects(()=>match.matchCustomersForUnit({tenantId:TB,branchId:BA,unitId:U}),e=>e.statusCode===404);});
 // Legacy text branch compatibility, without modifying any application database.
 await pool.query('ALTER TABLE customers ALTER COLUMN branch_id TYPE text USING branch_id::text');await pool.query(`INSERT INTO customers(id,name,status,tenant_id,branch_id,is_blacklisted,entity_type,is_active) VALUES(7,'Legacy','lead',$1,'default-branch',false,'customer',true)`,[TA]);
 await check('legacy text default-branch rows remain supported',async()=>{const r=await match.matchCustomersForUnit({tenantId:TA,branchId:BA,unitId:U});assert.deepEqual(r.matches.map(x=>x.customer.id).sort(),[1,2,7]);});
 console.log('RESULTS',JSON.stringify({count:results.length,passed:results}));
}finally{if(pool)await pool.end();if(cluster)await cluster.stop();}})().catch(e=>{console.error(e);process.exitCode=1;});

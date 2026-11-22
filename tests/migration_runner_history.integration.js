// Real PostgreSQL + actual application migrationRunner, never application credentials.
// Requires embedded-postgres and pg in the local test environment.
// Run: node tests/migration_runner_history.integration.js /absolute/baseline-repository
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const EmbeddedPostgres = require('embedded-postgres').default;
const { Pool } = require('pg');
const REPO = path.resolve(__dirname, '..');
const BASELINE = process.argv[2] && path.resolve(process.argv[2]);
const F = '027_create_re_installment_schedule_history.sql';
const R = '027_rollback_re_installment_schedule_history.sql';
const V = '028_verify_re_installment_schedule_history.sql';
const COMMERCIAL_F = '026_create_tenant_contracts_ledger.sql';
const COMMERCIAL_R = '026_rollback_tenant_contracts_ledger.sql';
const results = [];
let pg;
const pools = [];
let dbIndex = 0;

async function fixture(repo, kind) {
    const database = 'history_case_' + (++dbIndex);
    await pg.createDatabase(database);
    const pool = new Pool({host:'127.0.0.1',port:pg.port,user:'local',password:'local',database,max:3});
    pools.push(pool);
    await pool.query(`
        CREATE TABLE tenants(id UUID PRIMARY KEY);
        CREATE TABLE users(id SERIAL PRIMARY KEY);
        CREATE TABLE vendors(id SERIAL PRIMARY KEY, contact_person TEXT);
        CREATE TABLE warehouses(id SERIAL PRIMARY KEY);
        CREATE TABLE products(id SERIAL PRIMARY KEY);
        CREATE TABLE purchase_orders(id SERIAL PRIMARY KEY, po_number TEXT, tenant_id UUID,
            branch_id TEXT, status TEXT, vendor_quotation_id INT, rfq_id INT, vendor_id INT, warehouse_id INT);
        CREATE TABLE purchase_order_items(id SERIAL PRIMARY KEY, purchase_order_id INT, product_id INT);
        CREATE TABLE schema_migrations(name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now());
    `);
    const files = fs.readdirSync(path.join(repo,'migrations')).filter(f=>f.endsWith('.sql'));
    for (const f of files.filter(f=>Number(f.split('_')[0])<=26 && !f.includes('rollback'))) {
        if(kind==='commercial_rolled_back' && f===COMMERCIAL_F) continue;
        await pool.query('INSERT INTO schema_migrations(name) VALUES($1)',[f]);
    }
    if(repo===BASELINE || kind==='commercial_rolled_back') {
        await pool.query('INSERT INTO schema_migrations(name) VALUES($1)',[COMMERCIAL_R]);
    }
    if(kind!=='commercial_rolled_back') {
        // Sentinel commercial-ledger rows must not be touched by this correction.
        await pool.query("CREATE TABLE tenant_contracts(id TEXT PRIMARY KEY, payload JSONB); INSERT INTO tenant_contracts VALUES('keep','{\"sentinel\":true}'); CREATE TABLE tenant_contract_audit_logs(id INT PRIMARY KEY); INSERT INTO tenant_contract_audit_logs VALUES(7)");
    }
    if(['recorded_bug','existing_rows','incompatible_columns','incompatible_json','unknown_missing'].includes(kind)) {
        await pool.query('INSERT INTO schema_migrations(name) VALUES($1)',[F]);
    }
    if(['recorded_bug','unknown_forward'].includes(kind)) {
        await pool.query('INSERT INTO schema_migrations(name) VALUES($1)',[R]);
    }
    if(['existing_rows','incompatible_columns','incompatible_json'].includes(kind)) {
        await pool.query(fs.readFileSync(path.join(repo,'migrations',F),'utf8'));
        await pool.query(`INSERT INTO re_installment_schedule_history
            (tenant_id,branch_id,contract_id,prior_installments,new_parameters)
            VALUES ('synthetic','branch-one','11111111-1111-4111-8111-111111111111','[{"amount":100}]','{"number_of_installments":2}')`);
        if(kind==='incompatible_columns') await pool.query('ALTER TABLE re_installment_schedule_history ALTER COLUMN branch_id TYPE TEXT');
        if(kind==='incompatible_json') await pool.query("UPDATE re_installment_schedule_history SET prior_installments='{}'");
    }
    return pool;
}

function loadRunner(repo,pool) {
    // Replace config before ANY application module is loaded. No dotenv/app DB is read.
    const dbPath=require.resolve(path.join(repo,'config/db'));
    require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{query:(...a)=>pool.query(...a),connect:()=>pool.connect()}};
    for(const file of ['controllers/financeController','controllers/purchasesController','src/infrastructure/database/migrationRunner']) {
        delete require.cache[require.resolve(path.join(repo,file))];
    }
    return require(path.join(repo,'src/infrastructure/database/migrationRunner'));
}
async function run(repo,pool) {
    const errors=[],warnings=[];
    const oldError=console.error,oldWarn=console.warn,oldLog=console.log;
    console.error=(...a)=>errors.push(a.join(' '));
    console.warn=(...a)=>warnings.push(a.join(' '));
    console.log=()=>{};
    let thrown;
    try {await loadRunner(repo,pool)();} catch(e){thrown=e;}
    finally {console.error=oldError;console.warn=oldWarn;console.log=oldLog;}
    return {errors,warnings,thrown};
}
const present=async(pool,table)=>(await pool.query('SELECT to_regclass($1) AS name',[table])).rows[0].name!==null;
const marker=async(pool,name)=>(await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])).rowCount>0;
const rows=async(pool)=>(await pool.query('SELECT row_to_json(h) AS value FROM re_installment_schedule_history h ORDER BY id')).rows;
async function preservedCommercial(pool){
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM tenant_contracts')).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM tenant_contract_audit_logs')).rows[0].n,1);
}
async function caseRun(name,fn){await fn();results.push({name,status:'PASS'});console.log('CASE',name,'PASS');}

(async()=>{
    const port=56200+Math.floor(Math.random()*300);
    pg=new EmbeddedPostgres({databaseDir:fs.mkdtempSync('/tmp/history-runner-'),user:'local',password:'local',port,persistent:false});
    pg.port=port;
    await pg.initialise();await pg.start();
    if(BASELINE) await caseRun('unmodified runner reproduces create-then-rollback',async()=>{
        const p=await fixture(BASELINE,'fresh');const r=await run(BASELINE,p);
        assert.deepEqual(r.errors,[]);assert.equal(r.thrown,undefined);
        assert.equal(await present(p,'re_installment_schedule_history'),false);
        assert.equal(await marker(p,F),true);assert.equal(await marker(p,R),true);
    });
    await caseRun('all current forward names kept and rollback/down names excluded',async()=>{
        const {isForwardMigration,isRollbackMigration}=require(path.join(REPO,'src/infrastructure/database/migrationFiles'));
        for(const f of fs.readdirSync(path.join(REPO,'migrations')).filter(f=>f.endsWith('.sql'))) {
            assert.equal(isForwardMigration(f),!f.includes('_rollback_'),f);
        }
        for(const f of ['030_down_example.sql','030_example.down.sql','030_example_down.sql']) assert.equal(isForwardMigration(f),false,f);
        for(const f of ['030_add_down_payment.sql','011_manual_entitlements_and_audit_schema.sql']) assert.equal(isForwardMigration(f),true,f);
        assert.equal(isRollbackMigration(COMMERCIAL_R),true);
    });
    await caseRun('fresh history prerequisite survives actual runner',async()=>{
        const p=await fixture(REPO,'fresh');const r=await run(REPO,p);
        assert.deepEqual(r.errors,[]);assert.equal(r.thrown,undefined);
        assert.equal(await present(p,'re_installment_schedule_history'),true);
        assert.equal(await marker(p,F),true);assert.equal(await marker(p,V),true);
        assert.equal(await marker(p,R),false);assert.equal(await marker(p,COMMERCIAL_R),false);
        await preservedCommercial(p);
    });
    await caseRun('known recorded bug repaired and second boot unchanged',async()=>{
        const p=await fixture(REPO,'recorded_bug');let r=await run(REPO,p);
        assert.deepEqual(r.errors,[]);assert.equal(r.thrown,undefined);
        assert.equal(await present(p,'re_installment_schedule_history'),true);
        assert.equal(await marker(p,R),true);assert.equal(await marker(p,V),true);
        const before=await rows(p);r=await run(REPO,p);
        assert.deepEqual(r.errors,[]);assert.deepEqual(await rows(p),before);
        assert.equal(await marker(p,R),true);await preservedCommercial(p);
    });
    await caseRun('existing compatible history row values preserved',async()=>{
        const p=await fixture(REPO,'existing_rows');const before=await rows(p);const r=await run(REPO,p);
        assert.deepEqual(r.errors,[]);assert.equal(r.thrown,undefined);
        assert.deepEqual(await rows(p),before);assert.equal(await marker(p,V),true);await preservedCommercial(p);
    });
    for(const kind of ['incompatible_columns','incompatible_json','unknown_missing','unknown_forward']) {
        await caseRun(kind+' rejected without rows or marker changes',async()=>{
            const p=await fixture(REPO,kind);const existed=await present(p,'re_installment_schedule_history');
            const before=existed?await rows(p):null;
            const markers=(await p.query('SELECT * FROM schema_migrations ORDER BY name')).rows;
            const r=await run(REPO,p);
            assert.ok(r.thrown);assert.ok(r.errors.some(e=>e.includes(V)));
            assert.equal(await marker(p,V),false);
            assert.equal(await present(p,'re_installment_schedule_history'),existed);
            if(existed)assert.deepEqual(await rows(p),before);
            assert.deepEqual((await p.query('SELECT * FROM schema_migrations ORDER BY name')).rows,markers);
            assert.equal((await p.query('SELECT 1 AS ok')).rows[0].ok,1);
            await preservedCommercial(p);
        });
    }
    await caseRun('recorded 026 rollback does not reconstruct unrelated commercial ledger',async()=>{
        const p=await fixture(REPO,'commercial_rolled_back');const r=await run(REPO,p);
        assert.deepEqual(r.errors,[]);assert.equal(r.thrown,undefined);
        assert.ok(r.warnings.some(x=>x.includes('HOLD '+COMMERCIAL_F)));
        assert.equal(await present(p,'tenant_contracts'),false);
        assert.equal(await present(p,'tenant_contract_audit_logs'),false);
        assert.equal(await marker(p,COMMERCIAL_R),true);assert.equal(await marker(p,COMMERCIAL_F),false);
        assert.equal(await marker(p,V),true);
    });
    console.log('RESULTS',JSON.stringify(results));
})().catch(e=>{console.error('TEST_FAILED',e.stack);process.exitCode=1;}).finally(async()=>{
    for(const p of pools)await p.end();
    // Let PostgreSQL process closed TCP sessions before stopping the cluster.
    await new Promise(resolve=>setTimeout(resolve,150));
    if(pg)await pg.stop();
});

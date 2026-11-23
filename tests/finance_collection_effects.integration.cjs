const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
if (!process.env.FINANCE_TEST_PG_MODULES) { console.log('SKIP: set FINANCE_TEST_PG_MODULES to local embedded-postgres+pg node_modules to run isolated SQL regression'); process.exit(0); }
const EP=require(path.join(process.env.FINANCE_TEST_PG_MODULES,'embedded-postgres/dist/index.js')).default,{Pool}=require(path.join(process.env.FINANCE_TEST_PG_MODULES,'pg'));
let cluster,pool;const TA='11111111-1111-4111-8111-111111111111',BA='33333333-3333-4333-8333-333333333333';
function mock(f,x){const id=require.resolve(root+'/'+f);require.cache[id]={id,filename:id,loaded:true,exports:x};}
const req=(extra={})=>({user:{id:7,role:'admin',name:'Synthetic',tenant_id:TA},branchId:BA,params:{},query:{},body:{},...extra});
const res=()=>({code:200,status(n){this.code=n;return this},json(b){this.body=b;return this}});
(async()=>{try{
 const port=58000+Math.floor(Math.random()*200);cluster=new EP({databaseDir:fs.mkdtempSync(path.join(os.tmpdir(),'finance-effects-')),user:'local',password:'local',port,persistent:false});await cluster.initialise();await cluster.start();await cluster.createDatabase('isolated_finance');
 pool=new Pool({host:'127.0.0.1',port,user:'local',password:'local',database:'isolated_finance'});
 mock('config/db',{query:(...a)=>pool.query(...a),connect:()=>pool.connect(),pool});mock('services/loggerService',{logAction:()=>{},logCreate:()=>{},ACTIONS:{PAYMENT:'PAYMENT'}});mock('services/salesCommissionService',{accruePaymentCommission:async()=>{}});mock('services/notificationQueueService',{});mock('services/whatsappService',{normalisePhone:x=>x});mock('services/accessScopeService',{buildScopePredicate:async()=>({sql:'TRUE',params:[]})});
 await pool.query('CREATE TABLE tenants(id uuid primary key); CREATE TABLE customers(id int primary key,name text,email text,phone text,tenant_id uuid,branch_id text);');await pool.query('INSERT INTO tenants VALUES($1)',[TA]);
 const fin=require(root+'/controllers/financeController');let r=res();await fin.getSummary(req(),r);assert.equal(r.code,200);console.log('BASELINE',r.body);
 await pool.query(`CREATE TABLE re_contracts(id int primary key,deal_id int,branch_id text,contract_value numeric,status text,tenant_id uuid);CREATE TABLE re_installments(id int primary key,deal_id int,contract_id int,tenant_id uuid,branch_id text,amount numeric,paid_amount numeric,status text,paid_at timestamptz,notes text,updated_at timestamptz);CREATE TABLE re_payments_mvp(id serial primary key,tenant_id uuid,branch_id text,deal_id text,total_amount numeric,paid_amount numeric,status text,created_at timestamptz,updated_at timestamptz);CREATE TABLE treasury_accounts(id int,tenant_id uuid,branch_id text,is_active bool,is_default bool,type text,name text,opening_balance numeric,bank_name text,account_number text,updated_at timestamptz);`);
 await pool.query('INSERT INTO customers VALUES(9,$1,$2,NULL,$3,$4)',['Synthetic','qa@example.invalid',TA,BA]);await pool.query('INSERT INTO deals(id,title,value,client_id,tenant_id,branch_id) VALUES(1,$1,1000,9,$2,$3)',['Synthetic deal',TA,BA]);await pool.query('INSERT INTO re_contracts VALUES(2,1,$1,1000,$2,$3)',[BA,'Draft',TA]);await pool.query('INSERT INTO re_installments(id,deal_id,contract_id,tenant_id,branch_id,amount,paid_amount,status) VALUES(3,1,2,$1,$2,1000,0,$3)',[TA,BA,'Pending']);await pool.query('INSERT INTO treasury_accounts(id,tenant_id,branch_id,is_active,is_default,type,name,opening_balance) VALUES(4,$1,$2,true,true,$3,$4,0)',[TA,BA,'cash','Synthetic cash']);
 const inst=require(root+'/controllers/reInstallmentsController');r=res();await inst.recordPayment(req({params:{id:'3'},body:{amount:100,payment_method:'cash',notes:'isolated synthetic receipt'}}),r);assert.equal(r.code,200);assert.equal(Number(r.body.data.paid_amount),100);console.log('PAYMENT',r.body);
 const vouchers=await pool.query('SELECT id,amount,customer_id,deal_id,contract_id,installment_id,treasury_account_id FROM finance_vouchers');const payments=await pool.query('SELECT * FROM payments');assert.equal(vouchers.rows.length,1);assert.equal(payments.rows.length,0);assert.equal(vouchers.rows[0].treasury_account_id,4);console.log('ROWS',JSON.stringify({vouchers:vouchers.rows,payments:payments.rows}));
 for(const fn of ['getSummary','getIncome','getTreasuryAccounts','getCustomerAccounts']){r=res();await fin[fn](req(),r);console.log(fn,JSON.stringify({code:r.code,body:r.body}));}
 
 r=res();await inst.recordPayment(req({params:{id:'3'},body:{amount:950}}),r);assert.equal(r.code,400);assert.equal((await pool.query('SELECT COUNT(*) FROM finance_vouchers')).rows[0].count,'1');console.log('PASS overpayment950 rejected, no new voucher');
 r=res();await inst.recordPayment(req({user:{id:7,role:'admin',tenant_id:'22222222-2222-4222-8222-222222222222'},params:{id:'3'},body:{amount:10}}),r);assert.equal(r.code,404);console.log('PASS wrong tenant rejected');
 r=res();await inst.recordPayment(req({user:{id:7,role:'sales',tenant_id:TA},branchId:'44444444-4444-4444-8444-444444444444',params:{id:'3'},body:{amount:10}}),r);assert.equal(r.code,404);console.log('PASS nonadmin wrong branch rejected');
 r=res();await inst.recordPayment(req({params:{id:'3'},body:{amount:100,payment_method:'cash',notes:'isolated synthetic receipt'}}),r);assert.equal(r.code,200);console.log('DUPLICATE_IDENTICAL_SUBMIT',JSON.stringify({code:r.code,paid:r.body.data.paid_amount,voucherCount:(await pool.query('SELECT COUNT(*) FROM finance_vouchers')).rows[0].count}));
 r=res();await inst.getInstallmentPayments(req({params:{id:'3'}}),r);assert.equal(r.code,200);assert.equal(r.body.data.length,2);console.log('PASS installment history shows two receipts');
 
 await pool.query('INSERT INTO invoices(id,invoice_number,total_amount,status,client_id,customer_id,tenant_id,branch_id) VALUES(8,$1,1000,$2,9,9,$3,$4)',['ISOLATED-INV','unpaid',TA,BA]);
 r=res();await fin.createInvoicePaymentDirect(req({params:{id:'8'},body:{amount:100,payment_method:'cash'}}),r);assert.equal(r.code,201);assert.equal(r.body.invoiceStatus,'partial');console.log('INVOICE_PAYMENT',JSON.stringify({code:r.code,invoiceStatus:r.body.invoiceStatus,treasury:r.body.data.treasury_account_id}));
 for(const fn of ['getSummary','getTreasuryAccounts','getCustomerAccounts']){r=res();await fin[fn](req(),r);console.log('AFTER_INVOICE_'+fn,JSON.stringify({code:r.code,body:r.body}));}
 r=res();await fin.createInvoicePaymentDirect(req({params:{id:'8'},body:{amount:901,payment_method:'cash'}}),r);assert.equal(r.code,400);assert.equal((await pool.query('SELECT COUNT(*) FROM payments')).rows[0].count,'1');console.log('PASS invoice overpayment rejected with no payment row');
 r=res();await fin.createInvoicePaymentDirect(req({params:{id:'8'},body:{amount:10,payment_method:'card'}}),r);assert.equal(r.code,400);console.log('PASS card without explicit treasury rejected');
 
 const rr=[res(),res()];await Promise.all(rr.map(x=>inst.recordPayment(req({params:{id:'3'},body:{amount:500}}),x)));assert.deepEqual(rr.map(x=>x.code).sort(),[200,400]);assert.equal(Number((await pool.query('SELECT paid_amount FROM re_installments WHERE id=3')).rows[0].paid_amount),700);console.log('PASS concurrent500+500 serializes, one receipt succeeds and one overpayment rejected, paid700');
 await pool.query("UPDATE re_contracts SET status='Cancelled' WHERE id=2");const before=(await pool.query('SELECT COUNT(*) FROM finance_vouchers')).rows[0].count;r=res();await inst.recordPayment(req({params:{id:'3'},body:{amount:10}}),r);assert.equal(r.code,409);assert.equal((await pool.query('SELECT COUNT(*) FROM finance_vouchers')).rows[0].count,before);console.log('PASS cancelled contract receipt blocked without voucher');
 // Unified read effects and deduplication, including the linked invoice voucher.
 r=res();await fin.getSummary(req(),r);assert.equal(r.code,200);assert.equal(r.body.data.totalIncome,800);assert.equal(r.body.data.netCashflow,800);assert.equal(r.body.data.totalOutstanding,900);
 r=res();await fin.getTreasuryAccounts(req(),r);assert.equal(r.code,200);assert.equal(r.body.totals.total_balance,800);
 r=res();await fin.getIncome(req(),r);assert.equal(r.code,200);assert.equal(r.body.data.length,4);assert.equal(r.body.data.reduce((a,x)=>a+Number(x.amount),0),800);
 console.log('PASS unified summary, income and treasury800 with invoice outstanding900 and no double counting');
 for (const query of [{},{date_from:'2000-01-01'},{date_to:'2099-12-31'},{date_from:'2000-01-01',date_to:'2099-12-31'}]) {
   r=res();await fin.getFinancialReports(req({query}),r);assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.collections.total_collected,800);assert.equal(r.body.collections.count,4);assert.equal(r.body.cashflow.by_treasury_account[0].inflow,800);
 }
 console.log('PASS report aggregate, method, trend and treasury inflow with no/from/to/both date filters');
 await pool.query("UPDATE re_contracts SET status='Draft' WHERE id=2");
 const countBefore=Number((await pool.query('SELECT COUNT(*) FROM finance_vouchers')).rows[0].count);
 for (const body of [{amount:10,treasury_account_id:'bad'},{amount:10,treasury_account_id:999},{amount:10,payment_method:'card'},{amount:10,payment_method:'cheque'},{amount:10,payment_method:'bank_transfer',treasury_account_id:4}]) {
   r=res();await inst.recordPayment(req({params:{id:'3'},body}),r);assert.equal(r.code,400,JSON.stringify(body));
 }
 await pool.query('UPDATE treasury_accounts SET is_default=false WHERE id=4');
 r=res();await inst.recordPayment(req({params:{id:'3'},body:{amount:10}}),r);assert.equal(r.code,400);
 r=res();await fin.updateTreasuryAccount(req({params:{id:'4'},body:{is_default:true}}),r);assert.equal(r.code,200);assert.equal(r.body.data.is_default,true);
 await pool.query('UPDATE treasury_accounts SET is_active=false WHERE id=4');
 r=res();await inst.recordPayment(req({params:{id:'3'},body:{amount:10,treasury_account_id:4}}),r);assert.equal(r.code,400);
 await pool.query('UPDATE treasury_accounts SET is_active=true,branch_id=$1 WHERE id=4',['44444444-4444-4444-8444-444444444444']);
 r=res();await inst.recordPayment(req({params:{id:'3'},body:{amount:10,treasury_account_id:4}}),r);assert.equal(r.code,400);
 assert.equal(Number((await pool.query('SELECT COUNT(*) FROM finance_vouchers')).rows[0].count),countBefore);
 console.log('PASS explicit/default treasury validation: invalid, missing, inactive, wrong branch/type and card/cheque settlement, rollback preserves voucher count; default update succeeds');
 await pool.query('UPDATE treasury_accounts SET branch_id=$1 WHERE id=4',[BA]);
 // Cancellation and tenant/branch reads exclude unrelated receipts, no stored record repair.
 await pool.query("UPDATE finance_vouchers SET status='cancelled' WHERE id=(SELECT MIN(id) FROM finance_vouchers)");
 r=res();await fin.getSummary(req(),r);assert.equal(r.body.data.totalIncome,700);
 r=res();await fin.getSummary(req({user:{tenant_id:'22222222-2222-4222-8222-222222222222'}}),r);assert.equal(r.body.data.totalIncome,0);
 r=res();await fin.getSummary(req({branchId:'44444444-4444-4444-8444-444444444444'}),r);assert.equal(r.body.data.totalIncome,0);
 console.log('PASS cancelled receipt and other tenant/branch excluded');
 // Production-compatible mixed column types: deployed report exposed uuid/varchar UNION mismatch.
 await pool.query('ALTER TABLE payments ALTER COLUMN branch_id TYPE uuid USING branch_id::uuid');
 await pool.query('ALTER TABLE finance_vouchers ALTER COLUMN tenant_id TYPE varchar USING tenant_id::text');
 for(const fn of ['getSummary','getIncome','getFinancialReports']) { r=res();await fin[fn](req(),r);assert.equal(r.code,200,fn+JSON.stringify(r.body)); }
 r=res();await fin.getSummary(req(),r);assert.equal(r.body.data.totalIncome,700);
 r=res();await fin.getFinancialReports(req(),r);assert.equal(r.body.collections.total_collected,700);assert.equal(r.body.cashflow.by_treasury_account[0].inflow,700);
 console.log('PASS mixed UUID/varchar deployed-schema regression across summary/income/report and treasury subquery');
 console.log('ISOLATED_EFFECT_REGRESSION_COMPLETE');



}finally{if(pool)await pool.end();if(cluster)await cluster.stop();}})().catch(e=>{console.error(e);process.exitCode=1});

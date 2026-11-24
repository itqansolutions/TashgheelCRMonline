const fs=require('fs'),path=require('path'),assert=require('assert/strict'),h=require('./helpers/pgHarness.cjs');
(async()=>{const ctx=await h.start({migration:true});const db=require('../config/db');
const sql=fs.readFileSync(path.join(h.root,'ops/proposals/crm_team_rental_package.sql'),'utf8');
const snap=async()=>JSON.stringify((await db.query(`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_name IN ('re_unit_events','re_rental_occupancies','re_rental_alert_deliveries') OR (table_name='deals' AND column_name='assigned_team_id') OR (table_name='re_units' AND column_name LIKE 'marketing%') ORDER BY 1,2`)).rows);
const a=await snap();await db.query(sql);await db.query(sql);const b=await snap();assert.equal(a,b);
const idx=(await db.query(`SELECT count(*) FROM pg_indexes WHERE tablename IN ('re_unit_events','re_rental_occupancies','re_rental_alert_deliveries','deals')`)).rows[0].count;console.log('idempotent ok, indexes',idx);
await ctx.stop();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});

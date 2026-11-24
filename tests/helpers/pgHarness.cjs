'use strict';
// Isolated synthetic Postgres for CRM package tests. Never touches a live DB.
// Env: PG_QUAL_DIR (dir containing node_modules/embedded-postgres and pg), CRM_SCHEMA_SQL (sanitized schema-only dump).
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..');
const qual = process.env.PG_QUAL_DIR || '/tmp/pgq';
const schemaFile = process.env.CRM_SCHEMA_SQL || '/downloads/nov24-crm-sanitized-schema-v36-c243709d.sql';
async function start({ migration = true } = {}) {
  const EP = require(qual + '/node_modules/embedded-postgres/dist/index.js').default;
  const { Pool } = require(qual + '/node_modules/pg');
  const port = 40000 + Math.floor(Math.random() * 15000);
  const cluster = new EP({ databaseDir: fs.mkdtempSync('/tmp/crmtest-'), user: 'postgres', password: 'synthetic', port, persistent: false });
  await cluster.initialise(); await cluster.start();
  const pool = new Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'synthetic', database: 'postgres' });
  await pool.query(fs.readFileSync(schemaFile, 'utf8').split('\n').filter(l => !l.startsWith('\\')).join('\n'));
  await pool.query('SET search_path=public,pg_catalog');
  if (migration) await pool.query(fs.readFileSync(path.join(root, 'ops/proposals/crm_team_rental_package.sql'), 'utf8'));
  // route app db module to this pool
  const id = require.resolve(path.join(root, 'config/db'));
  require.cache[id] = { id, filename: id, loaded: true, exports: { query: (...a) => pool.query(...a), connect: () => pool.connect(), pool } };
  return { pool, stop: async () => { await pool.end(); await cluster.stop(); } };
}
function mockRes() {
  const r = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
  return r;
}
module.exports = { start, mockRes, root };

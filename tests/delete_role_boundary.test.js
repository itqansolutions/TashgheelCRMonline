const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const boundary = require('../middleware/deleteRoleBoundary');

function probe(method, role) {
    const req = { method, user: role == null ? undefined : { role } };
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
    let passed = false;
    boundary(req, res, () => { passed = true; });
    return { passed, code: res.statusCode };
}

test('DELETE rejects every non-admin/manager role even if later PBAC would grant access', () => {
    for (const role of ['sales', 'agent', 'employee', 'supervisor', 'accountant', 'user', '', 'super_admin']) {
        assert.deepEqual(probe('DELETE', role), { passed: false, code: 403 }, role);
    }
    assert.deepEqual(probe('DELETE', null), { passed: false, code: 401 });
});

test('admin/manager only pass the ceiling; it does not grant route permission', () => {
    for (const role of ['admin', 'manager']) assert.deepEqual(probe('DELETE', role), { passed: true, code: 200 });
    // Downstream denials remain effective, including admin-only finance or tenant restrictions.
    let reached = false;
    boundary({ method: 'DELETE', user: { role: 'manager' } }, {}, () => { reached = true; });
    assert.equal(reached, true);
});

test('non-delete methods are unchanged', () => {
    for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS']) assert.equal(probe(method, 'sales').passed, true);
});

test('server mounts ceiling after auth, before protected API routers and plugin routes', () => {
    const s = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const ceiling = s.indexOf("app.use('/api', authMiddleware, require('./middleware/deleteRoleBoundary'), branchScope, subscriptionGuard);");
    assert.ok(ceiling > 0);
    for (const mount of ["app.use('/api/customers'", "app.use('/api/re-units'", "app.use('/api/finance'", 'moduleRegistry.mountRoutes(app)']) assert.ok(s.indexOf(mount) > ceiling, mount);
    // Early admin APIs keep their independent admin + system-tenant requirement.
    const admin = fs.readFileSync(path.join(__dirname, '../routes/adminPlanRoutes.js'), 'utf8');
    assert.match(admin, /req\.user\.role !== 'admin'/);
    assert.match(admin, /req\.user\.tenant_id !== SYSTEM_TENANT/);
});

test('voucher cancellation alias retains finance permission and gains same role ceiling', () => {
    const s = fs.readFileSync(path.join(__dirname, '../routes/financeRoutes.js'), 'utf8');
    assert.match(s, /router\.post\('\/vouchers\/:id\/cancel', require\('\.\.\/middleware\/roleGuard'\)\(\['admin', 'manager'\]\), requirePermission\('voucher.cancel'\)/);
});

test('HTTP ceiling blocks deletion, permits non-delete work, and preserves a stricter route', async () => {
    const express = require('express');
    const roleGuard = require('../middleware/roleGuard');
    const app = express();
    let deletes = 0;
    app.use((req, res, next) => { if (req.headers['x-test-role']) req.user = { role: req.headers['x-test-role'] }; next(); });
    app.use('/api', boundary);
    app.delete('/api/records/:id', (req,res) => { deletes++; res.sendStatus(204); });
    app.delete('/api/admin-only/:id', roleGuard(['admin']), (req,res) => res.sendStatus(204));
    app.get('/api/records', (req,res) => res.sendStatus(200));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        for (const role of ['sales','agent','supervisor','employee','accountant','admin','manager']) {
            const headers = { 'x-test-role': role };
            assert.equal((await fetch(base+'/api/records/1',{method:'DELETE',headers})).status, ['admin','manager'].includes(role)?204:403);
            assert.equal((await fetch(base+'/api/admin-only/1',{method:'DELETE',headers})).status, role==='admin'?204:403);
            assert.equal((await fetch(base+'/api/records',{headers})).status,200);
        }
        assert.equal(deletes,2);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('actual financial middleware keeps admin-only default and cannot override the deletion ceiling', async () => {
    const dbPath = require.resolve('../config/db');
    const prior = require.cache[dbPath];
    let override = false;
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: override ? [{ granted: true }] : [] }) } };
    const { requirePermission } = require('../middleware/financialPermission');
    async function dispatch(role) {
        const req = { method: 'DELETE', user: { id: 1, tenant_id: 'synthetic-tenant', role } };
        const res = { code: 200, status(n) { this.code = n; return this; }, json() { return this; } };
        let pending;
        boundary(req, res, () => { pending = requirePermission('voucher.cancel')(req,res,() => { res.code=204; }); });
        if (pending) await pending;
        return res.code;
    }
    try {
        assert.equal(await dispatch('admin'),204);
        assert.equal(await dispatch('manager'),403);
        override = true;
        assert.equal(await dispatch('manager'),204); // Existing explicit financial grant, not a new grant.
        for (const role of ['sales','supervisor','accountant','finance_manager']) assert.equal(await dispatch(role),403);
    } finally {
        if (prior) require.cache[dbPath]=prior; else delete require.cache[dbPath];
    }
});

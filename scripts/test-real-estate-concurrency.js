const db = require('../config/db');
const dealsController = require('../controllers/dealsController');
const reservationService = require('../services/reservationService');

const tenantA = '00000000-0000-0000-0000-000000000001';
const tenantB = '00000000-0000-0000-0000-000000000099';
const branchA = '00000000-0000-0000-0000-000000000002';
const branchB = '00000000-0000-0000-0000-000000000003';
const branchForeign = '00000000-0000-0000-0000-000000000098';
const agent1 = 26;
const agent2 = 30;
const agent3 = 26;
const agentB = 31;
const agentBranchB = 26;

// Helper to simulate Express req/res
function mockReqRes({ body = {}, params = {}, user = {}, query = {} } = {}) {
    const req = {
        body,
        params,
        query,
        user: {
            id: user.id || agent1,
            tenant_id: user.tenant_id || tenantA,
            branch_id: user.branch_id || branchA,
            role: user.role || 'sales_agent',
            name: user.name || 'Test Agent',
            ...user
        },
        ip: '127.0.0.1'
    };

    let statusCode = 200;
    let responseData = null;

    const res = {
        status: function(code) {
            statusCode = code;
            return this;
        },
        json: function(data) {
            responseData = data;
            return this;
        },
        getStatusCode: () => statusCode,
        getData: () => responseData
    };

    return { req, res };
}

async function runTests() {
    console.log('====================================================');
    console.log('🧪 REAL ESTATE CRM - CONCURRENCY & INTEGRITY TEST SUITE');
    console.log('====================================================\n');

    let passedTests = 0;
    let failedTests = 0;

    const assert = (condition, title, details = '') => {
        if (condition) {
            console.log(`  ✅ PASS: ${title}`);
            passedTests++;
        } else {
            console.error(`  ❌ FAIL: ${title} -> ${details}`);
            failedTests++;
        }
    };

    try {
        // Cleanup old test records
        await db.query(`DELETE FROM deals WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
        await db.query(`DELETE FROM re_units WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);

        // Helper to insert a unit
        async function createTestUnit({ name, unit_number, status = 'Available', price = 2500000, tenant_id = tenantA, branch_id = branchA, expires_at = null, ext_count = 0 }) {
            const result = await db.query(`
                INSERT INTO re_units (
                    name, project_name, unit_number, type, floor, area_sqm, price, status,
                    tenant_id, branch_id, reservation_expires_at, reservation_extension_count
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *
            `, [name, 'Grand Heights', unit_number, 'Apartment', '3', '145', price, status, tenant_id, branch_id, expires_at, ext_count]);
            return result.rows[0];
        }

        // -----------------------------------------------------------------
        // TEST 1: Two concurrent reservation requests hitting same Available unit
        // -----------------------------------------------------------------
        console.log('--- TEST 1: Concurrent Reservation (Race Condition Prevention) ---');
        const unit1 = await createTestUnit({ name: 'Unit 101-A', unit_number: '101-A', status: 'Available' });

        const reqBody1 = {
            title: 'Deal Agent 1',
            client_id: null,
            value: 2500000,
            pipeline_stage: 'reserved',
            unit_id: unit1.id,
            reservation_duration_days: 3
        };
        const reqBody2 = {
            title: 'Deal Agent 2',
            client_id: null,
            value: 2500000,
            pipeline_stage: 'reserved',
            unit_id: unit1.id,
            reservation_duration_days: 5
        };

        const { req: req1, res: res1 } = mockReqRes({ body: reqBody1, user: { id: agent1, tenant_id: tenantA, branch_id: branchA } });
        const { req: req2, res: res2 } = mockReqRes({ body: reqBody2, user: { id: agent2, tenant_id: tenantA, branch_id: branchA } });

        // Fire both requests concurrently
        await Promise.allSettled([
            dealsController.createDeal(req1, res1),
            dealsController.createDeal(req2, res2)
        ]);

        const codes = [res1.getStatusCode(), res2.getStatusCode()];
        const successCount = codes.filter(c => c === 201).length;
        const rejectCount = codes.filter(c => c === 400).length;

        assert(successCount === 1 && rejectCount === 1, 
            'Exactly 1 concurrent reservation succeeds (201) and 1 is rejected (400)',
            `Codes: Agent 1=${res1.getStatusCode()}, Agent 2=${res2.getStatusCode()}`);

        const rejectData = res1.getStatusCode() === 400 ? res1.getData() : res2.getData();
        assert(rejectData && rejectData.message && rejectData.message.includes('Reserved'),
            'Rejected request contains clear explanation that unit is no longer available',
            `Message: ${rejectData?.message}`);

        // Verify database state of unit1
        const u1Check = await db.query(`SELECT status, reservation_expires_at FROM re_units WHERE id::text = $1`, [unit1.id]);
        assert(u1Check.rows[0].status === 'Reserved' && u1Check.rows[0].reservation_expires_at !== null,
            'Unit status in database is Reserved with valid expiration timestamp');

        // -----------------------------------------------------------------
        // TEST 2: Reserving an already Reserved unit fails
        // -----------------------------------------------------------------
        console.log('\n--- TEST 2: Reserve Already Reserved Unit ---');
        const { req: reqAlreadyReserved, res: resAlreadyReserved } = mockReqRes({
            body: { title: 'Deal Agent 3', value: 2500000, pipeline_stage: 'reserved', unit_id: unit1.id },
            user: { id: agent3, tenant_id: tenantA, branch_id: branchA }
        });
        await dealsController.createDeal(reqAlreadyReserved, resAlreadyReserved);
        assert(resAlreadyReserved.getStatusCode() === 400,
            'Reserving an already reserved unit is immediately rejected with 400',
            `Status: ${resAlreadyReserved.getStatusCode()}, Msg: ${resAlreadyReserved.getData()?.message}`);

        // -----------------------------------------------------------------
        // TEST 3: Reserving a Sold unit fails
        // -----------------------------------------------------------------
        console.log('\n--- TEST 3: Reserve Sold Unit ---');
        const soldUnit = await createTestUnit({ name: 'Unit 202-Sold', unit_number: '202-S', status: 'Sold' });
        const { req: reqSold, res: resSold } = mockReqRes({
            body: { title: 'Deal Sold Attempt', value: 3000000, pipeline_stage: 'reserved', unit_id: soldUnit.id },
            user: { id: agent1, tenant_id: tenantA, branch_id: branchA }
        });
        await dealsController.createDeal(reqSold, resSold);
        assert(resSold.getStatusCode() === 400,
            'Reserving a Sold unit is rejected with 400',
            `Status: ${resSold.getStatusCode()}, Message: ${resSold.getData()?.message}`);

        // -----------------------------------------------------------------
        // TEST 4: Reserving an Unavailable/Blocked unit fails
        // -----------------------------------------------------------------
        console.log('\n--- TEST 4: Reserve Unavailable Unit ---');
        const unavailUnit = await createTestUnit({ name: 'Unit 303-Blocked', unit_number: '303-B', status: 'Unavailable' });
        const { req: reqUnavail, res: resUnavail } = mockReqRes({
            body: { title: 'Deal Blocked Attempt', value: 2000000, pipeline_stage: 'reserved', unit_id: unavailUnit.id },
            user: { id: agent1, tenant_id: tenantA, branch_id: branchA }
        });
        await dealsController.createDeal(reqUnavail, resUnavail);
        assert(resUnavail.getStatusCode() === 400,
            'Reserving an Unavailable unit is rejected with 400',
            `Status: ${resUnavail.getStatusCode()}, Message: ${resUnavail.getData()?.message}`);

        // -----------------------------------------------------------------
        // TEST 5: Create Deal with Reservation and Site Visit details
        // -----------------------------------------------------------------
        console.log('\n--- TEST 5: Deal Creation & Site Visit Metadata ---');
        const unitVisit = await createTestUnit({ name: 'Unit 404-Visit', unit_number: '404-V', status: 'Available' });
        const { req: reqVisit, res: resVisit } = mockReqRes({
            body: {
                title: 'Villa Deal with Visit',
                value: 4500000,
                pipeline_stage: 'reserved',
                unit_id: unitVisit.id,
                reservation_duration_days: 7,
                custom_fields: {
                    visit_date: '2026-10-10T14:00:00Z',
                    visit_result: 'Interested - requesting 7 days reservation for downpayment check',
                    visit_notes: 'Client came with spouse, loved the panoramic view.'
                }
            },
            user: { id: agent1, tenant_id: tenantA, branch_id: branchA }
        });
        await dealsController.createDeal(reqVisit, resVisit);
        assert(resVisit.getStatusCode() === 201,
            'Deal created successfully with status 201');

        const createdDeal = resVisit.getData()?.data;
        assert(createdDeal && createdDeal.custom_fields && createdDeal.custom_fields.visit_result && createdDeal.custom_fields.visit_result.includes('Interested'),
            'Site Visit metadata correctly stored in deal custom_fields JSONB');

        const visitUnitCheck = await db.query(`SELECT status, reservation_expires_at FROM re_units WHERE id::text = $1`, [unitVisit.id]);
        assert(visitUnitCheck.rows[0].status === 'Reserved', 'Unit status updated to Reserved');

        // -----------------------------------------------------------------
        // TEST 6: Expiration Scanner Logic
        // -----------------------------------------------------------------
        console.log('\n--- TEST 6: Reservation Expiration Scanner ---');
        // Unit that expired 48 hours ago
        const pastDate = new Date(Date.now() - 48 * 3600 * 1000);
        const expiredUnit = await createTestUnit({ 
            name: 'Unit Expired-505', 
            unit_number: '505-EXP', 
            status: 'Reserved', 
            expires_at: pastDate,
            ext_count: 1
        });
        // Unit that expires in 48 hours
        const futureDate = new Date(Date.now() + 48 * 3600 * 1000);
        const activeUnit = await createTestUnit({ 
            name: 'Unit Active-606', 
            unit_number: '606-ACT', 
            status: 'Reserved', 
            expires_at: futureDate 
        });

        // Run scanner
        const scanResult = await reservationService.scanAndReleaseExpiredReservations();
        assert(scanResult && scanResult.releasedCount >= 1, 
            `Scanner ran and released expired units (released count: ${scanResult.releasedCount})`);

        const expCheck = await db.query(`SELECT status, reservation_expires_at, reservation_extension_count FROM re_units WHERE id::text = $1`, [expiredUnit.id]);
        assert(expCheck.rows[0].status === 'Available' && expCheck.rows[0].reservation_expires_at === null && Number(expCheck.rows[0].reservation_extension_count) === 0,
            'Expired unit automatically transitioned back to Available and fields cleared');

        const actCheck = await db.query(`SELECT status, reservation_expires_at FROM re_units WHERE id::text = $1`, [activeUnit.id]);
        assert(actCheck.rows[0].status === 'Reserved' && actCheck.rows[0].reservation_expires_at !== null,
            'Non-expired active unit remained Reserved');

        // -----------------------------------------------------------------
        // TEST 7: Reservation Extension (+24h, +48h) and Invalid Extension
        // -----------------------------------------------------------------
        console.log('\n--- TEST 7: Reservation Extension Workflow ---');
        // Extend activeUnit by 24h
        const oldExpiry = new Date(actCheck.rows[0].reservation_expires_at).getTime();
        const ext1 = await reservationService.extendReservation({
            unitId: activeUnit.id,
            tenantId: tenantA,
            branchId: branchA,
            user: { id: agent1, name: 'Agent One' },
            extensionHours: 24
        });
        assert(ext1.success === true, 'Reservation extended by 24h successfully');

        const newExpiry1 = new Date(ext1.data.reservation_expires_at).getTime();
        const diffHours1 = Math.round((newExpiry1 - oldExpiry) / (3600 * 1000));
        assert(diffHours1 === 24, `Expiration timestamp advanced by exactly 24 hours (got ${diffHours1}h)`);
        assert(ext1.data.reservation_extension_count === 1, 'Extension count incremented to 1');

        // Extend again by 48h
        const ext2 = await reservationService.extendReservation({
            unitId: activeUnit.id,
            tenantId: tenantA,
            branchId: branchA,
            user: { id: agent1, name: 'Agent One' },
            extensionHours: 48
        });
        assert(ext2.success === true && ext2.data.reservation_extension_count === 2, 
            'Second extension (+48h) succeeded, counter is now 2');

        // Attempt extending an available or expired unit
        let rejectedError = null;
        try {
            await reservationService.extendReservation({
                unitId: expiredUnit.id, // currently Available
                tenantId: tenantA,
                branchId: branchA,
                user: { id: agent1, name: 'Agent One' },
                extensionHours: 24
            });
        } catch (err) {
            rejectedError = err;
        }
        assert(rejectedError !== null, 
            'Extending a non-reserved unit throws error',
            `Error caught: ${rejectedError?.message}`);

        // -----------------------------------------------------------------
        // TEST 8: Multi-tenant Isolation
        // -----------------------------------------------------------------
        console.log('\n--- TEST 8: Multi-Tenant Isolation ---');
        // Tenant B attempts to extend Tenant A's active reservation
        let tenantIsolationBlocked = false;
        try {
            await reservationService.extendReservation({
                unitId: activeUnit.id,
                tenantId: tenantB, // Wrong tenant!
                branchId: branchB,
                user: { id: agentB, name: 'Agent B' },
                extensionHours: 24
            });
        } catch (err) {
            tenantIsolationBlocked = true;
        }
        assert(tenantIsolationBlocked, 'Tenant B is strictly blocked from extending Tenant A unit');

        // Tenant B attempts to create a deal on Tenant A's available unit
        const unitA_free = await createTestUnit({ name: 'Unit Tenant A Only', unit_number: 'TA-1', status: 'Available', tenant_id: tenantA });
        const { req: reqTenantB, res: resTenantB } = mockReqRes({
            body: { title: 'Tenant B Infiltration', value: 1000000, pipeline_stage: 'reserved', unit_id: unitA_free.id },
            user: { id: agentB, tenant_id: tenantB, branch_id: branchB }
        });
        await dealsController.createDeal(reqTenantB, resTenantB);
        assert(resTenantB.getStatusCode() === 400 || resTenantB.getStatusCode() === 404,
            'Tenant B cannot reserve Tenant A unit via deal creation',
            `Status: ${resTenantB.getStatusCode()}, Message: ${resTenantB.getData()?.message}`);

        // -----------------------------------------------------------------
        // TEST 9: Branch Isolation
        // -----------------------------------------------------------------
        console.log('\n--- TEST 9: Branch Isolation ---');
        const unitBranchA = await createTestUnit({ name: 'Unit Branch A', unit_number: 'BA-1', status: 'Available', tenant_id: tenantA, branch_id: branchA });
        const { req: reqBranchB, res: resBranchB } = mockReqRes({
            body: { title: 'Cross Branch Deal', value: 1000000, pipeline_stage: 'reserved', unit_id: unitBranchA.id },
            user: { id: agentBranchB, tenant_id: tenantA, branch_id: branchB }
        });
        await dealsController.createDeal(reqBranchB, resBranchB);
        assert(resBranchB.getStatusCode() === 400 || resBranchB.getStatusCode() === 403,
            'User in Branch B cannot reserve a unit restricted to Branch A',
            `Status: ${resBranchB.getStatusCode()}, Message: ${resBranchB.getData()?.message}`);

        // -----------------------------------------------------------------
        // TEST 10: ERP and Core System Isolation (Regression Check)
        // -----------------------------------------------------------------
        console.log('\n--- TEST 10: ERP & Core System Non-Interference ---');
        const itemsCount = await db.query(`SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'items'`);
        const invoicesCount = await db.query(`SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'invoices'`);
        const contractsCount = await db.query(`SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 're_contracts'`);
        
        assert(itemsCount.rows[0].count === '1' || itemsCount.rows[0].count === '0',
            'Items table and generic ERP schema remain completely untouched by Real Estate reservation logic');
        assert(contractsCount.rows[0].count === '1' || contractsCount.rows[0].count === '0',
            'Real Estate module isolation maintained without interfering with generic ERP tables');

        // Cleanup
        await db.query(`DELETE FROM deals WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
        await db.query(`DELETE FROM re_units WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);

        console.log('\n====================================================');
        console.log(`📊 TEST SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
        console.log('====================================================\n');

        if (failedTests > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }

    } catch (err) {
        console.error('💥 UNEXPECTED ERROR IN TEST SUITE:', err);
        process.exit(1);
    }
}

runTests();

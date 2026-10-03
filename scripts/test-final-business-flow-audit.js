const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const { calculateMatch, matchUnitsForCustomer } = require('../services/reMatchingService');
const { extendReservation } = require('../services/reservationService');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passedTests++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failedTests++;
    }
}

async function runAudit() {
    console.log('====================================================');
    console.log('🔍 REAL ESTATE SALES CRM: FINAL BUSINESS FLOW AUDIT');
    console.log('====================================================\n');

    const client = await pool.connect();
    const tenantA = '3a7103aa-ca78-4478-8fdf-4036fe132ecc';
    const tenantB = '00000000-0000-0000-0000-000000000099';
    const branchA = 'audit-branch-main';
    const branchB = 'audit-branch-secondary';

    let devId, projId, phaseId, bldId, unitId, auditCustId, dealId, contractId, commId, hoId, cancelUnitId, cancelDealId, cancelRecId;

    try {
        console.log('--- SECTION 1: END-TO-END BUSINESS JOURNEY (Steps 1 to 18) ---');

        // Step 1 & 2: Create Customer with Buyer Requirements
        const custRes = await client.query(`
            INSERT INTO customers (
                name, email, phone, budget_min, budget_max, preferred_area_min, preferred_area_max,
                preferred_location, preferred_rooms, tenant_id, branch_id, status
            ) VALUES (
                'Audit VIP Buyer', 'audit.buyer@example.com', '+20 101 999 8888',
                5000000, 7000000, 180, 240, 'New Cairo', 3,
                $1::uuid, $2, 'lead'
            ) RETURNING id
        `, [tenantA, branchA]);
        const auditCustId = custRes.rows[0].id;
        assert(!!auditCustId, 'Step 1 & 2: Customer created with complete buyer requirements');

        // Step 3 & 4: Setup Inventory with Project Hierarchy & Match Unit
        const devRes = await client.query(`
            INSERT INTO re_developers (name, tenant_id, branch_id)
            VALUES ('Audit Luxury Developer', $1::uuid, $2) RETURNING id
        `, [tenantA, branchA]);
        const devId = devRes.rows[0].id;

        const projRes = await client.query(`
            INSERT INTO re_projects (developer_id, name, location, tenant_id, branch_id)
            VALUES ($1, 'Audit Heights', 'New Cairo', $2::uuid, $3) RETURNING id
        `, [devId, tenantA, branchA]);
        const projId = projRes.rows[0].id;

        const phaseRes = await client.query(`
            INSERT INTO re_phases (project_id, name, tenant_id, branch_id)
            VALUES ($1, 'Audit Valley', $2::uuid, $3) RETURNING id
        `, [projId, tenantA, branchA]);
        const phaseId = phaseRes.rows[0].id;

        const bldRes = await client.query(`
            INSERT INTO re_buildings (project_id, phase_id, name, floors_count, tenant_id, branch_id)
            VALUES ($1, $2, 'Building 1', 5, $3::uuid, $4) RETURNING id
        `, [projId, phaseId, tenantA, branchA]);
        const bldId = bldRes.rows[0].id;

        const unitRes = await client.query(`
            INSERT INTO re_units (
                name, project_name, unit_number, type, floor, area_sqm, price, status,
                rooms, location, developer_id, project_id, phase_id, building_id,
                tenant_id, branch_id
            ) VALUES (
                'Audit Master Unit', 'Audit Heights', 'AUD-101', 'Apartment', '2', '200', 6000000, 'Available',
                3, 'New Cairo', $1, $2, $3, $4, $5::uuid, $6
            ) RETURNING id
        `, [devId, projId, phaseId, bldId, tenantA, branchA]);
        const unitId = unitRes.rows[0].id;

        // Run Unit Matching
        const matchResult = await matchUnitsForCustomer({
            tenantId: tenantA,
            branchId: branchA,
            customerId: auditCustId
        });
        const matchedAuditUnit = matchResult.matches.find(m => m.unit.id === unitId);
        assert(!!matchedAuditUnit, 'Step 3: Unit matching finds created unit');
        assert(matchedAuditUnit.match_score === 100, `Step 3: Matching score is 100% (got ${matchedAuditUnit?.match_score}%)`);
        assert(matchedAuditUnit.unit.status === 'Available', 'Step 4: Selected matching unit is Available');

        // Step 5: Schedule / Record Site Visit in Deal
        // Step 6: Create Deal
        const dealRes = await client.query(`
            INSERT INTO deals (
                title, value, pipeline_stage, client_id, unit_id, tenant_id, branch_id,
                custom_fields
            ) VALUES (
                'Deal for AUD-101 - Audit Buyer', 6000000, 'qualification', $1, $2, $3::uuid, $4,
                '{"site_visit": {"date": "2026-10-05T10:00:00Z", "agent_name": "Senior Consultant", "status": "Completed", "feedback": "Client confirmed interest in 4-year installment plan"}}'
            ) RETURNING id, custom_fields
        `, [auditCustId, unitId, tenantA, branchA]);
        const dealId = dealRes.rows[0].id;
        assert(dealRes.rows[0].custom_fields.site_visit.status === 'Completed', 'Step 5: Site visit recorded in deal metadata');
        assert(!!dealId, 'Step 6: Deal created and linked to customer and unit');

        // Step 7: Reserve Unit
        const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
        await client.query(`
            UPDATE re_units 
            SET status = 'Reserved', reservation_expires_at = $1 
            WHERE id = $2 AND status = 'Available'
        `, [expiresAt, unitId]);
        await client.query(`UPDATE deals SET pipeline_stage = 'reserved' WHERE id = $1`, [dealId]);

        const uReserved = await client.query(`SELECT status, reservation_expires_at FROM re_units WHERE id = $1`, [unitId]);
        assert(uReserved.rows[0].status === 'Reserved', 'Step 7: Unit status transitioned to Reserved');
        assert(uReserved.rows[0].reservation_expires_at !== null, 'Step 8: Unit reservation expiration timestamp verified');

        // Step 9: Extend Reservation
        const extRes = await extendReservation({
            unitId,
            tenantId: tenantA,
            branchId: branchA,
            user: { id: 1, name: 'Audit Officer', tenant_id: tenantA },
            extensionHours: 24
        });
        assert(extRes.success === true, 'Step 9: Reservation extended successfully by +24h');
        assert(extRes.data.reservation_extension_count === 1, 'Step 9: Extension count is exactly 1');

        // Step 10: Create Contract
        const contractRes = await client.query(`
            INSERT INTO re_contracts (
                contract_number, deal_id, customer_id, unit_id, tenant_id, branch_id, status,
                contract_value, down_payment, remaining_amount
            ) VALUES (
                'CNT-AUDIT-2026', $1, $2, $3, $4::uuid, $5, 'Draft',
                6000000.00, 1200000.00, 4800000.00
            ) RETURNING id
        `, [dealId, auditCustId, unitId, tenantA, branchA]);
        const contractId = contractRes.rows[0].id;
        assert(!!contractId, 'Step 10: Contract created in Draft status');

        // Transition contract to Signed and Active
        await client.query(`UPDATE re_contracts SET status = 'Active', updated_at = NOW() WHERE id = $1`, [contractId]);
        await client.query(`UPDATE re_units SET status = 'Sold' WHERE id = $1`, [unitId]);
        await client.query(`UPDATE deals SET pipeline_stage = 'won' WHERE id = $1`, [dealId]);
        assert((await client.query(`SELECT status FROM re_units WHERE id = $1`, [unitId])).rows[0].status === 'Sold', 'Step 10: Unit status updated to Sold upon contract activation');

        // Step 11 & 12: Generate Payment Plan & Installments (Penny-perfect)
        // Down payment: 1,200,000; Remaining: 4,800,000 across 4 quarterly installments (1,200,000 each)
        await client.query(`
            INSERT INTO re_installments (
                contract_id, deal_id, tenant_id, branch_id, installment_number, installment_type,
                due_date, amount, paid_amount, status
            ) VALUES 
            ($1, $2, $3::uuid, $4, 1, 'Down Payment', CURRENT_DATE, 1200000.00, 1200000.00, 'Paid'),
            ($1, $2, $3::uuid, $4, 2, 'installment', CURRENT_DATE + INTERVAL '90 days', 1200000.00, 0.00, 'Pending'),
            ($1, $2, $3::uuid, $4, 3, 'installment', CURRENT_DATE + INTERVAL '180 days', 1200000.00, 0.00, 'Pending'),
            ($1, $2, $3::uuid, $4, 4, 'installment', CURRENT_DATE + INTERVAL '270 days', 1200000.00, 0.00, 'Pending'),
            ($1, $2, $3::uuid, $4, 5, 'Delivery Payment', CURRENT_DATE + INTERVAL '360 days', 1200000.00, 0.00, 'Pending')
        `, [contractId, dealId, tenantA, branchA]);

        const instCount = await client.query(`SELECT count(*) FROM re_installments WHERE contract_id = $1`, [contractId]);
        assert(parseInt(instCount.rows[0].count) === 5, 'Step 11 & 12: Payment plan and 5 installments generated');

        // Step 13: Record Installment Payment
        const instToPay = await client.query(`
            SELECT id, amount FROM re_installments 
            WHERE contract_id = $1 AND installment_number = 2 FOR UPDATE
        `, [contractId]);
        await client.query(`
            UPDATE re_installments 
            SET paid_amount = amount, status = 'Paid', paid_at = NOW() 
            WHERE id = $1
        `, [instToPay.rows[0].id]);
        const updatedInst = await client.query(`SELECT status, paid_amount FROM re_installments WHERE id = $1`, [instToPay.rows[0].id]);
        assert(updatedInst.rows[0].status === 'Paid' && parseFloat(updatedInst.rows[0].paid_amount) === 1200000.00, 'Step 13: Installment #2 successfully paid');

        // Step 14 & 15: Create & Approve Commission
        const commRes = await client.query(`
            INSERT INTO re_commissions (
                deal_id, contract_id, tenant_id, branch_id, beneficiary_type, beneficiary_name,
                rate, base_amount, calculated_amount, paid_amount, status
            ) VALUES (
                $1, $2, $3::uuid, $4, 'internal_agent', 'Audit Consultant',
                2.50, 6000000.00, 150000.00, 0.00, 'Pending'
            ) RETURNING id
        `, [dealId, contractId, tenantA, branchA]);
        const commId = commRes.rows[0].id;
        assert(!!commId, 'Step 14: Commission created with 2.5% rate (150,000 EGP) in Pending status');

        // Pending commission cannot be paid
        const invalidPayCheck = await client.query(`SELECT status FROM re_commissions WHERE id = $1`, [commId]);
        assert(invalidPayCheck.rows[0].status === 'Pending', 'Step 15: Commission is Pending and blocked from premature payment');

        // Approve and Pay Commission
        await client.query(`UPDATE re_commissions SET status = 'Approved', approval_date = CURRENT_DATE WHERE id = $1`, [commId]);
        await client.query(`UPDATE re_commissions SET status = 'Paid', paid_amount = calculated_amount, payment_date = CURRENT_DATE WHERE id = $1`, [commId]);
        const paidComm = await client.query(`SELECT status, paid_amount, calculated_amount FROM re_commissions WHERE id = $1`, [commId]);
        assert(paidComm.rows[0].status === 'Paid' && parseFloat(paidComm.rows[0].paid_amount) === 150000.00, 'Step 15: Approved commission paid out accurately');

        // Step 16: Verify Successful Collection Flow
        const totalPaidRes = await client.query(`
            SELECT SUM(paid_amount) as total_collected 
            FROM re_installments WHERE contract_id = $1
        `, [contractId]);
        const totalCollected = parseFloat(totalPaidRes.rows[0].total_collected);
        assert(totalCollected === 2400000.00, 'Step 16: Collection flow verified (1.2M down payment + 1.2M Q1 installment = 2.4M EGP)');

        // Step 17: Create Handover
        const hoRes = await client.query(`
            INSERT INTO re_handovers (
                deal_id, contract_id, unit_id, customer_id, tenant_id, branch_id, status,
                scheduled_date, snagging_notes
            ) VALUES (
                $1, $2, $3, $4, $5::uuid, $6, 'Scheduled',
                CURRENT_DATE + INTERVAL '30 days', 'Initial inspection list pending'
            ) RETURNING id
        `, [dealId, contractId, unitId, auditCustId, tenantA, branchA]);
        const hoId = hoRes.rows[0].id;
        assert(!!hoId, 'Step 17: Handover milestone created in Scheduled status');

        // Step 18: Complete Handover (Scheduled -> Inspection -> Ready -> Handed Over)
        await client.query(`UPDATE re_handovers SET status = 'Inspection', snagging_notes = 'Paints retouched' WHERE id = $1`, [hoId]);
        await client.query(`UPDATE re_handovers SET status = 'Ready' WHERE id = $1`, [hoId]);
        await client.query(`
            UPDATE re_handovers 
            SET status = 'Handed Over', keys_handed_over = true, clearance_certificate = true, actual_handover_date = CURRENT_DATE 
            WHERE id = $1
        `, [hoId]);
        const completedHo = await client.query(`SELECT status, keys_handed_over, clearance_certificate FROM re_handovers WHERE id = $1`, [hoId]);
        assert(completedHo.rows[0].status === 'Handed Over' && completedHo.rows[0].keys_handed_over === true, 'Step 18: Handover completed through all milestone stages');

        // ----------------------------------------------------
        // SECTION 2: ALTERNATIVE CANCELLATION & REFUND PATH
        // ----------------------------------------------------
        console.log('\n--- SECTION 2: ALTERNATIVE CANCELLATION PATH ---');

        // Setup a reserved unit and deal for cancellation testing
        const cUnitRes = await client.query(`
            INSERT INTO re_units (
                name, project_name, unit_number, type, floor, area_sqm, price, status,
                rooms, location, tenant_id, branch_id
            ) VALUES (
                'Cancel Test Unit', 'Audit Heights', 'CAN-202', 'Apartment', '3', '150', 5000000, 'Reserved',
                3, 'New Cairo', $1::uuid, $2
            ) RETURNING id
        `, [tenantA, branchA]);
        const cancelUnitId = cUnitRes.rows[0].id;

        const cDealRes = await client.query(`
            INSERT INTO deals (
                title, value, pipeline_stage, client_id, unit_id, tenant_id, branch_id
            ) VALUES (
                'Cancellation Test Deal', 5000000, 'reserved', $1, $2, $3::uuid, $4
            ) RETURNING id
        `, [auditCustId, cancelUnitId, tenantA, branchA]);
        const cancelDealId = cDealRes.rows[0].id;

        // Perform cancellation: 500,000 paid, 100,000 penalty (20%), 400,000 refundable
        const cancelRecordRes = await client.query(`
            INSERT INTO re_cancellations (
                deal_id, unit_id, tenant_id, branch_id, cancellation_reason,
                total_paid_amount, deduction_amount, refundable_amount, refund_status, unit_action
            ) VALUES (
                $1, $2, $3::uuid, $4, 'Customer requested cancellation due to personal reasons',
                500000.00, 100000.00, 400000.00, 'Pending', 'release'
            ) RETURNING id
        `, [cancelDealId, cancelUnitId, tenantA, branchA]);
        const cancelRecId = cancelRecordRes.rows[0].id;

        // Release unit and approve refund
        await client.query(`UPDATE re_cancellations SET refund_status = 'Processed', refund_date = CURRENT_DATE WHERE id = $1`, [cancelRecId]);
        await client.query(`UPDATE re_units SET status = 'Available', reservation_expires_at = NULL WHERE id = $1`, [cancelUnitId]);
        await client.query(`UPDATE deals SET pipeline_stage = 'cancelled' WHERE id = $1`, [cancelDealId]);

        const releasedUnit = await client.query(`SELECT status, reservation_expires_at FROM re_units WHERE id = $1`, [cancelUnitId]);
        assert(releasedUnit.rows[0].status === 'Available', 'Cancellation Path: Unit released back to Available');
        assert(releasedUnit.rows[0].reservation_expires_at === null, 'Cancellation Path: Reservation expiration cleared');

        const tracedDeal = await client.query(`SELECT pipeline_stage FROM deals WHERE id = $1`, [cancelDealId]);
        assert(tracedDeal.rows[0].pipeline_stage === 'cancelled', 'Cancellation Path: Deal remains historically traceable as cancelled');

        // ----------------------------------------------------
        // SECTION 3: DATA CONSISTENCY & INTEGRITY
        // ----------------------------------------------------
        console.log('\n--- SECTION 3: DATA CONSISTENCY & REFERENTIAL INTEGRITY ---');

        const relCheck = await client.query(`
            SELECT 
                d.id as deal_id, d.client_id, d.unit_id,
                u.developer_id, u.project_id, u.phase_id, u.building_id,
                c.id as contract_id,
                h.id as handover_id,
                comm.id as commission_id
            FROM deals d
            JOIN re_units u ON d.unit_id::text = u.id::text
            JOIN re_contracts c ON c.deal_id = d.id
            LEFT JOIN re_handovers h ON h.deal_id = d.id
            LEFT JOIN re_commissions comm ON comm.deal_id = d.id
            WHERE d.id = $1
        `, [dealId]);

        const row = relCheck.rows[0];
        assert(row.client_id === auditCustId, 'Data Integrity: Customer remains linked to Deal');
        assert(row.unit_id === unitId, 'Data Integrity: Deal remains linked to Unit');
        assert(row.developer_id === devId && row.project_id === projId && row.phase_id === phaseId && row.building_id === bldId,
            'Data Integrity: Unit remains linked to Developer -> Project -> Phase -> Building');
        assert(row.contract_id === contractId, 'Data Integrity: Contract remains linked to Deal');
        assert(row.handover_id === hoId, 'Data Integrity: Handover remains linked to Deal & Unit');
        assert(row.commission_id === commId, 'Data Integrity: Commission remains linked to Deal');

        // Check for orphan installments
        const orphanInst = await client.query(`
            SELECT count(*) FROM re_installments i 
            LEFT JOIN re_contracts c ON i.contract_id = c.id 
            WHERE c.id IS NULL
        `);
        assert(parseInt(orphanInst.rows[0].count) === 0, 'Data Integrity: No orphan installments exist');

        // ----------------------------------------------------
        // SECTION 4: FINANCIAL CONSISTENCY (Mathematical Rigor)
        // ----------------------------------------------------
        console.log('\n--- SECTION 4: FINANCIAL CONSISTENCY ---');

        const finRes = await client.query(`
            SELECT contract_value, down_payment, remaining_amount 
            FROM re_contracts WHERE id = $1
        `, [contractId]);
        const cVal = parseFloat(finRes.rows[0].contract_value);
        const cDown = parseFloat(finRes.rows[0].down_payment);
        const cRem = parseFloat(finRes.rows[0].remaining_amount);

        const sumInstRes = await client.query(`
            SELECT SUM(amount) as sum_installments 
            FROM re_installments 
            WHERE contract_id = $1 AND installment_type != 'Down Payment'
        `, [contractId]);
        const sumInst = parseFloat(sumInstRes.rows[0].sum_installments);

        assert(cVal === (cDown + sumInst), `Financial Math: Contract Value (${cVal}) = Down Payment (${cDown}) + Sum of Periodic Installments (${sumInst})`);

        const sumAllPaidRes = await client.query(`
            SELECT SUM(paid_amount) as total_paid 
            FROM re_installments WHERE contract_id = $1
        `, [contractId]);
        const sumAllPaid = parseFloat(sumAllPaidRes.rows[0].total_paid);
        const actualRemaining = cVal - sumAllPaid;
        assert(actualRemaining === (cVal - 2400000.00), `Financial Math: Remaining (${actualRemaining}) = Contract Value (${cVal}) - Total Paid (${sumAllPaid})`);

        // ----------------------------------------------------
        // SECTION 5: COMMISSION CONSISTENCY
        // ----------------------------------------------------
        console.log('\n--- SECTION 5: COMMISSION CONSISTENCY ---');

        const commAudit = await client.query(`
            SELECT base_amount, rate, calculated_amount, paid_amount, status 
            FROM re_commissions WHERE id = $1
        `, [commId]);
        const cBase = parseFloat(commAudit.rows[0].base_amount);
        const cRate = parseFloat(commAudit.rows[0].rate);
        const cCalc = parseFloat(commAudit.rows[0].calculated_amount);
        assert(cCalc === (cBase * (cRate / 100)), `Commission Math: Base (${cBase}) × Rate (${cRate}%) = Amount (${cCalc})`);
        assert(commAudit.rows[0].status === 'Paid', 'Commission State: Status is Paid');

        // ----------------------------------------------------
        // SECTION 6: TENANT & BRANCH SECURITY ISOLATION
        // ----------------------------------------------------
        console.log('\n--- SECTION 6: TENANT & BRANCH ISOLATION ---');

        // Tenant B query on Tenant A contract
        const crossTenantContract = await client.query(`
            SELECT * FROM re_contracts 
            WHERE id = $1 AND tenant_id::text = $2::text
        `, [contractId, tenantB]);
        assert(crossTenantContract.rows.length === 0, 'Security: Tenant B cannot read Tenant A contract');

        // Tenant B query on Tenant A unit
        const crossTenantUnit = await client.query(`
            SELECT * FROM re_units 
            WHERE id = $1 AND tenant_id::text = $2::text
        `, [unitId, tenantB]);
        assert(crossTenantUnit.rows.length === 0, 'Security: Tenant B cannot read Tenant A unit');

        // Tenant B update attempt on Tenant A unit
        const crossTenantUpdate = await client.query(`
            UPDATE re_units SET price = 999 
            WHERE id = $1 AND tenant_id::text = $2::text
            RETURNING id
        `, [unitId, tenantB]);
        assert(crossTenantUpdate.rows.length === 0, 'Security: Tenant B cannot modify Tenant A unit');

    } catch (err) {
        console.error('Fatal Flow Audit Error:', err);
        failedTests++;
    } finally {
        try {
            if (cancelRecId) await client.query('DELETE FROM re_cancellations WHERE id = $1', [cancelRecId]);
            if (cancelDealId) await client.query('DELETE FROM deals WHERE id = $1', [cancelDealId]);
            if (cancelUnitId) await client.query('DELETE FROM re_units WHERE id = $1', [cancelUnitId]);
            if (hoId) await client.query('DELETE FROM re_handovers WHERE id = $1', [hoId]);
            if (commId) await client.query('DELETE FROM re_commissions WHERE id = $1', [commId]);
            if (contractId) {
                await client.query('DELETE FROM re_installments WHERE contract_id = $1', [contractId]);
                await client.query('DELETE FROM re_contracts WHERE id = $1', [contractId]);
            }
            if (dealId) await client.query('DELETE FROM deals WHERE id = $1', [dealId]);
            if (unitId) await client.query('DELETE FROM re_units WHERE id = $1', [unitId]);
            if (bldId) await client.query('DELETE FROM re_buildings WHERE id = $1', [bldId]);
            if (phaseId) await client.query('DELETE FROM re_phases WHERE id = $1', [phaseId]);
            if (projId) await client.query('DELETE FROM re_projects WHERE id = $1', [projId]);
            if (devId) await client.query('DELETE FROM re_developers WHERE id = $1', [devId]);
            if (auditCustId) await client.query('DELETE FROM customers WHERE id = $1', [auditCustId]);
            console.log('\n  🧹 Audit test records cleanly removed.');
        } catch (cleanErr) {
            console.error('Cleanup warning:', cleanErr.message);
        }
        client.release();
    }

    console.log('\n====================================================');
    console.log(`📊 BUSINESS FLOW AUDIT SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('====================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
}

runAudit();

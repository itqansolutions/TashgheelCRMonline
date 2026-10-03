const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const bcrypt = require('bcrypt');

async function seedDemoData() {
    console.log('====================================================');
    console.log('🌱 SEEDING COMPREHENSIVE REAL ESTATE DEMO DATA');
    console.log('Tenant: 3a7103aa-ca78-4478-8fdf-4036fe132ecc');
    console.log('====================================================\n');

    const client = await pool.connect();
    const tId = '3a7103aa-ca78-4478-8fdf-4036fe132ecc';

    try {
        await client.query('BEGIN');

        // 0. Ensure Real Estate Business Template
        console.log('0. Ensuring Real Estate Business Template...');
        await client.query(`
            INSERT INTO business_templates (name, config, created_at)
            VALUES ('real_estate', '{"features": ["hierarchy", "contracts", "installments", "commissions", "handovers", "matching"]}', NOW())
            ON CONFLICT (name) DO NOTHING
        `);

        // 1. Ensure Tenant Record Exists
        console.log('1. Ensuring Tenant...');
        await client.query(`
            INSERT INTO tenants (
                id, name, slug, template_name, plan, status, currency, primary_color, created_at
            ) VALUES (
                $1::uuid, 'Tashgheel Real Estate Group', 'tashgheel-re-group',
                'real_estate', 'enterprise', 'active', 'EGP', '#0284c7', NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                template_name = 'real_estate',
                status = 'active',
                currency = 'EGP'
        `, [tId]);

        // 2. Ensure Main Branch
        console.log('2. Ensuring Branch...');
        const branchCheck = await client.query(`SELECT id FROM branches WHERE tenant_id::text = $1 LIMIT 1`, [tId]);
        let branchId;
        if (branchCheck.rows.length === 0) {
            const bRes = await client.query(`
                INSERT INTO branches (name, tenant_id, is_main, currency, created_at)
                VALUES ('New Cairo Flagship Branch', $1::uuid, true, 'EGP', NOW())
                RETURNING id
            `, [tId]);
            branchId = bRes.rows[0].id;
        } else {
            branchId = branchCheck.rows[0].id;
        }

        // 3. Ensure Demo Users (Sales Director & Agent)
        console.log('3. Ensuring Demo Users...');
        const passwordHash = await bcrypt.hash('Demo@1234', 10);
        let userDirectorRes = await client.query(`SELECT id FROM users WHERE email = 'karim.director@tashgheel-re.com' LIMIT 1`);
        let directorId;
        if (userDirectorRes.rows.length === 0) {
            const uRes = await client.query(`
                INSERT INTO users (name, email, password_hash, role, tenant_id, created_at)
                VALUES ('Karim Mansour (Sales Director)', 'karim.director@tashgheel-re.com', $1, 'admin', $2::uuid, NOW())
                RETURNING id
            `, [passwordHash, tId]);
            directorId = uRes.rows[0].id;
        } else {
            directorId = userDirectorRes.rows[0].id;
        }

        let userAgentRes = await client.query(`SELECT id FROM users WHERE email = 'nour.agent@tashgheel-re.com' LIMIT 1`);
        let agentId;
        if (userAgentRes.rows.length === 0) {
            const uRes = await client.query(`
                INSERT INTO users (name, email, password_hash, role, tenant_id, created_at)
                VALUES ('Nour Al-Sabah (Senior Property Consultant)', 'nour.agent@tashgheel-re.com', $1, 'employee', $2::uuid, NOW())
                RETURNING id
            `, [passwordHash, tId]);
            agentId = uRes.rows[0].id;
        } else {
            agentId = userAgentRes.rows[0].id;
        }

        // Clean previous seed items for this tenant to ensure fresh idempotency
        console.log('4. Cleaning old tenant demo data...');
        await client.query(`DELETE FROM re_cancellations WHERE tenant_id::text = $1`, [tId]);
        await client.query(`DELETE FROM re_handovers WHERE tenant_id::text = $1`, [tId]);
        await client.query(`DELETE FROM re_commissions WHERE tenant_id::text = $1`, [tId]);
        await client.query(`DELETE FROM re_installments WHERE tenant_id::text = $1`, [tId]);
        await client.query(`DELETE FROM re_contracts WHERE tenant_id::text = $1`, [tId]);
        await client.query(`DELETE FROM deals WHERE tenant_id::text = $1`, [tId]);
        await client.query(`DELETE FROM re_units WHERE tenant_id::text = $1`, [tId]);
        await client.query(`DELETE FROM re_buildings WHERE tenant_id::text = $1`, [tId]);
        await client.query(`DELETE FROM re_phases WHERE tenant_id::text = $1`, [tId]);
        await client.query(`DELETE FROM re_projects WHERE tenant_id::text = $1`, [tId]);
        await client.query(`DELETE FROM re_developers WHERE tenant_id::text = $1`, [tId]);
        await client.query(`DELETE FROM customers WHERE tenant_id::text = $1`, [tId]);

        // 5. Developers
        console.log('5. Inserting Developers...');
        const dev1 = await client.query(`
            INSERT INTO re_developers (name, tenant_id, branch_id, phone, email, contact_person)
            VALUES ('Emaar Misr', $1::uuid, $2, '+20 2 16116', 'sales@emaarmisr.com', 'Ahmed Zaki')
            RETURNING id
        `, [tId, String(branchId)]);
        const dev1Id = dev1.rows[0].id;

        const dev2 = await client.query(`
            INSERT INTO re_developers (name, tenant_id, branch_id, phone, email, contact_person)
            VALUES ('Palm Hills Developments', $1::uuid, $2, '+20 2 19743', 'info@palmhills.com', 'Yasser Mansour')
            RETURNING id
        `, [tId, String(branchId)]);
        const dev2Id = dev2.rows[0].id;

        const dev3 = await client.query(`
            INSERT INTO re_developers (name, tenant_id, branch_id, phone, email, contact_person)
            VALUES ('SODIC Developments', $1::uuid, $2, '+20 2 16220', 'sales@sodic.com', 'Magued Sherif')
            RETURNING id
        `, [tId, String(branchId)]);
        const dev3Id = dev3.rows[0].id;

        // 6. Projects
        console.log('6. Inserting Projects...');
        const proj1 = await client.query(`
            INSERT INTO re_projects (developer_id, name, location, tenant_id, branch_id, description)
            VALUES ($1, 'Uptown Cairo', 'Mokattam / New Cairo Axis', $2::uuid, $3, 'Luxury gated community perched 200m above sea level.')
            RETURNING id
        `, [dev1Id, tId, String(branchId)]);
        const proj1Id = proj1.rows[0].id;

        const proj2 = await client.query(`
            INSERT INTO re_projects (developer_id, name, location, tenant_id, branch_id, description)
            VALUES ($1, 'Palm Hills New Cairo', 'New Cairo Fifth Settlement', $2::uuid, $3, 'Integrated 500-acre residential landmark with premier golf club.')
            RETURNING id
        `, [dev2Id, tId, String(branchId)]);
        const proj2Id = proj2.rows[0].id;

        const proj3 = await client.query(`
            INSERT INTO re_projects (developer_id, name, location, tenant_id, branch_id, description)
            VALUES ($1, 'Villette New Cairo', 'Golden Square, New Cairo', $2::uuid, $3, 'Signature modern park-style master community.')
            RETURNING id
        `, [dev3Id, tId, String(branchId)]);
        const proj3Id = proj3.rows[0].id;

        // 7. Phases
        console.log('7. Inserting Phases...');
        const ph1 = await client.query(`
            INSERT INTO re_phases (project_id, name, tenant_id, branch_id)
            VALUES ($1, 'Celesta Hills', $2::uuid, $3) RETURNING id
        `, [proj1Id, tId, String(branchId)]);
        const ph1Id = ph1.rows[0].id;

        const ph2 = await client.query(`
            INSERT INTO re_phases (project_id, name, tenant_id, branch_id)
            VALUES ($1, 'The Crown Villas', $2::uuid, $3) RETURNING id
        `, [proj2Id, tId, String(branchId)]);
        const ph2Id = ph2.rows[0].id;

        const ph3 = await client.query(`
            INSERT INTO re_phases (project_id, name, tenant_id, branch_id)
            VALUES ($1, 'Sky Condos', $2::uuid, $3) RETURNING id
        `, [proj3Id, tId, String(branchId)]);
        const ph3Id = ph3.rows[0].id;

        // 8. Buildings
        console.log('8. Inserting Buildings...');
        const bld1 = await client.query(`
            INSERT INTO re_buildings (project_id, phase_id, name, floors_count, tenant_id, branch_id)
            VALUES ($1, $2, 'Building 12 - Orchid', 6, $3::uuid, $4) RETURNING id
        `, [proj1Id, ph1Id, tId, String(branchId)]);
        const bld1Id = bld1.rows[0].id;

        const bld2 = await client.query(`
            INSERT INTO re_buildings (project_id, phase_id, name, floors_count, tenant_id, branch_id)
            VALUES ($1, $2, 'Tower B - Palm Panorama', 10, $3::uuid, $4) RETURNING id
        `, [proj2Id, ph2Id, tId, String(branchId)]);
        const bld2Id = bld2.rows[0].id;

        const bld3 = await client.query(`
            INSERT INTO re_buildings (project_id, phase_id, name, floors_count, tenant_id, branch_id)
            VALUES ($1, $2, 'Building 4 - Jasmine', 5, $3::uuid, $4) RETURNING id
        `, [proj3Id, ph3Id, tId, String(branchId)]);
        const bld3Id = bld3.rows[0].id;

        // 9. Units Inventory
        console.log('9. Inserting Units...');
        // Unit 1: Available Luxury Apartment (Perfect match for Buyer 1)
        const u1 = await client.query(`
            INSERT INTO re_units (
                name, project_name, unit_number, type, floor, area_sqm, price, status,
                rooms, location, developer_id, project_id, phase_id, building_id,
                tenant_id, branch_id, responsible_person_id
            ) VALUES (
                'Prime Garden Apartment', 'Uptown Cairo', 'APT-101', 'Apartment', '1', '175', 4800000, 'Available',
                3, 'New Cairo Fifth Settlement', $1, $2, $3, $4, $5::uuid, $6, $7
            ) RETURNING id
        `, [dev1Id, proj1Id, ph1Id, bld1Id, tId, String(branchId), String(agentId)]);
        const unit1Id = u1.rows[0].id;

        // Unit 2: Reserved Signature Penthouse
        const expiresAt = new Date(Date.now() + 48 * 3600 * 1000); // 48h from now
        const extendedAt = new Date(Date.now() - 2 * 3600 * 1000);
        const u2 = await client.query(`
            INSERT INTO re_units (
                name, project_name, unit_number, type, floor, area_sqm, price, status,
                rooms, location, developer_id, project_id, phase_id, building_id,
                tenant_id, branch_id, responsible_person_id,
                reservation_expires_at, reservation_extended_at, reservation_extended_by, reservation_extension_count
            ) VALUES (
                'Signature Penthouse', 'Palm Hills New Cairo', 'PH-404', 'Apartment', '4', '290', 9200000, 'Reserved',
                4, 'New Cairo Fifth Settlement', $1, $2, $3, $4, $5::uuid, $6, $7,
                $8, $9, 'Karim Mansour', 1
            ) RETURNING id
        `, [dev2Id, proj2Id, ph2Id, bld2Id, tId, String(branchId), String(agentId), expiresAt, extendedAt]);
        const unit2Id = u2.rows[0].id;

        // Unit 3: Sold Standalone Villa (with Contract, Installments, Commission, Handover)
        const u3 = await client.query(`
            INSERT INTO re_units (
                name, project_name, unit_number, type, floor, area_sqm, price, status,
                rooms, location, developer_id, project_id, phase_id, building_id,
                tenant_id, branch_id, responsible_person_id
            ) VALUES (
                'Grand Standalone Villa', 'Palm Hills New Cairo', 'VIL-07', 'Villa', '1', '380', 16500000, 'Sold',
                5, 'New Cairo', $1, $2, $3, $4, $5::uuid, $6, $7
            ) RETURNING id
        `, [dev2Id, proj2Id, ph2Id, bld2Id, tId, String(branchId), String(directorId)]);
        const unit3Id = u3.rows[0].id;

        // Unit 4: Commercial Retail Unit
        const u4 = await client.query(`
            INSERT INTO re_units (
                name, project_name, unit_number, type, floor, area_sqm, price, status,
                rooms, location, developer_id, project_id, phase_id, building_id,
                tenant_id, branch_id, responsible_person_id
            ) VALUES (
                'Boulevard Retail Shop', 'Villette New Cairo', 'COM-02', 'Commercial', '0', '110', 7500000, 'Available',
                2, 'Golden Square New Cairo', $1, $2, $3, $4, $5::uuid, $6, $7
            ) RETURNING id
        `, [dev3Id, proj3Id, ph3Id, bld3Id, tId, String(branchId), String(agentId)]);
        const unit4Id = u4.rows[0].id;

        // Unit 5: Sky Duplex (Released back to Available after Cancellation)
        const u5 = await client.query(`
            INSERT INTO re_units (
                name, project_name, unit_number, type, floor, area_sqm, price, status,
                rooms, location, developer_id, project_id, phase_id, building_id,
                tenant_id, branch_id, responsible_person_id
            ) VALUES (
                'Panoramic Sky Duplex', 'Villette New Cairo', 'DUP-301', 'Apartment', '3', '240', 8100000, 'Available',
                4, 'Golden Square New Cairo', $1, $2, $3, $4, $5::uuid, $6, $7
            ) RETURNING id
        `, [dev3Id, proj3Id, ph3Id, bld3Id, tId, String(branchId), String(agentId)]);
        const unit5Id = u5.rows[0].id;

        // 10. Customers (Leads & Buyers)
        console.log('10. Inserting Customers...');
        // Customer 1: High-intent buyer lead ready for Unit Matching
        const c1 = await client.query(`
            INSERT INTO customers (
                name, email, phone, company_name, entity_type, status,
                budget_min, budget_max, preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
                tenant_id, branch_id, assigned_to, source
            ) VALUES (
                'Tarek Al-Mansoor', 'tarek.mansoor@gmail.com', '+20 100 234 5678', 'Al-Mansoor Trading', 'customer', 'lead',
                4000000, 5000000, 160, 200, 'New Cairo', 3,
                $1::uuid, $2, $3, 'Direct'
            ) RETURNING id
        `, [tId, String(branchId), agentId]);
        const cust1Id = c1.rows[0].id;

        // Customer 2: Buyer with Active Reservation
        const c2 = await client.query(`
            INSERT INTO customers (
                name, email, phone, company_name, entity_type, status,
                budget_min, budget_max, preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
                tenant_id, branch_id, assigned_to, source
            ) VALUES (
                'Nour El-Din Hassan', 'nour.hassan@outlook.com', '+20 111 876 5432', 'TechnoSoft Solutions', 'customer', 'customer',
                8500000, 10000000, 260, 320, 'New Cairo', 4,
                $1::uuid, $2, $3, 'Referral'
            ) RETURNING id
        `, [tId, String(branchId), agentId]);
        const cust2Id = c2.rows[0].id;

        // Customer 3: Contracted VIP Buyer (Won Deal)
        const c3 = await client.query(`
            INSERT INTO customers (
                name, email, phone, company_name, entity_type, status,
                budget_min, budget_max, preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
                tenant_id, branch_id, assigned_to, source
            ) VALUES (
                'Dr. Hesham Fahmy', 'dr.hesham@fahmy-clinic.org', '+20 122 345 6789', 'Fahmy Medical Center', 'customer', 'customer',
                15000000, 18000000, 350, 420, 'New Cairo', 5,
                $1::uuid, $2, $3, 'VIP Client'
            ) RETURNING id
        `, [tId, String(branchId), directorId]);
        const cust3Id = c3.rows[0].id;

        // Customer 4: Cancelled Deal Buyer
        const c4 = await client.query(`
            INSERT INTO customers (
                name, email, phone, company_name, entity_type, status,
                budget_min, budget_max, preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
                tenant_id, branch_id, assigned_to, source
            ) VALUES (
                'Eng. Mona Zaki', 'mona.zaki@egypteng.com', '+20 109 988 7766', 'Architecture Horizons', 'customer', 'customer',
                7500000, 8500000, 220, 260, 'New Cairo', 4,
                $1::uuid, $2, $3, 'Digital Ad'
            ) RETURNING id
        `, [tId, String(branchId), agentId]);
        const cust4Id = c4.rows[0].id;

        // 11. Deals
        console.log('11. Inserting Deals...');
        // Deal 1: Ongoing Negotiation for Unit 1
        const d1 = await client.query(`
            INSERT INTO deals (
                title, value, pipeline_stage, client_id, unit_id, assigned_to, tenant_id, branch_id,
                probability, custom_fields, created_at
            ) VALUES (
                'APT-101 Negotiation - Tarek Al-Mansoor', 4800000, 'qualification', $1, $2, $3, $4::uuid, $5,
                40, '{"preferred_view": "Landscape garden"}', NOW()
            ) RETURNING id
        `, [cust1Id, unit1Id, agentId, tId, String(branchId)]);
        const deal1Id = d1.rows[0].id;

        // Deal 2: Reserved Deal with Site Visit metadata
        const d2 = await client.query(`
            INSERT INTO deals (
                title, value, pipeline_stage, client_id, unit_id, assigned_to, tenant_id, branch_id,
                probability, custom_fields, created_at
            ) VALUES (
                'PH-404 Reservation - Nour El-Din', 9200000, 'reserved', $1, $2, $3, $4::uuid, $5,
                80, '{"site_visit": {"date": "2026-10-02T14:00:00Z", "agent_name": "Nour Al-Sabah", "feedback": "Client loved the terrace view, requested payment plan with 8 years installments.", "status": "Completed"}}', NOW()
            ) RETURNING id
        `, [cust2Id, unit2Id, agentId, tId, String(branchId)]);
        const deal2Id = d2.rows[0].id;

        // Deal 3: Won Deal for Standalone Villa
        const d3 = await client.query(`
            INSERT INTO deals (
                title, value, pipeline_stage, client_id, unit_id, assigned_to, tenant_id, branch_id,
                probability, custom_fields, created_at
            ) VALUES (
                'VIL-07 Contracted Purchase - Dr. Hesham Fahmy', 16500000, 'won', $1, $2, $3, $4::uuid, $5,
                100, '{"down_payment_received": true, "sales_channel": "Direct In-House"}', NOW()
            ) RETURNING id
        `, [cust3Id, unit3Id, directorId, tId, String(branchId)]);
        const deal3Id = d3.rows[0].id;

        // Deal 4: Cancelled Deal
        const d4 = await client.query(`
            INSERT INTO deals (
                title, value, pipeline_stage, client_id, unit_id, assigned_to, tenant_id, branch_id,
                probability, custom_fields, created_at
            ) VALUES (
                'DUP-301 Cancelled Booking - Mona Zaki', 8100000, 'cancelled', $1, $2, $3, $4::uuid, $5,
                0, '{"cancellation_processed": true}', NOW()
            ) RETURNING id
        `, [cust4Id, unit5Id, agentId, tId, String(branchId)]);
        const deal4Id = d4.rows[0].id;

        // 12. Contract for Deal 3
        console.log('12. Inserting Contract...');
        const contractRes = await client.query(`
            INSERT INTO re_contracts (
                contract_number, deal_id, customer_id, unit_id, tenant_id, branch_id, status,
                contract_value, down_payment, remaining_amount, notes
            ) VALUES (
                'CNT-2026-0089', $1, $2, $3, $4::uuid, $5, 'Active',
                16500000.00, 3300000.00, 13200000.00,
                'VIP Contract - 20% Down Payment, remaining over 4 years quarterly installments.'
            ) RETURNING id
        `, [deal3Id, cust3Id, unit3Id, tId, String(branchId)]);
        const contractId = contractRes.rows[0].id;

        // 13. Installments for Contract (Penny-perfect)
        console.log('13. Inserting Installment Schedule...');
        // Down payment (Already Paid)
        await client.query(`
            INSERT INTO re_installments (
                contract_id, deal_id, tenant_id, branch_id, installment_number, installment_type,
                due_date, amount, paid_amount, status, paid_at, notes
            ) VALUES (
                $1, $2, $3::uuid, $4, 1, 'Down Payment',
                CURRENT_DATE - INTERVAL '5 days', 3300000.00, 3300000.00, 'Paid', NOW() - INTERVAL '5 days',
                'Initial contract down payment - Cashier Receipt #REC-9821'
            )
        `, [contractId, deal3Id, tId, String(branchId)]);

        // Installment 1 (Paid on schedule)
        await client.query(`
            INSERT INTO re_installments (
                contract_id, deal_id, tenant_id, branch_id, installment_number, installment_type,
                due_date, amount, paid_amount, status, paid_at, notes
            ) VALUES (
                $1, $2, $3::uuid, $4, 2, 'installment',
                CURRENT_DATE - INTERVAL '10 days', 1650000.00, 1650000.00, 'Paid', NOW() - INTERVAL '10 days',
                'Q1 Installment - Bank Wire Transfer Confirmation'
            )
        `, [contractId, deal3Id, tId, String(branchId)]);

        // Installments 2 to 7 (Pending)
        const periodicDates = ['2027-01-01', '2027-04-01', '2027-07-01', '2027-10-01', '2028-01-01', '2028-04-01'];
        for (let i = 0; i < periodicDates.length; i++) {
            await client.query(`
                INSERT INTO re_installments (
                    contract_id, deal_id, tenant_id, branch_id, installment_number, installment_type,
                    due_date, amount, paid_amount, status, notes
                ) VALUES (
                    $1, $2, $3::uuid, $4, $5, 'installment',
                    $6, 1650000.00, 0.00, 'Pending', $7
                )
            `, [contractId, deal3Id, tId, String(branchId), i + 3, periodicDates[i], `Scheduled Q${(i%4)+1} Payment`]);
        }

        // Installment 8: Delivery Payment (Final)
        await client.query(`
            INSERT INTO re_installments (
                contract_id, deal_id, tenant_id, branch_id, installment_number, installment_type,
                due_date, amount, paid_amount, status, notes
            ) VALUES (
                $1, $2, $3::uuid, $4, 9, 'Delivery Payment',
                '2028-07-01', 1650000.00, 0.00, 'Pending', 'Due at unit handover'
            )
        `, [contractId, deal3Id, tId, String(branchId)]);

        // 14. Sales Commissions
        console.log('14. Inserting Sales Commissions...');
        // Commission 1: Internal Sales Agent (Approved & Paid)
        await client.query(`
            INSERT INTO re_commissions (
                deal_id, contract_id, tenant_id, branch_id, beneficiary_type, beneficiary_name,
                beneficiary_user_id, rate, base_amount, calculated_amount, paid_amount, status, approval_date, payment_date, notes
            ) VALUES (
                $1, $2, $3::uuid, $4, 'internal_agent', 'Karim Mansour (Sales Director)',
                $5, 1.50, 16500000.00, 247500.00, 247500.00, 'Paid', CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE - INTERVAL '1 day',
                'Full commission disbursed following down-payment clearance.'
            )
        `, [deal3Id, contractId, tId, String(branchId), directorId]);

        // Commission 2: External Broker (Approved, Pending Payout)
        await client.query(`
            INSERT INTO re_commissions (
                deal_id, contract_id, tenant_id, branch_id, beneficiary_type, beneficiary_name,
                rate, base_amount, calculated_amount, paid_amount, status, approval_date, notes
            ) VALUES (
                $1, $2, $3::uuid, $4, 'broker', 'Coldwell Banker Egypt (Partner Agency)',
                2.00, 16500000.00, 330000.00, 0.00, 'Approved', CURRENT_DATE - INTERVAL '2 days',
                'External agency incentive for Villa referral - Approved for month-end batch payout.'
            )
        `, [deal3Id, contractId, tId, String(branchId)]);

        // 15. Handover Milestone
        console.log('15. Inserting Handover Record...');
        await client.query(`
            INSERT INTO re_handovers (
                deal_id, unit_id, contract_id, customer_id, tenant_id, branch_id, status,
                scheduled_date, handled_by, snagging_notes
            ) VALUES (
                $1, $2, $3, $4, $5::uuid, $6, 'Inspection',
                CURRENT_DATE + INTERVAL '14 days', 'Karim Mansour',
                '1. Inspection conducted on Oct 2: Master bathroom silicone seal requires reapplication.\n2. Landscape terrace tiles polished and approved.\n3. Keys and access fobs prepared in custody box.'
            )
        `, [deal3Id, unit3Id, contractId, cust3Id, tId, String(branchId)]);

        // 16. Cancellation & Refund Record for Deal 4
        console.log('16. Inserting Cancellation Record...');
        await client.query(`
            INSERT INTO re_cancellations (
                deal_id, contract_id, unit_id, tenant_id, branch_id,
                cancellation_reason, total_paid_amount, deduction_amount, refundable_amount,
                refund_status, unit_action, processed_by, refund_date
            ) VALUES (
                $1, NULL, $2, $3::uuid, $4,
                'Client relocation overseas for employment assignment.',
                810000.00, 162000.00, 648000.00,
                'Processed', 'release', 'Finance Director', CURRENT_DATE - INTERVAL '2 days'
            )
        `, [deal4Id, unit5Id, tId, String(branchId)]);

        await client.query('COMMIT');
        console.log('\n====================================================');
        console.log('✨ DEMO DATA SEEDED SUCCESSFULLY FOR TENANT:');
        console.log(`ID: ${tId}`);
        console.log('Modules covered: Developers, Projects, Phases, Buildings, Units, Customers, Deals, Contracts, Installments, Commissions, Handovers, Cancellations');
        console.log('====================================================\n');

        process.exit(0);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Fatal Seeding Error:', err);
        process.exit(1);
    } finally {
        client.release();
    }
}

seedDemoData();

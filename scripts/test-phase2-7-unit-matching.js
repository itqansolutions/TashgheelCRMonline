const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const { calculateMatch } = require('../services/reMatchingService');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        passedTests++;
    } else {
        console.error(`  ❌ FAIL: ${testName}`);
        failedTests++;
    }
}

async function runTests() {
    console.log('====================================================');
    console.log('🧪 PHASE 2.7: DETERMINISTIC UNIT MATCHING TEST SUITE');
    console.log('====================================================\n');

    const client = await pool.connect();

    try {
        // ----------------------------------------------------
        // TEST 1: Pure Scoring Logic (calculateMatch)
        // ----------------------------------------------------
        console.log('--- TEST 1: Pure Mathematical & Rule Scoring Logic ---');

        const perfectCustomer = {
            budget_min: 2000000,
            budget_max: 3000000,
            preferred_area_min: 120,
            preferred_area_max: 180,
            preferred_location: 'New Cairo',
            preferred_rooms: 3
        };

        const perfectUnit = {
            price: 2500000,
            area_sqm: 150,
            location: 'New Cairo Fifth Settlement',
            rooms: 3
        };

        const perfectResult = calculateMatch(perfectCustomer, perfectUnit);
        assert(perfectResult.match_score === 100, 'Perfect match scores exactly 100%');
        assert(perfectResult.match_grade === 'Excellent', 'Perfect match grade is Excellent');
        assert(perfectResult.breakdown.budget.score === 40, 'Budget earns full 40/40 pts');
        assert(perfectResult.breakdown.area.score === 30, 'Area earns full 30/30 pts');
        assert(perfectResult.breakdown.location.score === 20, 'Location earns full 20/20 pts');
        assert(perfectResult.breakdown.rooms.score === 10, 'Rooms earn full 10/10 pts');

        // Test budget tolerance (+5% over max budget)
        const slightlyOverUnit = {
            price: 3150000, // 5% over 3,000,000
            area_sqm: 150,
            location: 'New Cairo',
            rooms: 3
        };
        const overResult = calculateMatch(perfectCustomer, slightlyOverUnit);
        assert(overResult.breakdown.budget.score === 25, 'Price within 10% over max budget earns 25/40 pts');
        assert(overResult.match_score === 85, 'Total match score is 85%');

        // Test location mismatch & room off by 1
        const partialUnit = {
            price: 2500000,
            area_sqm: 150,
            location: 'Sheikh Zayed',
            rooms: 4 // off by 1
        };
        const partialResult = calculateMatch(perfectCustomer, partialUnit);
        assert(partialResult.breakdown.location.score === 0, 'Completely different location earns 0/20 pts');
        assert(partialResult.breakdown.rooms.score === 5, 'Rooms off by 1 earns 5/10 pts');
        assert(partialResult.match_score === 75, 'Partial unit scores 75%');
        assert(partialResult.match_grade === 'Good', 'Score 75% receives "Good" grade');

        // Test completely mismatched unit
        const mismatchUnit = {
            price: 15000000,
            area_sqm: 600,
            location: 'North Coast',
            rooms: 7
        };
        const mismatchResult = calculateMatch(perfectCustomer, mismatchUnit);
        assert(mismatchResult.match_score === 0, 'Completely mismatched unit scores 0%');
        assert(mismatchResult.match_grade === 'Low', 'Score 0% receives "Low" grade');

        // ----------------------------------------------------
        // TEST 2: API End-to-End Matching Integration
        // ----------------------------------------------------
        console.log('\n--- TEST 2: Multi-Unit Ranking & Customer Matching API ---');

        const tenantA = '00000000-0000-0000-0000-000000000001';
        const tenantB = '00000000-0000-0000-0000-000000000099';
        const branchA = 'test-branch-matching';

        // 1. Create a customer for Tenant A
        const custRes = await client.query(`
            INSERT INTO customers (
                name, email, phone, budget_min, budget_max, 
                preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
                tenant_id, branch_id, status
            ) VALUES (
                'Sherif Matching Lead', 'sherif.match@example.com', '01012345678',
                3000000, 4500000, 150, 220, 'New Cairo', 3,
                $1::uuid, $2, 'lead'
            ) RETURNING id
        `, [tenantA, branchA]);
        const testCustId = custRes.rows[0].id;

        // 2. Create 3 Units with varying suitability
        // Unit 1: Near-perfect (price 3.5M, area 180, location 'New Cairo Fifth Settlement', rooms 3)
        const u1Res = await client.query(`
            INSERT INTO re_units (
                name, project_name, unit_number, type, floor, area_sqm, price, status,
                rooms, location, tenant_id, branch_id
            ) VALUES (
                'Prime Apartment', 'Eastown Residence', 'E-101', 'Apartment', '2', '180', 3500000, 'Available',
                3, 'New Cairo Fifth Settlement', $1::uuid, $2
            ) RETURNING id
        `, [tenantA, branchA]);
        const unit1Id = u1Res.rows[0].id;

        // Unit 2: Moderate match (price 4.8M [slightly over], area 240, location 'New Cairo', rooms 4)
        const u2Res = await client.query(`
            INSERT INTO re_units (
                name, project_name, unit_number, type, floor, area_sqm, price, status,
                rooms, location, tenant_id, branch_id
            ) VALUES (
                'Medium Duplex', 'Mountain View', 'MV-202', 'Duplex', '4', '240', 4800000, 'Available',
                4, 'New Cairo', $1::uuid, $2
            ) RETURNING id
        `, [tenantA, branchA]);
        const unit2Id = u2Res.rows[0].id;

        // Unit 3: Low match (price 12M, area 450, location '6th of October', rooms 5)
        const u3Res = await client.query(`
            INSERT INTO re_units (
                name, project_name, unit_number, type, floor, area_sqm, price, status,
                rooms, location, tenant_id, branch_id
            ) VALUES (
                'Luxury Villa', 'Palm Hills', 'PH-99', 'Villa', '1', '450', 12000000, 'Available',
                5, '6th of October', $1::uuid, $2
            ) RETURNING id
        `, [tenantA, branchA]);
        const unit3Id = u3Res.rows[0].id;

        // Call reMatchingService.matchUnitsForCustomer
        const { matchUnitsForCustomer, matchCustomersForUnit } = require('../services/reMatchingService');
        const matchCustResult = await matchUnitsForCustomer({
            tenantId: tenantA,
            branchId: branchA,
            customerId: testCustId
        });

        assert(matchCustResult.matches.length >= 3, 'Service finds all 3 test units for customer');
        assert(matchCustResult.matches[0].unit.id === unit1Id, 'Top recommended unit is Unit 1 (Prime Apartment)');
        assert(matchCustResult.matches[0].match_score >= 90, `Top unit score is >= 90% (got ${matchCustResult.matches[0].match_score}%)`);
        assert(matchCustResult.matches[1].unit.id === unit2Id, 'Second recommended unit is Unit 2 (Mountain View)');
        assert(matchCustResult.matches[2].unit.id === unit3Id, 'Lowest recommended unit is Unit 3 (Palm Hills)');
        assert(matchCustResult.matches[0].breakdown.budget.score === 40, 'Unit 1 has full budget score (40 pts)');

        // Test reverse match: matchCustomersForUnit
        console.log('\n--- TEST 3: Reverse Matching (Unit -> Interested Buyers) ---');
        const matchUnitResult = await matchCustomersForUnit({
            tenantId: tenantA,
            branchId: branchA,
            unitId: unit1Id
        });

        assert(matchUnitResult.matches_count >= 1, 'Unit 1 matches at least 1 interested registered customer');
        const matchedCust = matchUnitResult.matches.find(m => m.customer.id === testCustId);
        assert(!!matchedCust, 'Sherif Matching Lead appears in matched buyers for Unit 1');
        assert(matchedCust.match_score >= 90, `Sherif match score is >= 90% (got ${matchedCust.match_score}%)`);

        // ----------------------------------------------------
        // TEST 4: Multi-Tenant & Branch Isolation
        // ----------------------------------------------------
        console.log('\n--- TEST 4: Multi-Tenant & Branch Scoping Isolation ---');

        // Tenant B cannot match Tenant A's customer
        let tenantBBlocked = false;
        try {
            await matchUnitsForCustomer({
                tenantId: tenantB,
                branchId: branchA,
                customerId: testCustId
            });
        } catch (e) {
            tenantBBlocked = (e.statusCode === 404 || e.message.includes('not found'));
        }
        assert(tenantBBlocked, 'Tenant B is blocked with 404 from matching Tenant A customer');

        // Tenant B cannot match Tenant A's unit
        let tenantBUnitBlocked = false;
        try {
            await matchCustomersForUnit({
                tenantId: tenantB,
                branchId: branchA,
                unitId: unit1Id
            });
        } catch (e) {
            tenantBUnitBlocked = (e.statusCode === 404 || e.message.includes('not found'));
        }
        assert(tenantBUnitBlocked, 'Tenant B is blocked with 404 from matching Tenant A unit');

        // Cleanup test data
        await client.query(`DELETE FROM re_units WHERE id IN ($1, $2, $3)`, [unit1Id, unit2Id, unit3Id]);
        await client.query(`DELETE FROM customers WHERE id = $1`, [testCustId]);

    } catch (err) {
        console.error('Fatal Test Suite Error:', err);
        failedTests++;
    } finally {
        client.release();
    }

    console.log('\n====================================================');
    console.log(`📊 TEST SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('====================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
}

runTests();

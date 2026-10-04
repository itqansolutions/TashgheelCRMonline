const db = require('../config/db');

/**
 * Real Estate Deterministic Matching Service
 * Matches buyer customer requirements with property unit inventory.
 * 
 * Multi-factor Scoring Model (Total: 100 points):
 * - Budget:   40 points max
 * - Area:     30 points max
 * - Location: 20 points max
 * - Rooms:    10 points max
 */

function calculateMatch(customer, unit) {
    // 1. Budget (40 points max)
    let budgetScore = 0;
    let budgetReason = '';
    const maxBudgetScore = 40;

    const minB = customer.budget_min !== null && customer.budget_min !== undefined && customer.budget_min !== ''
        ? parseFloat(customer.budget_min) : null;
    const maxB = customer.budget_max !== null && customer.budget_max !== undefined && customer.budget_max !== ''
        ? parseFloat(customer.budget_max) : null;
    const unitPrice = unit.price !== null && unit.price !== undefined ? parseFloat(unit.price) : 0;

    if ((minB === null || minB === 0) && (maxB === null || maxB === 0)) {
        budgetScore = maxBudgetScore;
        budgetReason = 'No buyer budget constraints specified (Full 40 pts)';
    } else {
        const floorB = minB !== null && minB > 0 ? minB : 0;
        const ceilB = maxB !== null && maxB > 0 ? maxB : Infinity;

        if (unitPrice >= floorB && unitPrice <= ceilB) {
            budgetScore = maxBudgetScore;
            budgetReason = `Price (${unitPrice.toLocaleString()} EGP) is within buyer budget range (${floorB.toLocaleString()} - ${ceilB === Infinity ? 'Any' : ceilB.toLocaleString()} EGP)`;
        } else if (unitPrice > ceilB) {
            const pctOver = ((unitPrice - ceilB) / ceilB) * 100;
            if (pctOver <= 10) {
                budgetScore = 25;
                budgetReason = `Price is ${pctOver.toFixed(1)}% above max budget (+25 pts)`;
            } else if (pctOver <= 20) {
                budgetScore = 10;
                budgetReason = `Price is ${pctOver.toFixed(1)}% above max budget (+10 pts)`;
            } else {
                budgetScore = 0;
                budgetReason = `Price exceeds budget by ${pctOver.toFixed(1)}% (0 pts)`;
            }
        } else if (unitPrice < floorB) {
            const pctUnder = ((floorB - unitPrice) / floorB) * 100;
            if (pctUnder <= 15) {
                budgetScore = 30;
                budgetReason = `Price is ${pctUnder.toFixed(1)}% below min budget (+30 pts)`;
            } else {
                budgetScore = 15;
                budgetReason = `Price is ${pctUnder.toFixed(1)}% below min budget (+15 pts)`;
            }
        }
    }

    // 2. Area (30 points max)
    let areaScore = 0;
    let areaReason = '';
    const maxAreaScore = 30;

    const minA = customer.preferred_area_min !== null && customer.preferred_area_min !== undefined && customer.preferred_area_min !== ''
        ? parseFloat(customer.preferred_area_min) : null;
    const maxA = customer.preferred_area_max !== null && customer.preferred_area_max !== undefined && customer.preferred_area_max !== ''
        ? parseFloat(customer.preferred_area_max) : null;
    const unitArea = unit.area_sqm !== null && unit.area_sqm !== undefined ? parseFloat(unit.area_sqm) : 0;

    if ((minA === null || minA === 0) && (maxA === null || maxA === 0)) {
        areaScore = maxAreaScore;
        areaReason = 'No buyer area preference specified (Full 30 pts)';
    } else {
        const floorA = minA !== null && minA > 0 ? minA : 0;
        const ceilA = maxA !== null && maxA > 0 ? maxA : Infinity;

        if (unitArea >= floorA && unitArea <= ceilA) {
            areaScore = maxAreaScore;
            areaReason = `Area (${unitArea} sqm) is within buyer range (${floorA} - ${ceilA === Infinity ? 'Any' : ceilA} sqm)`;
        } else if (unitArea > ceilA) {
            const pctOver = ((unitArea - ceilA) / ceilA) * 100;
            if (pctOver <= 15) {
                areaScore = 20;
                areaReason = `Area is ${pctOver.toFixed(1)}% above max range (+20 pts)`;
            } else if (pctOver <= 30) {
                areaScore = 10;
                areaReason = `Area is ${pctOver.toFixed(1)}% above max range (+10 pts)`;
            } else {
                areaScore = 0;
                areaReason = `Area is ${pctOver.toFixed(1)}% above max range (0 pts)`;
            }
        } else if (unitArea < floorA) {
            const pctUnder = ((floorA - unitArea) / floorA) * 100;
            if (pctUnder <= 15) {
                areaScore = 18;
                areaReason = `Area is ${pctUnder.toFixed(1)}% below min range (+18 pts)`;
            } else if (pctUnder <= 30) {
                areaScore = 8;
                areaReason = `Area is ${pctUnder.toFixed(1)}% below min range (+8 pts)`;
            } else {
                areaScore = 0;
                areaReason = `Area is ${pctUnder.toFixed(1)}% below min range (0 pts)`;
            }
        }
    }

    // 3. Location (20 points max)
    let locScore = 0;
    let locReason = '';
    const maxLocScore = 20;

    const prefLoc = customer.preferred_location ? customer.preferred_location.trim().toLowerCase() : '';
    if (!prefLoc || prefLoc === 'any' || prefLoc === 'anywhere' || prefLoc === 'all') {
        locScore = maxLocScore;
        locReason = 'No specific location constraint (Full 20 pts)';
    } else {
        const unitLocStr = [
            unit.location || '',
            unit.project_name || '',
            unit.building_name || '',
            unit.phase_name || '',
            unit.developer_name || ''
        ].join(' ').toLowerCase();

        if (unitLocStr.includes(prefLoc)) {
            locScore = maxLocScore;
            locReason = `Exact location match with "${customer.preferred_location}" (+20 pts)`;
        } else {
            const words = prefLoc.split(/[\s,،-]+/).filter(w => w.length > 2);
            const partial = words.some(w => unitLocStr.includes(w));
            if (partial) {
                locScore = 10;
                locReason = `Partial location match with "${customer.preferred_location}" (+10 pts)`;
            } else {
                locScore = 0;
                locReason = `Location "${unit.location || unit.project_name || 'N/A'}" does not match preferred "${customer.preferred_location}" (0 pts)`;
            }
        }
    }

    // 4. Rooms (10 points max)
    let roomsScore = 0;
    let roomsReason = '';
    const maxRoomsScore = 10;

    const prefRooms = customer.preferred_rooms ? parseInt(customer.preferred_rooms) : null;
    const unitRooms = unit.rooms ? parseInt(unit.rooms) : 0;

    if (!prefRooms) {
        roomsScore = maxRoomsScore;
        roomsReason = 'No room preference specified (Full 10 pts)';
    } else {
        if (unitRooms === prefRooms) {
            roomsScore = maxRoomsScore;
            roomsReason = `Exact room count match: ${unitRooms} rooms (+10 pts)`;
        } else if (Math.abs(unitRooms - prefRooms) === 1) {
            roomsScore = 5;
            roomsReason = `Close room count: unit has ${unitRooms} rooms vs preferred ${prefRooms} (+5 pts)`;
        } else {
            roomsScore = 0;
            roomsReason = `Unit has ${unitRooms} rooms vs preferred ${prefRooms} (0 pts)`;
        }
    }

    const totalScore = Math.min(100, Math.max(0, Math.round(budgetScore + areaScore + locScore + roomsScore)));
    let matchGrade = 'Low';
    if (totalScore >= 85) matchGrade = 'Excellent';
    else if (totalScore >= 65) matchGrade = 'Good';
    else if (totalScore >= 45) matchGrade = 'Fair';

    return {
        match_score: totalScore,
        match_grade: matchGrade,
        breakdown: {
            budget: { score: budgetScore, max: maxBudgetScore, reason: budgetReason },
            area: { score: areaScore, max: maxAreaScore, reason: areaReason },
            location: { score: locScore, max: maxLocScore, reason: locReason },
            rooms: { score: roomsScore, max: maxRoomsScore, reason: roomsReason }
        }
    };
}

/**
 * Match all eligible inventory units for a given customer
 */
async function matchUnitsForCustomer({ tenantId, branchId, customerId, includeAllStatus = false }) {
    // 1. Fetch customer requirements
    const custRes = await db.query(`
        SELECT id, name, email, phone, budget_min, budget_max, 
               preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
               tenant_id, branch_id
        FROM customers
        WHERE id::text = $1::text AND tenant_id::text = $2::text
    `, [customerId, tenantId]);

    if (custRes.rows.length === 0) {
        const error = new Error('Customer not found');
        error.statusCode = 404;
        throw error;
    }

    const customer = custRes.rows[0];

    // 2. Fetch inventory units with hierarchy metadata
    let query = `
        SELECT 
            ru.*,
            dev.name as developer_name,
            COALESCE(proj.name, ru.project_name) as project_name,
            phase.name as phase_name,
            bld.name as building_name
        FROM re_units ru
        LEFT JOIN re_developers dev ON ru.developer_id::text = dev.id::text AND dev.tenant_id::text = ru.tenant_id::text
        LEFT JOIN re_projects proj ON ru.project_id::text = proj.id::text AND proj.tenant_id::text = ru.tenant_id::text
        LEFT JOIN re_phases phase ON ru.phase_id::text = phase.id::text AND phase.tenant_id::text = ru.tenant_id::text
        LEFT JOIN re_buildings bld ON ru.building_id::text = bld.id::text AND bld.tenant_id::text = ru.tenant_id::text
        WHERE ru.tenant_id::text = $1::text
          AND ($2::text IS NULL OR ru.status = 'Available' OR ru.branch_id::text = $2::text OR ru.branch_id IS NULL)
    `;
    const params = [tenantId, branchId ? String(branchId) : null];

    if (!includeAllStatus) {
        query += ` AND ru.status = 'Available'`;
    }

    const unitsRes = await db.query(query, params);
    const units = unitsRes.rows || [];

    // 3. Score every unit
    const scoredMatches = units.map(unit => {
        const matchResult = calculateMatch(customer, unit);
        return {
            unit: {
                id: unit.id,
                name: unit.name,
                unit_number: unit.unit_number,
                project_name: unit.project_name,
                developer_name: unit.developer_name,
                phase_name: unit.phase_name,
                building_name: unit.building_name,
                type: unit.type,
                floor: unit.floor,
                price: parseFloat(unit.price) || 0,
                area_sqm: parseFloat(unit.area_sqm) || 0,
                rooms: unit.rooms || 0,
                location: unit.location,
                status: unit.status
            },
            match_score: matchResult.match_score,
            match_grade: matchResult.match_grade,
            breakdown: matchResult.breakdown
        };
    });

    // Sort descending by score
    scoredMatches.sort((a, b) => b.match_score - a.match_score);

    return {
        customer: {
            id: customer.id,
            name: customer.name,
            budget_min: customer.budget_min,
            budget_max: customer.budget_max,
            preferred_area_min: customer.preferred_area_min,
            preferred_area_max: customer.preferred_area_max,
            preferred_location: customer.preferred_location,
            preferred_rooms: customer.preferred_rooms
        },
        matches_count: scoredMatches.length,
        matches: scoredMatches
    };
}

/**
 * Match all eligible buyer leads for a given inventory unit
 */
async function matchCustomersForUnit({ tenantId, branchId, unitId, minScore = 0 }) {
    // 1. Fetch unit details
    const unitRes = await db.query(`
        SELECT 
            ru.*,
            dev.name as developer_name,
            COALESCE(proj.name, ru.project_name) as project_name,
            phase.name as phase_name,
            bld.name as building_name
        FROM re_units ru
        LEFT JOIN re_developers dev ON ru.developer_id::text = dev.id::text AND dev.tenant_id::text = ru.tenant_id::text
        LEFT JOIN re_projects proj ON ru.project_id::text = proj.id::text AND proj.tenant_id::text = ru.tenant_id::text
        LEFT JOIN re_phases phase ON ru.phase_id::text = phase.id::text AND phase.tenant_id::text = ru.tenant_id::text
        LEFT JOIN re_buildings bld ON ru.building_id::text = bld.id::text AND bld.tenant_id::text = ru.tenant_id::text
        WHERE ru.id = $1::uuid AND ru.tenant_id::text = $2::text
          AND ($3::text IS NULL OR ru.branch_id::text = $3::text OR ru.branch_id IS NULL)
    `, [unitId, tenantId, branchId ? String(branchId) : null]);

    if (unitRes.rows.length === 0) {
        const error = new Error('Unit not found');
        error.statusCode = 404;
        throw error;
    }

    const unit = unitRes.rows[0];

    // 2. Fetch active customers with requirements
    const custRes = await db.query(`
        SELECT id, name, email, phone, budget_min, budget_max, 
               preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
               company_name, source, status, tenant_id, branch_id
        FROM customers
        WHERE tenant_id::text = $1::text
          AND (is_blacklisted IS NOT TRUE)
          AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL OR branch_id = 'default-branch')
    `, [tenantId, branchId ? String(branchId) : null]);

    const customers = custRes.rows || [];

    // 3. Score every customer against this unit
    const scoredMatches = customers.map(cust => {
        const matchResult = calculateMatch(cust, unit);
        return {
            customer: {
                id: cust.id,
                name: cust.name,
                email: cust.email,
                phone: cust.phone,
                budget_min: cust.budget_min,
                budget_max: cust.budget_max,
                preferred_area_min: cust.preferred_area_min,
                preferred_area_max: cust.preferred_area_max,
                preferred_location: cust.preferred_location,
                preferred_rooms: cust.preferred_rooms,
                status: cust.status
            },
            match_score: matchResult.match_score,
            match_grade: matchResult.match_grade,
            breakdown: matchResult.breakdown
        };
    }).filter(m => m.match_score >= minScore);

    // Sort descending by score
    scoredMatches.sort((a, b) => b.match_score - a.match_score);

    return {
        unit: {
            id: unit.id,
            name: unit.name,
            unit_number: unit.unit_number,
            project_name: unit.project_name,
            price: parseFloat(unit.price) || 0,
            area_sqm: parseFloat(unit.area_sqm) || 0,
            rooms: unit.rooms || 0,
            location: unit.location,
            status: unit.status
        },
        matches_count: scoredMatches.length,
        matches: scoredMatches
    };
}

module.exports = {
    calculateMatch,
    matchUnitsForCustomer,
    matchCustomersForUnit
};

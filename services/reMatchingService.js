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

/**
 * True when the customer stated at least one requirement. A customer with no
 * stated budget/area/location/rooms has no meaningful match score,
 * so callers use this flag to show an unscored result instead of a recommendation.
 */
// The customer form offers rooms "1, 2, 3, 4+" and stores 4 for "4+".
const ROOMS_OPEN_ENDED_FROM = 4;
// Lowest score returned by default. 0 = list everything (unchanged behavior). Any cutoff is a product decision
// that has not been made; callers can pass min_score. Do not set a number here without that decision.
const DEFAULT_MIN_SCORE = 0;

function hasStatedRequirements(customer) {
    const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0; };
    const loc = customer.preferred_location ? String(customer.preferred_location).trim().toLowerCase() : '';
    return num(customer.budget_min) || num(customer.budget_max) ||
        num(customer.preferred_area_min) || num(customer.preferred_area_max) ||
        (loc !== '' && !['any', 'anywhere', 'all'].includes(loc)) ||
        (parseInt(customer.preferred_rooms) > 0);
}

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

    const budgetStated = (minB !== null && minB > 0) || (maxB !== null && maxB > 0);
    if (!budgetStated) {
        budgetReason = 'No buyer budget specified (not scored)';
    } else if (!(unitPrice > 0)) {
        budgetReason = 'Unit has no price, budget cannot be checked (0 pts)';
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

    const areaStated = (minA !== null && minA > 0) || (maxA !== null && maxA > 0);
    if (!areaStated) {
        areaReason = 'No buyer area specified (not scored)';
    } else if (!(unitArea > 0)) {
        areaReason = 'Unit has no area, area cannot be checked (0 pts)';
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
    const locStated = !(!prefLoc || prefLoc === 'any' || prefLoc === 'anywhere' || prefLoc === 'all');
    if (!locStated) {
        locReason = 'No buyer location specified (not scored)';
    } else {
        const unitLocStr = [
            unit.location || '',
            unit.project_name || '',
            unit.building_name || '',
            unit.phase_name || '',
            unit.developer_name || ''
        ].join(' ').toLowerCase();

        // The form accepts several areas ("New Cairo, Sheikh Zayed"), so each is an alternative.
        const alternatives = prefLoc.split(/[,،;|\/]+/).map(a => a.trim()).filter(Boolean);
        const wordsOf = (a) => a.split(/[\s-]+/).filter(w => w.length > 2);
        const matchedAlt = alternatives.find(a => unitLocStr.includes(a));
        if (matchedAlt) {
            locScore = maxLocScore;
            locReason = `Exact location match with "${matchedAlt}" (+20 pts)`;
        } else {
            // Partial credit only when every word of an alternative is present (different order or
            // extra words in the unit location). One shared word is not enough: "New Cairo" and
            // "New Capital" share "new" but are different areas.
            const wordMatchAlt = alternatives.find(a => {
                const w = wordsOf(a);
                return w.length > 1 && w.every(x => unitLocStr.includes(x));
            });
            const unitOwnLoc = String(unit.location || '').trim().toLowerCase();
            const containedAlt = unitOwnLoc.length > 2 ? alternatives.find(a => a.includes(unitOwnLoc)) : null;
            if (containedAlt) {
                locScore = 10;
                locReason = `Unit area "${unit.location}" is part of preferred "${containedAlt}" (+10 pts)`;
            } else if (wordMatchAlt) {
                locScore = 10;
                locReason = `Location words of "${wordMatchAlt}" all appear in the unit location (+10 pts)`;
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

    const roomsStated = !!prefRooms;
    if (!roomsStated) {
        roomsReason = 'No room preference specified (not scored)';
    } else if (!(unitRooms > 0)) {
        roomsReason = 'Unit has no room count, rooms cannot be checked (0 pts)';
    } else {
        if (unitRooms === prefRooms || (prefRooms >= ROOMS_OPEN_ENDED_FROM && unitRooms >= prefRooms)) {
            roomsScore = maxRoomsScore;
            roomsReason = prefRooms >= ROOMS_OPEN_ENDED_FROM && unitRooms !== prefRooms
                ? `${unitRooms} rooms satisfies "${prefRooms}+" (+10 pts)`
                : `Exact room count match: ${unitRooms} rooms (+10 pts)`;
        } else if (Math.abs(unitRooms - prefRooms) === 1) {
            roomsScore = 5;
            roomsReason = `Close room count: unit has ${unitRooms} rooms vs preferred ${prefRooms} (+5 pts)`;
        } else {
            roomsScore = 0;
            roomsReason = `Unit has ${unitRooms} rooms vs preferred ${prefRooms} (0 pts)`;
        }
    }

    // Score only the criteria the buyer actually stated: earned / available of those criteria.
    // Unstated criteria no longer add free points, so one stated mismatch cannot hide behind them.
    const availableMax = (budgetStated ? maxBudgetScore : 0) + (areaStated ? maxAreaScore : 0) +
        (locStated ? maxLocScore : 0) + (roomsStated ? maxRoomsScore : 0);
    const earned = budgetScore + areaScore + locScore + roomsScore;
    const totalScore = availableMax === 0 ? 0 : Math.min(100, Math.max(0, Math.round((earned / availableMax) * 100)));
    let matchGrade = 'Low';
    if (totalScore >= 85) matchGrade = 'Excellent';
    else if (totalScore >= 65) matchGrade = 'Good';
    else if (totalScore >= 45) matchGrade = 'Fair';

    return {
        match_score: totalScore,
        match_grade: matchGrade,
        breakdown: {
            budget: { score: budgetScore, max: maxBudgetScore, stated: budgetStated, reason: budgetReason },
            area: { score: areaScore, max: maxAreaScore, stated: areaStated, reason: areaReason },
            location: { score: locScore, max: maxLocScore, stated: locStated, reason: locReason },
            rooms: { score: roomsScore, max: maxRoomsScore, stated: roomsStated, reason: roomsReason }
        }
    };
}

/**
 * Match all eligible inventory units for a given customer
 */
async function matchUnitsForCustomer({ tenantId, branchId, customerId, includeAllStatus = false, minScore = DEFAULT_MIN_SCORE }) {
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
        query += ` AND ru.status = 'Available' AND ru.marketing_active IS NOT FALSE`;
    }

    const unitsRes = await db.query(query, params);
    const units = unitsRes.rows || [];

    // 3. Score every unit (a customer who stated nothing has nothing to match against)
    const customerHasRequirements = hasStatedRequirements(customer);
    const allScored = units.map(unit => {
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
    const scoredMatches = allScored.filter(m => m.match_score >= minScore);
    const hiddenLowCount = allScored.length - scoredMatches.length;

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
        // false = the customer stated no budget/area/location/rooms, so scores are not meaningful
        has_requirements: customerHasRequirements,
        min_score: minScore,
        hidden_low_count: hiddenLowCount,
        matches_count: scoredMatches.length,
        matches: scoredMatches
    };
}

// entity_type / is_active are added by separate bootstraps; only filter on them when present
// so a missing column can never turn into a 500.
async function customerExtraFilters() {
    const colRes = await db.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'customers' AND column_name IN ('entity_type', 'is_active')`
    );
    const cols = new Set((colRes.rows || []).map(r => r.column_name));
    return (cols.has('is_active') ? 'AND (is_active IS NOT FALSE) ' : '') +
        (cols.has('entity_type') ? "AND (COALESCE(entity_type, 'customer') <> 'vendor') " : '');
}

/**
 * Match all eligible buyer leads for a given inventory unit
 */
async function matchCustomersForUnit({ tenantId, branchId, unitId, minScore = DEFAULT_MIN_SCORE }) {
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
        WHERE ru.id::text = $1::text AND ru.tenant_id::text = $2::text
          AND ($3::text IS NULL OR ru.branch_id::text = $3::text OR ru.branch_id IS NULL)
    `, [unitId, tenantId, branchId ? String(branchId) : null]);

    if (unitRes.rows.length === 0) {
        const error = new Error('Unit not found');
        error.statusCode = 404;
        throw error;
    }

    const unit = unitRes.rows[0];

    // 2. Fetch active customers with requirements
    const extraFilters = await customerExtraFilters();
    const custRes = await db.query(`
        SELECT id, name, email, phone, budget_min, budget_max, 
               preferred_area_min, preferred_area_max, preferred_location, preferred_rooms,
               company_name, source, status, tenant_id, branch_id
        FROM customers
        WHERE tenant_id::text = $1::text
          AND (is_blacklisted IS NOT TRUE)
          ${extraFilters}AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL OR branch_id::text = 'default-branch')
    `, [tenantId, branchId ? String(branchId) : null]);

    const customers = custRes.rows || [];

    // 3. Score every customer against this unit
    // Keep no-requirement buyers visible; has_requirements=false makes the UI show them unscored.
    const withReqs = customers.filter(c => hasStatedRequirements(c));
    const noPrefsCount = customers.length - withReqs.length;
    const allScored = customers.map(cust => {
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
            has_requirements: hasStatedRequirements(cust),
            match_score: matchResult.match_score,
            match_grade: matchResult.match_grade,
            breakdown: matchResult.breakdown
        };
    });
    const scoredMatches = allScored.filter(m => m.match_score >= minScore);
    const hiddenLowCount = allScored.length - scoredMatches.length;

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
        min_score: minScore,
        hidden_low_count: hiddenLowCount,
        no_preferences_count: noPrefsCount,
        matches_count: scoredMatches.length,
        matches: scoredMatches
    };
}

module.exports = {
    calculateMatch,
    hasStatedRequirements,
    matchUnitsForCustomer,
    matchCustomersForUnit
};

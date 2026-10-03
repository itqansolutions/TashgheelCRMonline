const db = require('../config/db');
const reHierarchyController = require('../controllers/reHierarchyController');
const reUnitsController = require('../controllers/reUnitsController');

const tenantA = '00000000-0000-0000-0000-000000000001';
const tenantB = '00000000-0000-0000-0000-000000000099';
const branchA = '00000000-0000-0000-0000-000000000002';
const branchB = '00000000-0000-0000-0000-000000000003';
const branchForeign = '00000000-0000-0000-0000-000000000098';

function mockReqRes({ body = {}, params = {}, user = {}, query = {} } = {}) {
    const req = {
        body,
        params,
        query,
        user: {
            id: user.id || 26,
            tenant_id: user.tenant_id || tenantA,
            branch_id: user.branch_id || branchA,
            role: user.role || 'sales_agent',
            name: user.name || 'Test Agent',
            ...user
        },
        branchId: user.branch_id || branchA
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

async function runHierarchyTests() {
    console.log('====================================================');
    console.log('🧪 PHASE 2.1: REAL ESTATE PROJECT HIERARCHY TEST SUITE');
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
        // Cleanup test hierarchy data
        await db.query(`DELETE FROM re_units WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
        await db.query(`DELETE FROM re_buildings WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
        await db.query(`DELETE FROM re_phases WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
        await db.query(`DELETE FROM re_projects WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
        await db.query(`DELETE FROM re_developers WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);

        // TEST 1: Create Developer (Tenant A)
        console.log('--- TEST 1: Create Developer ---');
        const { req: reqDev, res: resDev } = mockReqRes({
            body: { name: 'Emaar Misr', contact_person: 'Mohamed Aly', phone: '+201000000001', email: 'info@emaar.eg' }
        });
        await reHierarchyController.createDeveloper(reqDev, resDev);
        assert(resDev.getStatusCode() === 201, 'Developer created successfully with status 201');
        const devA = resDev.getData()?.data;
        assert(devA && devA.name === 'Emaar Misr', 'Developer record matches payload');

        // TEST 2: Create Project linked to Developer (Tenant A)
        console.log('\n--- TEST 2: Create Project linked to Developer ---');
        const { req: reqProj, res: resProj } = mockReqRes({
            body: { name: 'Uptown Cairo', developer_id: devA.id, location: 'Mokattam, Cairo', description: 'Luxury compound' }
        });
        await reHierarchyController.createProject(reqProj, resProj);
        assert(resProj.getStatusCode() === 201, 'Project created successfully with status 201');
        const projA = resProj.getData()?.data;
        assert(projA && projA.name === 'Uptown Cairo' && projA.developer_id === devA.id, 'Project links correctly to Developer');

        // TEST 3: Create Phase and Building (Tenant A)
        console.log('\n--- TEST 3: Create Phase & Building ---');
        const { req: reqPhase, res: resPhase } = mockReqRes({
            body: { project_id: projA.id, name: 'Phase 2 - Golf Residences' }
        });
        await reHierarchyController.createPhase(reqPhase, resPhase);
        assert(resPhase.getStatusCode() === 201, 'Phase created successfully with status 201');
        const phaseA = resPhase.getData()?.data;

        const { req: reqBld, res: resBld } = mockReqRes({
            body: { project_id: projA.id, phase_id: phaseA.id, name: 'Building B12', floors_count: 5 }
        });
        await reHierarchyController.createBuilding(reqBld, resBld);
        assert(resBld.getStatusCode() === 201, 'Building created successfully with status 201');
        const bldA = resBld.getData()?.data;

        // TEST 4: Fetch Hierarchy Tree
        console.log('\n--- TEST 4: Hierarchy Navigation Tree ---');
        const { req: reqTree, res: resTree } = mockReqRes();
        await reHierarchyController.getHierarchyTree(reqTree, resTree);
        const treeData = resTree.getData()?.data;
        assert(treeData && treeData.projects.length >= 1, 'Hierarchy tree returns projects');
        const foundProject = treeData.projects.find(p => p.id === projA.id);
        assert(foundProject && foundProject.phases.length === 1 && foundProject.buildings.length === 1,
            'Hierarchy tree correctly nests phases and buildings under project');

        // TEST 5: Create Unit with Full Hierarchy linkage
        console.log('\n--- TEST 5: Create Unit with Hierarchy Linkage ---');
        const { req: reqUnit, res: resUnit } = mockReqRes({
            body: {
                name: 'Penthouse B12-501',
                unit_number: 'B12-501',
                developer_id: devA.id,
                project_id: projA.id,
                phase_id: phaseA.id,
                building_id: bldA.id,
                type: 'Apartment',
                floor: '5',
                area_sqm: '220',
                price: 8500000,
                rooms: 4
            }
        });
        await reUnitsController.createUnit(reqUnit, resUnit);
        assert(resUnit.getStatusCode() === 200 || resUnit.getStatusCode() === 201, 'Unit created with hierarchy linkage');
        const unitWithHierarchy = resUnit.getData()?.data;

        // TEST 6: Get Units with Hierarchy Joins
        console.log('\n--- TEST 6: Get Units with Hierarchy Joins ---');
        const { req: reqGetUnits, res: resGetUnits } = mockReqRes();
        await reUnitsController.getUnits(reqGetUnits, resGetUnits);
        const unitsList = resGetUnits.getData()?.data;
        const retrievedUnit = unitsList.find(u => u.id === unitWithHierarchy.id);
        assert(retrievedUnit && retrievedUnit.developer_name === 'Emaar Misr' && retrievedUnit.project_name === 'Uptown Cairo' && retrievedUnit.phase_name === 'Phase 2 - Golf Residences' && retrievedUnit.building_name === 'Building B12',
            'Unit query successfully resolves developer_name, project_name, phase_name, and building_name');

        // TEST 7: Filtering Units by Hierarchy
        console.log('\n--- TEST 7: Hierarchy Filtering ---');
        const { req: reqFilterProj, res: resFilterProj } = mockReqRes({ query: { project_id: projA.id } });
        await reUnitsController.getUnits(reqFilterProj, resFilterProj);
        assert(resFilterProj.getData()?.data?.length >= 1, 'Filtering by project_id returns matching unit');

        const { req: reqFilterNone, res: resFilterNone } = mockReqRes({ query: { project_id: '00000000-0000-0000-0000-999999999999' } });
        await reUnitsController.getUnits(reqFilterNone, resFilterNone);
        assert(resFilterNone.getData()?.data?.length === 0, 'Filtering by non-existent project_id returns 0 units');

        // TEST 8: Backward Compatibility (Unit with only project_name string, no hierarchy IDs)
        console.log('\n--- TEST 8: Backward Compatibility with Legacy Units ---');
        const { req: reqLegacy, res: resLegacy } = mockReqRes({
            body: {
                name: 'Legacy Unit 10',
                project_name: 'Standalone Compound',
                unit_number: 'STD-10',
                type: 'Villa',
                price: 5000000
            }
        });
        await reUnitsController.createUnit(reqLegacy, resLegacy);
        assert(resLegacy.getStatusCode() === 200 || resLegacy.getStatusCode() === 201, 'Legacy unit created without hierarchy FKs');

        const { req: reqGetLegacy, res: resGetLegacy } = mockReqRes();
        await reUnitsController.getUnits(reqGetLegacy, resGetLegacy);
        const legacyUnit = resGetLegacy.getData()?.data?.find(u => u.unit_number === 'STD-10');
        assert(legacyUnit && legacyUnit.project_name === 'Standalone Compound' && legacyUnit.developer_name === null,
            'Legacy unit displays project_name correctly without requiring hierarchy relations');

        // TEST 9: Multi-Tenant Isolation
        console.log('\n--- TEST 9: Multi-Tenant Isolation ---');
        // Tenant B requests Tenant A's project hierarchy tree
        const { req: reqTreeB, res: resTreeB } = mockReqRes({
            user: { id: 31, tenant_id: tenantB, branch_id: branchForeign }
        });
        await reHierarchyController.getHierarchyTree(reqTreeB, resTreeB);
        const treeB = resTreeB.getData()?.data;
        assert(treeB && treeB.projects.length === 0 && treeB.developers.length === 0,
            'Tenant B cannot view Tenant A developers, projects, phases, or buildings');

        // Tenant B tries to attach Tenant A project to Tenant B phase
        const { req: reqPhaseCross, res: resPhaseCross } = mockReqRes({
            body: { project_id: projA.id, name: 'Spy Phase' },
            user: { id: 31, tenant_id: tenantB, branch_id: branchForeign }
        });
        await reHierarchyController.createPhase(reqPhaseCross, resPhaseCross);
        assert(resPhaseCross.getStatusCode() === 404,
            'Cross-tenant phase creation rejected with 404');

        // Cleanup
        await db.query(`DELETE FROM re_units WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
        await db.query(`DELETE FROM re_buildings WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
        await db.query(`DELETE FROM re_phases WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
        await db.query(`DELETE FROM re_projects WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);
        await db.query(`DELETE FROM re_developers WHERE tenant_id::text IN ($1, $2)`, [tenantA, tenantB]);

        console.log('\n====================================================');
        console.log(`📊 PHASE 2.1 SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
        console.log('====================================================\n');

        if (failedTests > 0) process.exit(1);
        else process.exit(0);

    } catch (err) {
        console.error('💥 UNEXPECTED ERROR IN HIERARCHY TEST SUITE:', err);
        process.exit(1);
    }
}

runHierarchyTests();

const db = require('../config/db');

/**
 * Real Estate Project Hierarchy Controller
 * Manages Developer -> Project -> Phase -> Building hierarchy
 */

// ==========================================
// DEVELOPERS
// ==========================================
exports.getDevelopers = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;

    try {
        const result = await db.query(`
            SELECT 
                d.*,
                COUNT(p.id) as projects_count
            FROM re_developers d
            LEFT JOIN re_projects p ON d.id::text = p.developer_id::text AND p.tenant_id::text = d.tenant_id::text
            WHERE d.tenant_id::text = $1::text
            AND ($2::text IS NULL OR d.branch_id::text = $2::text OR d.branch_id IS NULL)
            GROUP BY d.id
            ORDER BY d.name ASC
        `, [tenant_id, branch_id]);

        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('[Get Developers Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.createDeveloper = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const { name, contact_person, phone, email } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ status: 'error', message: 'Developer name is required.' });
    }

    try {
        const result = await db.query(`
            INSERT INTO re_developers (name, contact_person, phone, email, tenant_id, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [name.trim(), contact_person || null, phone || null, email || null, tenant_id, branch_id]);

        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('[Create Developer Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.deleteDeveloper = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;

    try {
        const result = await db.query(`
            DELETE FROM re_developers
            WHERE id::text = $1::text AND tenant_id::text = $2::text
            RETURNING id
        `, [id, tenant_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Developer not found.' });
        }

        res.json({ status: 'success', message: 'Developer deleted successfully.' });
    } catch (err) {
        console.error('[Delete Developer Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ==========================================
// PROJECTS
// ==========================================
exports.getProjects = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const { developer_id } = req.query;

    try {
        let query = `
            SELECT 
                p.*,
                d.name as developer_name,
                COUNT(DISTINCT ph.id) as phases_count,
                COUNT(DISTINCT b.id) as buildings_count,
                COUNT(DISTINCT u.id) as units_count
            FROM re_projects p
            LEFT JOIN re_developers d ON p.developer_id::text = d.id::text AND d.tenant_id::text = p.tenant_id::text
            LEFT JOIN re_phases ph ON p.id::text = ph.project_id::text AND ph.tenant_id::text = p.tenant_id::text
            LEFT JOIN re_buildings b ON p.id::text = b.project_id::text AND b.tenant_id::text = p.tenant_id::text
            LEFT JOIN re_units u ON p.id::text = u.project_id::text AND u.tenant_id::text = p.tenant_id::text
            WHERE p.tenant_id::text = $1::text
            AND ($2::text IS NULL OR p.branch_id::text = $2::text OR p.branch_id IS NULL)
        `;
        const params = [tenant_id, branch_id];

        if (developer_id) {
            params.push(developer_id);
            query += ` AND p.developer_id::text = $${params.length}::text`;
        }

        query += ` GROUP BY p.id, d.name ORDER BY p.name ASC`;

        const result = await db.query(query, params);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('[Get Projects Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.createProject = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const { name, developer_id, location, description } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ status: 'error', message: 'Project name is required.' });
    }

    try {
        const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
        const cleanDevId = (developer_id && isUuid(developer_id)) ? developer_id : null;
        const result = await db.query(`
            INSERT INTO re_projects (name, developer_id, location, description, tenant_id, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [name.trim(), cleanDevId, location || null, description || null, tenant_id, branch_id]);

        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('[Create Project Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.deleteProject = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;

    try {
        const result = await db.query(`
            DELETE FROM re_projects
            WHERE id::text = $1::text AND tenant_id::text = $2::text
            RETURNING id
        `, [id, tenant_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Project not found.' });
        }

        res.json({ status: 'success', message: 'Project deleted successfully.' });
    } catch (err) {
        console.error('[Delete Project Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ==========================================
// PHASES
// ==========================================
exports.getPhases = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { project_id } = req.query;

    try {
        let query = `
            SELECT 
                ph.*,
                p.name as project_name,
                COUNT(DISTINCT b.id) as buildings_count,
                COUNT(DISTINCT u.id) as units_count
            FROM re_phases ph
            JOIN re_projects p ON ph.project_id::text = p.id::text AND p.tenant_id::text = ph.tenant_id::text
            LEFT JOIN re_buildings b ON ph.id::text = b.phase_id::text AND b.tenant_id::text = ph.tenant_id::text
            LEFT JOIN re_units u ON ph.id::text = u.phase_id::text AND u.tenant_id::text = ph.tenant_id::text
            WHERE ph.tenant_id::text = $1::text
        `;
        const params = [tenant_id];

        if (project_id) {
            params.push(project_id);
            query += ` AND ph.project_id::text = $${params.length}::text`;
        }

        query += ` GROUP BY ph.id, p.name ORDER BY ph.name ASC`;

        const result = await db.query(query, params);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('[Get Phases Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.createPhase = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const { project_id, name } = req.body;

    if (!project_id) {
        return res.status(400).json({ status: 'error', message: 'Project ID is required.' });
    }
    if (!name || !name.trim()) {
        return res.status(400).json({ status: 'error', message: 'Phase name is required.' });
    }

    try {
        // Validate project belongs to tenant
        const projCheck = await db.query(`SELECT id FROM re_projects WHERE id::text = $1::text AND tenant_id::text = $2::text`, [project_id, tenant_id]);
        if (projCheck.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Target project not found or unauthorized.' });
        }

        const result = await db.query(`
            INSERT INTO re_phases (project_id, name, tenant_id, branch_id)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [project_id, name.trim(), tenant_id, branch_id]);

        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('[Create Phase Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.deletePhase = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;

    try {
        const result = await db.query(`
            DELETE FROM re_phases
            WHERE id::text = $1::text AND tenant_id::text = $2::text
            RETURNING id
        `, [id, tenant_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Phase not found.' });
        }

        res.json({ status: 'success', message: 'Phase deleted successfully.' });
    } catch (err) {
        console.error('[Delete Phase Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ==========================================
// BUILDINGS
// ==========================================
exports.getBuildings = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { project_id, phase_id } = req.query;

    try {
        let query = `
            SELECT 
                b.*,
                p.name as project_name,
                ph.name as phase_name,
                COUNT(DISTINCT u.id) as units_count
            FROM re_buildings b
            JOIN re_projects p ON b.project_id::text = p.id::text AND p.tenant_id::text = b.tenant_id::text
            LEFT JOIN re_phases ph ON b.phase_id::text = ph.id::text AND ph.tenant_id::text = b.tenant_id::text
            LEFT JOIN re_units u ON b.id::text = u.building_id::text AND u.tenant_id::text = b.tenant_id::text
            WHERE b.tenant_id::text = $1::text
        `;
        const params = [tenant_id];

        if (project_id) {
            params.push(project_id);
            query += ` AND b.project_id::text = $${params.length}::text`;
        }
        if (phase_id) {
            params.push(phase_id);
            query += ` AND b.phase_id::text = $${params.length}::text`;
        }

        query += ` GROUP BY b.id, p.name, ph.name ORDER BY b.name ASC`;

        const result = await db.query(query, params);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('[Get Buildings Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.createBuilding = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;
    const { project_id, phase_id, name, floors_count } = req.body;

    if (!project_id) {
        return res.status(400).json({ status: 'error', message: 'Project ID is required.' });
    }
    if (!name || !name.trim()) {
        return res.status(400).json({ status: 'error', message: 'Building name is required.' });
    }

    try {
        // Validate project belongs to tenant
        const projCheck = await db.query(`SELECT id FROM re_projects WHERE id::text = $1::text AND tenant_id::text = $2::text`, [project_id, tenant_id]);
        if (projCheck.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Target project not found or unauthorized.' });
        }

        const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
        const cleanPhaseId = (phase_id && isUuid(phase_id)) ? phase_id : null;
        const floors = floors_count ? Math.max(1, parseInt(floors_count)) : 1;

        const result = await db.query(`
            INSERT INTO re_buildings (project_id, phase_id, name, floors_count, tenant_id, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [project_id, cleanPhaseId, name.trim(), floors, tenant_id, branch_id]);

        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('[Create Building Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.deleteBuilding = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const { id } = req.params;

    try {
        const result = await db.query(`
            DELETE FROM re_buildings
            WHERE id::text = $1::text AND tenant_id::text = $2::text
            RETURNING id
        `, [id, tenant_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Building not found.' });
        }

        res.json({ status: 'success', message: 'Building deleted successfully.' });
    } catch (err) {
        console.error('[Delete Building Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ==========================================
// HIERARCHY TREE (CASCADED NAVIGATION)
// ==========================================
exports.getHierarchyTree = async (req, res) => {
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;

    try {
        // Fetch all projects for tenant
        const projectsRes = await db.query(`
            SELECT 
                p.id, p.name, p.location, p.developer_id,
                d.name as developer_name
            FROM re_projects p
            LEFT JOIN re_developers d ON p.developer_id::text = d.id::text AND d.tenant_id::text = p.tenant_id::text
            WHERE p.tenant_id::text = $1::text
            AND ($2::text IS NULL OR p.branch_id::text = $2::text OR p.branch_id IS NULL)
            ORDER BY p.name ASC
        `, [tenant_id, branch_id]);

        // Fetch all phases
        const phasesRes = await db.query(`
            SELECT id, project_id, name 
            FROM re_phases 
            WHERE tenant_id::text = $1::text
            ORDER BY name ASC
        `, [tenant_id]);

        // Fetch all buildings
        const buildingsRes = await db.query(`
            SELECT id, project_id, phase_id, name, floors_count 
            FROM re_buildings 
            WHERE tenant_id::text = $1::text
            ORDER BY name ASC
        `, [tenant_id]);

        // Fetch all developers
        const developersRes = await db.query(`
            SELECT id, name, contact_person, phone, email
            FROM re_developers
            WHERE tenant_id::text = $1::text
            ORDER BY name ASC
        `, [tenant_id]);

        // Build tree
        const projects = projectsRes.rows.map(p => {
            const projectPhases = phasesRes.rows.filter(ph => String(ph.project_id) === String(p.id));
            const projectBuildings = buildingsRes.rows.filter(b => String(b.project_id) === String(p.id));
            return {
                ...p,
                phases: projectPhases,
                buildings: projectBuildings
            };
        });

        res.json({
            status: 'success',
            data: {
                developers: developersRes.rows,
                projects: projects
            }
        });
    } catch (err) {
        console.error('[Get Hierarchy Tree Error]:', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

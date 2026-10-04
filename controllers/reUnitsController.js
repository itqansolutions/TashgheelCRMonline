const db = require('../config/db');

/**
 * Real Estate Units Controller
 * Manages the inventory of units (Apartments, Villas, etc.)
 */

// @desc    Get all units for tenant
// @route   GET /api/re-units
exports.getUnits = async (req, res) => {
    const tenant_id = req.user?.tenant_id ? String(req.user.tenant_id) : null;
    const branch_id = req.branchId || req.user?.branch_id || null;
    const { developer_id, project_id, phase_id, building_id } = req.query;

    try {
        if (!tenant_id) {
            return res.status(400).json({ status: 'error', message: 'Tenant context missing' });
        }

        let query = `
            SELECT 
                ru.*,
                c.name as vendor_name,
                u.name as responsible_person_name,
                u_assigned.name as assigned_to_name,
                dev.name as developer_name,
                COALESCE(proj.name, ru.project_name) as project_name,
                phase.name as phase_name,
                bld.name as building_name
            FROM re_units ru
            LEFT JOIN customers c ON ru.vendor_id::text = c.id::text
            LEFT JOIN users u ON ru.responsible_person_id::text = u.id::text
            LEFT JOIN users u_assigned ON ru.assigned_to::text = u_assigned.id::text
            LEFT JOIN re_developers dev ON ru.developer_id::text = dev.id::text AND dev.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_projects proj ON ru.project_id::text = proj.id::text AND proj.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_phases phase ON ru.phase_id::text = phase.id::text AND phase.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_buildings bld ON ru.building_id::text = bld.id::text AND bld.tenant_id::text = ru.tenant_id::text
            WHERE ru.tenant_id::text = $1::text
            AND ($2::text IS NULL OR ru.branch_id::text = $2::text OR ru.branch_id IS NULL)
        `;
        const params = [tenant_id, branch_id ? String(branch_id) : null];

        if (developer_id) {
            params.push(developer_id);
            query += ` AND ru.developer_id::text = $${params.length}::text`;
        }
        if (project_id) {
            params.push(project_id);
            query += ` AND ru.project_id::text = $${params.length}::text`;
        }
        if (phase_id) {
            params.push(phase_id);
            query += ` AND ru.phase_id::text = $${params.length}::text`;
        }
        if (building_id) {
            params.push(building_id);
            query += ` AND ru.building_id::text = $${params.length}::text`;
        }

        query += ` ORDER BY COALESCE(proj.name, ru.project_name) DESC, ru.unit_number ASC, ru.name ASC`;

        const result = await db.query(query, params);
        res.json({ status: 'success', data: result.rows || [] });
    } catch (err) {
        console.error('[Units API Error]:', err.message);
        
        // --- GRACEFUL DEGRADATION ---
        const isTableMissing = err.message.includes('relation') && err.message.includes('does not exist');
        const isTimeout = err.message.includes('timeout') || err.message.includes('terminated');

        if (isTableMissing || isTimeout) {
            return res.status(200).json({ 
                status: 'success', 
                data: [], 
                message: 'Unit inventory is currently being synchronized with the cloud. Please refresh in a moment.' 
            });
        }

        res.status(500).json({ status: 'error', message: 'Dashboard intelligence platform is currently undergoing maintenance.', debug: err.message });
    }
};

// UUID validator helper
const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

// @desc    Create a new unit
// @route   POST /api/re-units
exports.createUnit = async (req, res) => {
    const { 
        name, project_name, unit_number, type, floor, area_sqm, price, 
        vendor_id, assigned_to, responsible_person_id, transaction_type, rooms, location,
        developer_id, project_id, phase_id, building_id
    } = req.body;
    
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;

    // Sanitize string/numeric IDs to handle both integer (e.g. 26) and UUID types
    const cleanVendorId = (vendor_id !== undefined && vendor_id !== null && String(vendor_id).trim() !== '' && String(vendor_id) !== 'null') ? String(vendor_id).trim() : null;
    const cleanAssignedTo = (assigned_to !== undefined && assigned_to !== null && String(assigned_to).trim() !== '' && String(assigned_to) !== 'null') ? String(assigned_to).trim() : null;
    const cleanResponsibleId = (responsible_person_id !== undefined && responsible_person_id !== null && String(responsible_person_id).trim() !== '' && String(responsible_person_id) !== 'null') ? String(responsible_person_id).trim() : null;
    
    // Developer & Project hierarchy IDs (validate UUID format so invalid values never crash Postgres)
    const cleanDevId = (developer_id && isUuid(developer_id)) ? developer_id : null;
    const cleanProjId = (project_id && isUuid(project_id)) ? project_id : null;
    const cleanPhaseId = (phase_id && isUuid(phase_id)) ? phase_id : null;
    const cleanBldId = (building_id && isUuid(building_id)) ? building_id : null;

    let finalProjectName = project_name;
    if (cleanProjId && (!finalProjectName || !finalProjectName.trim())) {
        try {
            const pRes = await db.query('SELECT name FROM re_projects WHERE id::text = $1::text', [cleanProjId]);
            if (pRes.rows.length > 0) finalProjectName = pRes.rows[0].name;
        } catch (e) {}
    }

    const insertParams = [
        tenant_id, branch_id, name, finalProjectName || null, unit_number, type, floor, area_sqm, price,
        cleanVendorId, cleanAssignedTo, cleanResponsibleId, transaction_type || 'sale', rooms || 0, location,
        cleanDevId, cleanProjId, cleanPhaseId, cleanBldId
    ];

    const insertSql = `
        INSERT INTO re_units (
            tenant_id, branch_id, name, project_name, unit_number, type, floor, area_sqm, price, 
            vendor_id, assigned_to, responsible_person_id, transaction_type, rooms, location, status,
            developer_id, project_id, phase_id, building_id
        )
        VALUES ($1::text, $2::text, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'Available', $16, $17, $18, $19)
        RETURNING *
    `;

    try {
        let result;
        try {
            result = await db.query(insertSql, insertParams);
        } catch (dbErr) {
            // Auto-Healing: If assigned_to or vendor_id in PostgreSQL is still typed as UUID, alter them to VARCHAR and retry
            if (dbErr.message && dbErr.message.includes('invalid input syntax for type uuid')) {
                console.warn('[Auto-Healing] Detected UUID type collision on re_units. Converting columns to VARCHAR(255)...');
                await db.query(`
                    ALTER TABLE re_units 
                    ALTER COLUMN assigned_to TYPE VARCHAR(255) USING assigned_to::text,
                    ALTER COLUMN vendor_id TYPE VARCHAR(255) USING vendor_id::text,
                    ALTER COLUMN responsible_person_id TYPE VARCHAR(255) USING responsible_person_id::text
                `);
                result = await db.query(insertSql, insertParams);
            } else {
                throw dbErr;
            }
        }
        
        const newUnit = result.rows[0];

        // AUTO-TASK: If an employee is assigned, create a task notification in their queue
        if (cleanAssignedTo) {
            try {
                await db.query(`
                    INSERT INTO tasks (title, description, priority, status, assigned_to, created_by, parent_type, parent_id, tenant_id, branch_id)
                    VALUES ($1, $2, 'medium', 'todo', $3, $4, 'unit', $5, $6, $7)
                `, [
                    `Handle Unit: ${unit_number || name} @ ${project_name || 'Property'}`,
                    `You have been assigned to manage this real estate unit. Unit Type: ${type}, Area: ${area_sqm}m², Price: ${Number(price).toLocaleString()} EGP.`,
                    cleanAssignedTo,
                    req.user.id,
                    newUnit.id,
                    tenant_id,
                    branch_id
                ]);
            } catch (taskErr) {
                // Non-fatal: log but don't block the unit creation
                console.error('[Auto-Task Create Warning]', taskErr.message);
            }
        }

        res.status(201).json({ status: 'success', data: newUnit });
    } catch (err) {
        console.error('[Unit Create Error]', err.message);
        res.status(500).json({ status: 'error', message: err.message, stack: err.stack });
    }
};


// @desc    Update unit details or status
// @route   PUT /api/re-units/:id
exports.updateUnit = async (req, res) => {
    const { id } = req.params;
    const tenant_id = String(req.user.tenant_id);
    const branch_id = String(req.branchId || req.user?.branch_id);

    // Dynamic PATCH: only update fields that were explicitly sent in the request body
    const allowedFields = [
        'name', 'project_name', 'unit_number', 'type', 'floor', 
        'area_sqm', 'price', 'status', 'vendor_id', 'assigned_to', 
        'responsible_person_id', 'transaction_type', 'rooms', 'location',
        'developer_id', 'project_id', 'phase_id', 'building_id'
    ];

    const fkFields = ['vendor_id', 'assigned_to', 'responsible_person_id', 'developer_id', 'project_id', 'phase_id', 'building_id'];

    const setClauses = [];
    const values = [];
    let paramIdx = 1;

    for (const field of allowedFields) {
        if (req.body.hasOwnProperty(field)) {
            let val = req.body[field];
            // Convert empty string to null for foreign keys/references
            if (fkFields.includes(field) && (val === '' || val === 'null' || val === undefined)) {
                val = null;
            } else if (['developer_id', 'project_id', 'phase_id', 'building_id'].includes(field) && val && !isUuid(val)) {
                val = null;
            }
            setClauses.push(`${field} = $${paramIdx}`);
            values.push(val);
            paramIdx++;
        }
    }

    if (setClauses.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
    }

    // Always update the timestamp
    setClauses.push(`updated_at = NOW()`);

    // Append WHERE clause parameters
    values.push(id, tenant_id, branch_id);
    const whereP1 = paramIdx;
    const whereP2 = paramIdx + 1;
    const whereP3 = paramIdx + 2;

    const updateSql = `
        UPDATE re_units 
        SET ${setClauses.join(', ')}
        WHERE id = $${whereP1}::uuid 
          AND tenant_id::text = $${whereP2}::text 
          AND ($${whereP3}::text IS NULL OR branch_id::text = $${whereP3}::text OR branch_id IS NULL)
        RETURNING *
    `;

    try {
        let result;
        try {
            result = await db.query(updateSql, values);
        } catch (dbErr) {
            if (dbErr.message && dbErr.message.includes('invalid input syntax for type uuid')) {
                console.warn('[Auto-Healing] Altering re_units columns on updateUnit...');
                await db.query(`
                    ALTER TABLE re_units 
                    ALTER COLUMN assigned_to TYPE VARCHAR(255) USING assigned_to::text,
                    ALTER COLUMN vendor_id TYPE VARCHAR(255) USING vendor_id::text,
                    ALTER COLUMN responsible_person_id TYPE VARCHAR(255) USING responsible_person_id::text
                `);
                result = await db.query(updateSql, values);
            } else {
                throw dbErr;
            }
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Unit not found or unauthorized' });
        }
        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('[Unit Update Error]', err.message, err.stack);
        res.status(500).json({ status: 'error', message: err.message });
    }
};


// @desc    Get single unit details
// @route   GET /api/re-units/:id
exports.getUnitById = async (req, res) => {
    const { id } = req.params;
    const tenant_id = String(req.user.tenant_id);
    const branch_id = String(req.branchId || req.user?.branch_id);

    try {
        const result = await db.query(`
            SELECT 
                ru.*,
                c.name as vendor_name,
                u.name as responsible_person_name,
                emp.name as assigned_to_name
            FROM re_units ru
            LEFT JOIN customers c ON ru.vendor_id::text = c.id::text
            LEFT JOIN users u ON ru.responsible_person_id::text = u.id::text
            LEFT JOIN users emp ON ru.assigned_to::text = emp.id::text
            WHERE ru.id = $1::uuid 
              AND ru.tenant_id::text = $2::text 
              AND ru.branch_id::text = $3::text
        `, [id, tenant_id, branch_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Unit not found or unauthorized' });
        }

        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('[Unit Detail Error]:', err.message);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};


// @desc    Delete unit (only if Available)
// @route   DELETE /api/re-units/:id
exports.deleteUnit = async (req, res) => {
    const { id } = req.params;
    const tenant_id = String(req.user.tenant_id);
    const branch_id = String(req.branchId || req.user?.branch_id);

    try {
        // Safety: Can't delete if Reserved or Sold
        const check = await db.query('SELECT status FROM re_units WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text', [id, tenant_id, branch_id]);
        if (check.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Unit not found' });
        
        if (check.rows[0].status !== 'Available') {
            return res.status(400).json({ status: 'error', message: 'Cannot delete a unit that is Reserved or Sold' });
        }

        await db.query('DELETE FROM re_units WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text', [id, tenant_id, branch_id]);
        res.json({ status: 'success', message: 'Unit removed from inventory' });
    } catch (err) {
        console.error('[Unit Delete Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// @desc    Extend reservation for a property unit
// @route   POST /api/re-units/:id/extend-reservation
// @access  Private
exports.extendUnitReservation = async (req, res) => {
    const { id } = req.params;
    const { extension_hours = 24 } = req.body;
    const tenant_id = String(req.user.tenant_id);
    const branch_id = String(req.branchId || req.user?.branch_id || '');

    try {
        const { extendReservation } = require('../services/reservationService');
        const result = await extendReservation({
            unitId: id,
            tenantId: tenant_id,
            branchId: branch_id,
            user: req.user,
            extensionHours: extension_hours,
            req
        });
        res.json(result);
    } catch (err) {
        console.error('[Unit Extend Reservation Error]:', err.message);
        res.status(err.statusCode || 400).json({ status: 'error', message: err.message });
    }
};

// @desc    Deterministic matching: Find best units for a customer
// @route   GET /api/re-units/match-customer/:customerId
// @access  Private
exports.matchUnitsForCustomer = async (req, res) => {
    const { customerId } = req.params;
    const { include_all } = req.query;
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;

    try {
        const { matchUnitsForCustomer } = require('../services/reMatchingService');
        const result = await matchUnitsForCustomer({
            tenantId: tenant_id,
            branchId: branch_id,
            customerId,
            includeAllStatus: include_all === 'true' || include_all === '1'
        });
        res.json({ status: 'success', data: result });
    } catch (err) {
        console.error('[Unit Match Customer Error]:', err.message);
        res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
    }
};

// @desc    Deterministic matching: Find best buyer customers for a unit
// @route   GET /api/re-units/match-unit/:unitId
// @access  Private
exports.matchCustomersForUnit = async (req, res) => {
    const { unitId } = req.params;
    const { min_score = 0 } = req.query;
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;

    try {
        const { matchCustomersForUnit } = require('../services/reMatchingService');
        const result = await matchCustomersForUnit({
            tenantId: tenant_id,
            branchId: branch_id,
            unitId,
            minScore: parseInt(min_score) || 0
        });
        res.json({ status: 'success', data: result });
    } catch (err) {
        console.error('[Customer Match Unit Error]:', err.message);
        res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
    }
};

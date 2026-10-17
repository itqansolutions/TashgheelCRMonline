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
                bld.name as building_name,
                pflm.publication_status as pf_publication_status,
                pflm.external_listing_id as pf_external_listing_id,
                pflm.portal_url as pf_portal_url,
                pflm.rejection_reason as pf_rejection_reason
            FROM re_units ru
            LEFT JOIN customers c ON ru.vendor_id::text = c.id::text
            LEFT JOIN users u ON ru.responsible_person_id::text = u.id::text
            LEFT JOIN users u_assigned ON ru.assigned_to::text = u_assigned.id::text
            LEFT JOIN re_developers dev ON ru.developer_id::text = dev.id::text AND dev.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_projects proj ON ru.project_id::text = proj.id::text AND proj.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_phases phase ON ru.phase_id::text = phase.id::text AND phase.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_buildings bld ON ru.building_id::text = bld.id::text AND bld.tenant_id::text = ru.tenant_id::text
            LEFT JOIN property_finder_listing_mappings pflm ON ru.id = pflm.unit_id AND pflm.tenant_id::text = ru.tenant_id::text
            WHERE ru.tenant_id::text = $1::text
            AND ($2::text IS NULL OR ru.status = 'Available' OR ru.branch_id::text = $2::text OR ru.branch_id IS NULL)
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
    const branch_id = req.branchId || req.user?.branch_id || null;

    // Dynamic PATCH: only update fields that were explicitly sent in the request body
    // NOTE: 'status' is deliberately EXCLUDED from allowedFields to prevent direct manual tampering
    const allowedFields = [
        'name', 'project_name', 'unit_number', 'type', 'floor',
        'area_sqm', 'price', 'vendor_id', 'assigned_to',
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

    let isDisputeTransition = false;
    let disputeDetails = null;
    let currentUnit = null;

    if (req.body.hasOwnProperty('status')) {
        const targetStatus = req.body.status;
        const ALLOWED_UNIT_STATUSES = ['Available', 'Reserved', 'Contracted', 'Handed Over', 'Under Dispute'];
        if (!ALLOWED_UNIT_STATUSES.includes(targetStatus)) {
            return res.status(400).json({
                status: 'error',
                code: 'INVALID_STATUS',
                message: `Invalid unit status. Allowed: ${ALLOWED_UNIT_STATUSES.join(', ')}`
            });
        }

        // Fetch current unit status to validate
        const currentRes = await db.query(
            `SELECT id, status, branch_id FROM re_units WHERE id = $1::uuid AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)`,
            [id, tenant_id, branch_id ? String(branch_id) : null]
        );
        if (currentRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Unit not found or unauthorized' });
        }
        currentUnit = currentRes.rows[0];
        const curr = currentUnit.status;

        if (curr !== targetStatus) {
            const userRole = req.user?.role;
            const isManagerOrAdmin = ['admin', 'manager'].includes(userRole);
            const reason = req.body.reason || req.body.dispute_reason || req.body.resolution_reason || req.body.notes;

            // Administrative Dispute Workflow:
            if (targetStatus === 'Under Dispute') {
                if (!isManagerOrAdmin) {
                    return res.status(403).json({
                        status: 'error',
                        code: 'UNAUTHORIZED_STATUS_CHANGE',
                        message: 'Only admin or manager can place a unit Under Dispute.'
                    });
                }
                if (!reason || !reason.trim()) {
                    return res.status(400).json({
                        status: 'error',
                        code: 'REASON_REQUIRED',
                        message: 'A reason is required to place a unit Under Dispute.'
                    });
                }
                isDisputeTransition = true;
                disputeDetails = { from: curr, to: targetStatus, reason: reason.trim() };
                setClauses.push(`status = $${paramIdx}`);
                values.push(targetStatus);
                paramIdx++;
            } else if (curr === 'Under Dispute' && targetStatus === 'Available') {
                if (!isManagerOrAdmin) {
                    return res.status(403).json({
                        status: 'error',
                        code: 'UNAUTHORIZED_STATUS_CHANGE',
                        message: 'Only admin or manager can resolve a unit from Under Dispute.'
                    });
                }
                if (!reason || !reason.trim()) {
                    return res.status(400).json({
                        status: 'error',
                        code: 'REASON_REQUIRED',
                        message: 'A resolution reason is required to restore a disputed unit to Available.'
                    });
                }
                isDisputeTransition = true;
                disputeDetails = { from: curr, to: targetStatus, reason: reason.trim() };
                setClauses.push(`status = $${paramIdx}`);
                values.push(targetStatus);
                paramIdx++;
            } else {
                return res.status(400).json({
                    status: 'error',
                    code: 'DIRECT_STATUS_CHANGE_PROHIBITED',
                    message: `Direct manual transition to '${targetStatus}' is prohibited. Unit lifecycle changes must occur through legitimate workflows (Reservation, Deal/Contract, Handover, or Cancellation).`
                });
            }
        }
    }

    if (setClauses.length === 0) {
        if (req.body.hasOwnProperty('status') && currentUnit && currentUnit.status === req.body.status) {
            return res.json({ status: 'success', data: currentUnit, message: 'Status is already unchanged.' });
        }
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
    }

    // Always update the timestamp
    setClauses.push(`updated_at = NOW()`);

    // Append WHERE clause parameters
    values.push(id, tenant_id, branch_id ? String(branch_id) : null);
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

        const updatedUnit = result.rows[0];

        // Audit log dispute changes to system_logs
        if (isDisputeTransition && disputeDetails) {
            try {
                const { logAction, ACTIONS } = require('../services/loggerService');
                logAction({
                    userId: req.user?.id || null,
                    tenantId: tenant_id,
                    action: ACTIONS.UPDATE,
                    entityType: 'UnitStatus',
                    entityId: id,
                    details: disputeDetails,
                    req
                });
            } catch (logErr) {
                console.warn('[Dispute Audit Log Warning]:', logErr.message);
            }
        }

        res.json({ status: 'success', data: updatedUnit });
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
    const branch_id = req.branchId || req.user?.branch_id || null;

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
              AND ($3::text IS NULL OR ru.status = 'Available' OR ru.branch_id::text = $3::text OR ru.branch_id IS NULL)
        `, [id, tenant_id, branch_id ? String(branch_id) : null]);

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Unit not found or unauthorized' });
        }

        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('[Unit Detail Error]:', err.message);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};

// @desc    Get comprehensive Unit Overview Card (unit details + 4 distinct RBAC-scoped KPIs + RBAC-scoped deals/customers list)
// @route   GET /api/re-units/:id/overview
// @access  Private (RBAC-scoped)
exports.getUnitOverview = async (req, res) => {
    const { id } = req.params;
    const tenant_id = req.user?.tenant_id ? String(req.user.tenant_id) : null;
    const branch_id = req.branchId || req.user?.branch_id || null;
    const { stage, assigned_to, source, status, search } = req.query;

    if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'Tenant context missing' });
    }
    if (!isUuid(id)) {
        return res.status(400).json({ status: 'error', message: 'Invalid unit ID format' });
    }

    try {
        // 1. Fetch Unit Details with Hierarchy & Property Finder Listing Mapping
        const unitRes = await db.query(`
            SELECT
                ru.*,
                c.name as vendor_name,
                u.name as responsible_person_name,
                emp.name as assigned_to_name,
                dev.name as developer_name,
                COALESCE(proj.name, ru.project_name) as project_name,
                phase.name as phase_name,
                bld.name as building_name,
                pflm.publication_status as pf_publication_status,
                pflm.external_listing_id as pf_external_listing_id,
                pflm.portal_url as pf_portal_url,
                pflm.rejection_reason as pf_rejection_reason,
                pflm.external_reference as pf_reference_code
            FROM re_units ru
            LEFT JOIN customers c ON ru.vendor_id::text = c.id::text AND c.tenant_id::text = ru.tenant_id::text
            LEFT JOIN users u ON ru.responsible_person_id::text = u.id::text AND u.tenant_id::text = ru.tenant_id::text
            LEFT JOIN users emp ON ru.assigned_to::text = emp.id::text AND emp.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_developers dev ON ru.developer_id::text = dev.id::text AND dev.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_projects proj ON ru.project_id::text = proj.id::text AND proj.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_phases phase ON ru.phase_id::text = phase.id::text AND phase.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_buildings bld ON ru.building_id::text = bld.id::text AND bld.tenant_id::text = ru.tenant_id::text
            LEFT JOIN property_finder_listing_mappings pflm ON ru.id = pflm.unit_id AND pflm.tenant_id::text = ru.tenant_id::text
            WHERE ru.id = $1::uuid
              AND ru.tenant_id::text = $2::text
              AND ($3::text IS NULL OR ru.status = 'Available' OR ru.branch_id::text = $3::text OR ru.branch_id IS NULL)
            LIMIT 1
        `, [id, tenant_id, branch_id ? String(branch_id) : null]);

        if (unitRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Unit not found or unauthorized' });
        }

        const unit = unitRes.rows[0];

        // 2. Build strict RBAC Scope Predicate for Deals on this Unit
        const accessScopeService = require('../services/accessScopeService');
        const dealParams = [id, tenant_id, branch_id ? String(branch_id) : null];
        const scope = await accessScopeService.buildScopePredicate({
            user: req.user,
            tableAlias: 'd',
            assigneeCol: 'assigned_to',
            paramIndex: 4
        });
        dealParams.push(...scope.params);

        const dealsRes = await db.query(`
            SELECT
                d.id as deal_id,
                d.title as deal_title,
                d.value,
                d.pipeline_stage,
                d.client_id as customer_id,
                d.assigned_to,
                d.branch_id,
                d.custom_fields,
                COALESCE(NULLIF(d.custom_fields->>'sla_extended_until', '')::timestamptz, d.created_at + INTERVAL '48 hours') as sla_deadline_at,
                COALESCE(NULLIF(d.custom_fields->>'sla_extension_count', '')::int, 0) as sla_extended_count,
                d.created_at,
                d.updated_at,
                c.name as customer_name,
                c.phone as customer_phone,
                c.email as customer_email,
                c.status as customer_status,
                COALESCE(ls.name, 'Direct') as customer_source_name,
                u.name as sales_rep_name,
                u.email as sales_rep_email,
                u.role as sales_rep_role,
                pf.pf_lead_id,
                pf.channel as pf_channel,
                pf.pf_mapping_status
            FROM deals d
            LEFT JOIN customers c ON d.client_id::text = c.id::text AND d.tenant_id::text = c.tenant_id::text
            LEFT JOIN lead_sources ls ON c.source_id::text = ls.id::text
            LEFT JOIN users u ON d.assigned_to::text = u.id::text AND d.tenant_id::text = u.tenant_id::text
            LEFT JOIN LATERAL (
                SELECT pflm.external_lead_id as pf_lead_id, pflm.channel, 'mapped' as pf_mapping_status
                FROM property_finder_lead_mappings pflm
                WHERE (pflm.external_lead_id = d.source_id OR (pflm.customer_id::text = d.client_id::text AND pflm.unit_id::text = d.unit_id::text))
                  AND pflm.tenant_id::text = d.tenant_id::text
                ORDER BY pflm.id DESC
                LIMIT 1
            ) pf ON true
            WHERE (d.unit_id::text = $1::text OR (d.custom_fields->>'unit_id') = $1::text)
              AND d.tenant_id::text = $2::text
              AND ($3::text IS NULL OR d.branch_id::text = $3::text OR d.branch_id IS NULL)
              AND (${scope.sql})
            ORDER BY d.created_at DESC, d.id DESC
        `, dealParams);

        const rawDeals = dealsRes.rows || [];

        // 3. Enrich deals with latest activity & next follow-up task (best-effort, non-blocking)
        const dealIds = rawDeals.map(r => String(r.deal_id));
        const customerIds = [...new Set(rawDeals.map(r => r.customer_id ? String(r.customer_id) : null).filter(Boolean))];

        const latestActivityByDeal = new Map();
        const latestActivityByCustomer = new Map();
        const nextTaskByDeal = new Map();
        const nextTaskByCustomer = new Map();

        if (dealIds.length > 0) {
            try {
                const actRes = await db.query(`
                    SELECT entity_type, entity_id::text as entity_id, action, meta, created_at
                    FROM activities
                    WHERE tenant_id::text = $1::text
                      AND (
                          (LOWER(entity_type) = 'deal' AND entity_id::text = ANY($2::text[]))
                          OR (LOWER(entity_type) = 'customer' AND entity_id::text = ANY($3::text[]))
                      )
                    ORDER BY created_at DESC
                `, [tenant_id, dealIds, customerIds]);

                for (const act of actRes.rows) {
                    const summary = (act.meta?.changes?.note?.to) || act.action || 'Activity';
                    const entry = {
                        at: act.created_at,
                        type: act.action || 'interaction',
                        summary
                    };
                    const eType = String(act.entity_type || '').toLowerCase();
                    if (eType === 'deal' && !latestActivityByDeal.has(act.entity_id)) {
                        latestActivityByDeal.set(act.entity_id, entry);
                    } else if (eType === 'customer' && !latestActivityByCustomer.has(act.entity_id)) {
                        latestActivityByCustomer.set(act.entity_id, entry);
                    }
                }
            } catch (actErr) {
                // Non-fatal if activities table is absent or differs
            }

            try {
                const taskRes = await db.query(`
                    SELECT parent_type, parent_id::text as parent_id, title, due_date, status, priority, created_at
                    FROM tasks
                    WHERE tenant_id::text = $1::text
                      AND LOWER(COALESCE(status, 'todo')) NOT IN ('done', 'completed', 'cancelled')
                      AND (
                          (LOWER(parent_type) IN ('deal', 'deals') AND parent_id::text = ANY($2::text[]))
                          OR (LOWER(parent_type) = 'customer' AND parent_id::text = ANY($3::text[]))
                      )
                    ORDER BY due_date ASC NULLS LAST, created_at DESC
                `, [tenant_id, dealIds, customerIds]);

                for (const t of taskRes.rows) {
                    const pType = String(t.parent_type || '').toLowerCase();
                    if ((pType === 'deal' || pType === 'deals') && !nextTaskByDeal.has(t.parent_id)) {
                        nextTaskByDeal.set(t.parent_id, t);
                    } else if (pType === 'customer' && !nextTaskByCustomer.has(t.parent_id)) {
                        nextTaskByCustomer.set(t.parent_id, t);
                    }
                }
            } catch (taskErr) {
                // Non-fatal
            }
        }

        const CLOSED_STAGES = new Set(['won', 'lost', 'closed', 'cancelled', 'canceled', 'closed won', 'closed lost']);
        const now = new Date();

        const scopedDeals = rawDeals.map(row => {
            const stageRaw = String(row.pipeline_stage || 'Lead').trim();
            const stageLower = stageRaw.toLowerCase();
            const isClosed = CLOSED_STAGES.has(stageLower);
            const isActive = !isClosed;
            let dealStatus = 'active';
            if (stageLower === 'won' || stageLower === 'closed' || stageLower === 'closed won') dealStatus = 'won';
            else if (stageLower === 'lost' || stageLower === 'cancelled' || stageLower === 'canceled' || stageLower === 'closed lost') dealStatus = 'lost';

            const cf = (row.custom_fields && typeof row.custom_fields === 'object') ? row.custom_fields : {};
            const isUnitReservation = (
                cf.is_unit_reservation === true ||
                cf.is_unit_reservation === 'true' ||
                ['reserved', 'reservation', 'حجز'].includes(stageLower)
            );

            // Resolve channel / source
            let sourceChannel = 'Manual';
            if (row.pf_lead_id || cf.pf_lead_id || cf.source === 'Property Finder') {
                const ch = row.pf_channel || cf.pf_channel || cf.channel;
                sourceChannel = ch ? `Property Finder (${ch})` : 'Property Finder';
            } else if (cf.source) {
                sourceChannel = String(cf.source);
            } else if (row.customer_source_name && row.customer_source_name !== 'Direct') {
                sourceChannel = row.customer_source_name;
            }

            const dealAct = latestActivityByDeal.get(String(row.deal_id))
                || (row.customer_id ? latestActivityByCustomer.get(String(row.customer_id)) : null);
            const nextTask = nextTaskByDeal.get(String(row.deal_id))
                || (row.customer_id ? nextTaskByCustomer.get(String(row.customer_id)) : null);

            const slaDeadline = row.sla_deadline_at ? new Date(row.sla_deadline_at) : null;
            const nextFollowupAt = nextTask?.due_date || row.sla_deadline_at || null;
            const isOverdue = isActive && slaDeadline ? slaDeadline < now : false;

            return {
                deal_id: row.deal_id,
                deal_title: row.deal_title,
                value: Number(row.value || 0),
                pipeline_stage: stageRaw,
                deal_status: dealStatus,
                is_active: isActive,
                is_unit_reservation: isUnitReservation,
                customer_id: row.customer_id,
                customer_name: row.customer_name || 'عميل غير محدد',
                customer_phone: row.customer_phone || null,
                customer_email: row.customer_email || null,
                assigned_to: row.assigned_to || null,
                sales_rep_name: row.sales_rep_name || 'غير معيّن',
                sales_rep_role: row.sales_rep_role || null,
                source: sourceChannel,
                pf_lead_id: row.pf_lead_id || cf.pf_lead_id || null,
                pf_channel: row.pf_channel || cf.pf_channel || null,
                last_followup_at: dealAct?.at || row.updated_at || row.created_at,
                last_followup_summary: dealAct?.summary || null,
                last_followup_type: dealAct?.type || null,
                next_followup_at: nextFollowupAt,
                next_task_title: nextTask?.title || null,
                sla_deadline_at: row.sla_deadline_at || null,
                is_overdue: isOverdue,
                created_at: row.created_at,
                updated_at: row.updated_at
            };
        });

        // 4. Compute the 4 Distinct KPIs strictly from RBAC-scoped deals
        const distinctCustomerIds = new Set(
            scopedDeals.map(d => d.customer_id ? String(d.customer_id) : null).filter(Boolean)
        );
        const distinctSalesRepIds = new Set(
            scopedDeals.map(d => d.assigned_to ? String(d.assigned_to) : null).filter(Boolean)
        );
        const totalDealsCount = scopedDeals.length;
        const activeDealsCount = scopedDeals.filter(d => d.is_active).length;

        const kpis = {
            distinct_customers_count: distinctCustomerIds.size,
            total_deals_count: totalDealsCount,
            active_deals_count: activeDealsCount,
            distinct_sales_reps_count: distinctSalesRepIds.size
        };

        // 5. Build filter options from scopedDeals
        const stagesOption = [...new Set(scopedDeals.map(d => d.pipeline_stage).filter(Boolean))];
        const repsMap = new Map();
        for (const d of scopedDeals) {
            if (d.assigned_to) {
                repsMap.set(String(d.assigned_to), { id: String(d.assigned_to), name: d.sales_rep_name });
            }
        }
        const sourcesOption = [...new Set(scopedDeals.map(d => d.source).filter(Boolean))];

        // 6. Apply optional query filters to the returned rows
        let filteredDeals = scopedDeals;
        if (stage && String(stage).trim() !== '' && String(stage).toLowerCase() !== 'all') {
            const targetStage = String(stage).trim().toLowerCase();
            filteredDeals = filteredDeals.filter(d => String(d.pipeline_stage || '').trim().toLowerCase() === targetStage);
        }
        if (assigned_to && String(assigned_to).trim() !== '' && String(assigned_to).toLowerCase() !== 'all') {
            const targetRep = String(assigned_to).trim();
            filteredDeals = filteredDeals.filter(d => String(d.assigned_to || '') === targetRep);
        }
        if (source && String(source).trim() !== '' && String(source).toLowerCase() !== 'all') {
            const targetSource = String(source).trim().toLowerCase();
            filteredDeals = filteredDeals.filter(d => String(d.source || '').toLowerCase().includes(targetSource));
        }
        if (status && String(status).trim() !== '' && String(status).toLowerCase() !== 'all') {
            const targetStatus = String(status).trim().toLowerCase();
            if (targetStatus === 'active') {
                filteredDeals = filteredDeals.filter(d => d.is_active);
            } else if (targetStatus === 'closed') {
                filteredDeals = filteredDeals.filter(d => !d.is_active);
            } else {
                filteredDeals = filteredDeals.filter(d => d.deal_status === targetStatus);
            }
        }
        if (search && String(search).trim() !== '') {
            const q = String(search).trim().toLowerCase();
            filteredDeals = filteredDeals.filter(d =>
                String(d.customer_name || '').toLowerCase().includes(q) ||
                String(d.customer_phone || '').toLowerCase().includes(q) ||
                String(d.deal_title || '').toLowerCase().includes(q) ||
                String(d.sales_rep_name || '').toLowerCase().includes(q) ||
                String(d.pf_lead_id || '').toLowerCase().includes(q)
            );
        }

        const activeReservationDeal = scopedDeals.find(d => d.is_active && d.is_unit_reservation) || null;

        res.json({
            status: 'success',
            data: {
                unit: {
                    id: unit.id,
                    unit_number: unit.unit_number,
                    name: unit.name,
                    project_id: unit.project_id,
                    project_name: unit.project_name,
                    developer_id: unit.developer_id,
                    developer_name: unit.developer_name,
                    phase_id: unit.phase_id,
                    phase_name: unit.phase_name,
                    building_id: unit.building_id,
                    building_name: unit.building_name,
                    type: unit.type,
                    floor: unit.floor,
                    rooms: unit.rooms,
                    area_sqm: unit.area_sqm,
                    price: unit.price,
                    location: unit.location,
                    transaction_type: unit.transaction_type,
                    status: unit.status,
                    reservation_expires_at: unit.reservation_expires_at,
                    reservation_extension_count: unit.reservation_extension_count || 0,
                    assigned_to: unit.assigned_to,
                    assigned_to_name: unit.assigned_to_name,
                    responsible_person_id: unit.responsible_person_id,
                    responsible_person_name: unit.responsible_person_name,
                    vendor_id: unit.vendor_id,
                    vendor_name: unit.vendor_name,
                    pf_external_listing_id: unit.pf_external_listing_id || null,
                    pf_reference_code: unit.pf_reference_code || null,
                    pf_publication_status: unit.pf_publication_status || null,
                    pf_portal_url: unit.pf_portal_url || null
                },
                kpis,
                active_reservation_deal: activeReservationDeal,
                filter_options: {
                    stages: stagesOption,
                    sales_reps: Array.from(repsMap.values()),
                    sources: sourcesOption
                },
                deals: filteredDeals,
                total_scoped_deals: scopedDeals.length,
                filtered_deals_count: filteredDeals.length
            }
        });
    } catch (err) {
        console.error('[Unit Overview Error]:', err.message, err.stack);
        res.status(500).json({ status: 'error', message: 'Failed to load unit overview' });
    }
};


// @desc    Delete unit (only if Available)
// @route   DELETE /api/re-units/:id
exports.deleteUnit = async (req, res) => {
    const { id } = req.params;
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;

    try {
        // Safety: Can only delete Available units in the user's branch (or global)
        const check = await db.query(
            'SELECT status FROM re_units WHERE id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)',
            [id, tenant_id, branch_id ? String(branch_id) : null]
        );
        if (check.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Unit not found' });

        if (check.rows[0].status !== 'Available') {
            return res.status(400).json({ status: 'error', message: `Cannot delete a unit with status '${check.rows[0].status}'. Only Available units can be removed.` });
        }

        await db.query(
            'DELETE FROM re_units WHERE id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)',
            [id, tenant_id, branch_id ? String(branch_id) : null]
        );
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

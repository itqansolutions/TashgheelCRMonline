const db = require('../config/db');
const { countUnitLinks } = require('../services/reDeletionGuard');
const { logDelete } = require('../services/loggerService');

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
                pflm.rejection_reason as pf_rejection_reason,
                (SELECT a.id FROM attachments a WHERE a.tenant_id::text=ru.tenant_id::text AND a.linked_id=ru.id::text AND a.linked_type='pf_unit_private' AND a.file_data IS NOT NULL ORDER BY a.id LIMIT 1) AS pf_cover_photo_id
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

        res.status(503).json({status:'error',code:'UNIT_INVENTORY_UNAVAILABLE',message:'Unit inventory could not be loaded. Please retry.'});
    }
};

// Authenticated stored-photo byte read. No provider requests or filesystem writes.
exports.getStoredUnitPhoto = async (req,res) => {
    const tenantId=req.user?.tenant_id;
    if(!tenantId)return res.status(400).json({status:'error',message:'Tenant context missing'});
    try {
        const result=await db.query(`SELECT a.mime_type,a.file_data FROM attachments a JOIN re_units u ON u.id::text=a.linked_id AND u.tenant_id::text=a.tenant_id::text WHERE a.id::text=$1::text AND a.linked_type='pf_unit_private' AND a.tenant_id::text=$2::text AND u.id::text=$3::text AND ($4::text IS NULL OR u.status='Available' OR u.branch_id::text=$4::text OR u.branch_id IS NULL)`,[req.params.photoId,String(tenantId),req.params.id,req.branchId||req.user?.branch_id||null]);
        const row=result.rows[0];
        if(!row?.file_data)return res.status(404).json({status:'error',message:'Photo not found'});
        res.set('Content-Type',row.mime_type);res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');
        return res.send(Buffer.from(row.file_data,'base64'));
    } catch(_) {return res.status(503).json({status:'error',message:'Photo unavailable'});}
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

    if (price !== undefined && price !== null && price !== '' && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
        return res.status(400).json({ status: 'error', code: 'INVALID_PRICE', message: 'Price must be a non-negative number.' });
    }

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

    const unitEvents = require('../services/unitEventService');
    const wantsMarketing = Object.prototype.hasOwnProperty.call(req.body, 'marketing_active');
    if (setClauses.length === 0 && !wantsMarketing) {
        if (req.body.hasOwnProperty('status') && currentUnit && currentUnit.status === req.body.status) {
            return res.json({ status: 'success', data: currentUnit, message: 'Status is already unchanged.' });
        }
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
    }

    const branchParam = branch_id ? String(branch_id) : null;
    const client = db.connect ? await db.connect() : await db.pool.connect();
    try {
        await client.query('BEGIN');
        // Lock the unit so the price/marketing change and its history event are one atomic step.
        const lockRes = await client.query(
            `SELECT * FROM re_units WHERE id = $1::uuid AND tenant_id::text = $2::text
               AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL) FOR UPDATE`,
            [id, tenant_id, branchParam]);
        if (lockRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Unit not found or unauthorized' });
        }
        const oldUnit = lockRes.rows[0];
        const events = [];
        const priceEvent = unitEvents.buildPriceEvent(oldUnit, req.body);
        if (priceEvent) events.push(priceEvent);

        if (wantsMarketing) {
            const m = await unitEvents.planMarketingChange(client, oldUnit, req.body, tenant_id);
            if (m.changed) {
                setClauses.push(`marketing_active = $${paramIdx}`); values.push(m.active); paramIdx++;
                setClauses.push(`marketing_inactive_reason = $${paramIdx}`); values.push(m.reason); paramIdx++;
                setClauses.push(`marketing_changed_at = NOW()`);
                setClauses.push(`marketing_changed_by = $${paramIdx}`); values.push(req.user?.id ?? null); paramIdx++;
                events.push(m.event);
            }
        }

        let data = oldUnit;
        if (setClauses.length > 0) {
            setClauses.push(`updated_at = NOW()`);
            values.push(id, tenant_id, branchParam);
            const updateSql = `
                UPDATE re_units
                SET ${setClauses.join(', ')}
                WHERE id = $${paramIdx}::uuid
                  AND tenant_id::text = $${paramIdx + 1}::text
                  AND ($${paramIdx + 2}::text IS NULL OR branch_id::text = $${paramIdx + 2}::text OR branch_id IS NULL)
                RETURNING *`;
            const result = await client.query(updateSql, values);
            data = result.rows[0];
        }
        for (const ev of events) await unitEvents.insertEvent(client, { tenantId: tenant_id, branchId: oldUnit.branch_id, unitId: id, user: req.user, ...ev });
        await client.query('COMMIT');

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

        res.json({ status: 'success', data });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        if (err && err.isUnitRuleError) {
            return res.status(err.status || 400).json({ status: 'error', code: err.code, message: err.message });
        }
        console.error('[Unit Update Error]', err.message, err.stack);
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        client.release();
    }
};



const isDayStr = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;

// @desc    Unit history timeline (price and marketing changes). History starts when this feature was released.
// @route   GET /api/re-units/:id/events
exports.getUnitEvents = async (req, res) => {
    const tenantId = req.user?.tenant_id, branchId = req.branchId || req.user?.branch_id || null;
    if (!tenantId) return res.status(400).json({ status: 'error', message: 'Tenant context missing' });
    if (!isUuid(req.params.id)) return res.status(400).json({ status: 'error', message: 'Invalid unit ID format' });
    try {
        const unit = await db.query(
            `SELECT id FROM re_units WHERE id = $1::uuid AND tenant_id::text = $2::text
               AND ($3::text IS NULL OR status = 'Available' OR branch_id::text = $3::text OR branch_id IS NULL)`,
            [req.params.id, String(tenantId), branchId ? String(branchId) : null]);
        if (unit.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Unit not found or unauthorized' });
        const r = await db.query(
            `SELECT id, event_type, previous_data, new_data, actor_user_id, actor_snapshot, source, created_at
             FROM re_unit_events WHERE tenant_id::text = $1::text AND unit_id = $2::uuid ORDER BY created_at DESC, id DESC LIMIT 200`,
            [String(tenantId), req.params.id]);
        res.json({ status: 'success', history_starts_at_release: true, data: r.rows });
    } catch (err) {
        console.error('[Unit Events Error]', err.message);
        res.status(503).json({ status: 'error', message: 'Unit history unavailable' });
    }
};

// @desc    Dashboard price indicators for a period (Africa/Cairo days). Sale and rent are never mixed or averaged.
// @route   GET /api/re-units/price-changes?from=YYYY-MM-DD&to=YYYY-MM-DD
exports.getPriceChanges = async (req, res) => {
    const tenantId = req.user?.tenant_id, branchId = req.branchId || req.user?.branch_id || null;
    const { from, to } = req.query;
    if (!tenantId) return res.status(400).json({ status: 'error', message: 'Tenant context missing' });
    if (!isDayStr(from) || !isDayStr(to) || from > to) {
        return res.status(400).json({ status: 'error', code: 'INVALID_PERIOD', message: 'from and to must be valid YYYY-MM-DD dates with from <= to.' });
    }
    try {
        const r = await db.query(
            `SELECT e.unit_id, e.created_at, e.previous_data, e.new_data, e.actor_snapshot,
                    u.name, u.unit_number, u.project_name, u.status, u.transaction_type
             FROM re_unit_events e JOIN re_units u ON u.id = e.unit_id AND u.tenant_id::text = e.tenant_id::text
             WHERE e.tenant_id::text = $1::text AND e.event_type = 'price_changed'
               AND e.created_at >= ($2::date)::timestamp AT TIME ZONE 'Africa/Cairo'
               AND e.created_at <  (($3::date) + 1)::timestamp AT TIME ZONE 'Africa/Cairo'
               AND ($4::text IS NULL OR u.status = 'Available' OR u.branch_id::text = $4::text OR u.branch_id IS NULL)
             ORDER BY e.unit_id, e.created_at, e.id`,
            [String(tenantId), from, to, branchId ? String(branchId) : null]);
        const units = new Map();
        for (const row of r.rows) {
            const prevP = row.previous_data?.price, newP = row.new_data?.price;
            const type = row.new_data?.transaction_type || row.transaction_type || null;
            if (!units.has(row.unit_id)) units.set(row.unit_id, { unit_id: row.unit_id, name: row.name, unit_number: row.unit_number, project_name: row.project_name, transaction_type: type, changes: [] });
            const u = units.get(row.unit_id); u.transaction_type = type;
            const a = prevP == null ? null : Number(prevP), b = newP == null ? null : Number(newP);
            u.changes.push({ at: row.created_at, old_price: prevP ?? null, new_price: newP ?? null, delta: a !== null && b !== null ? b - a : null, percent: a ? ((b - a) / a) * 100 : null, by: row.actor_snapshot?.name || null });
        }
        const out = [], summary = {};
        for (const u of units.values()) {
            const first = u.changes[0], last = u.changes[u.changes.length - 1];
            const a = first.old_price == null ? null : Number(first.old_price), b = last.new_price == null ? null : Number(last.new_price);
            const net = a !== null && b !== null ? b - a : null;
            const direction = net === null ? 'unknown' : net > 0 ? 'up' : net < 0 ? 'down' : 'unchanged';
            out.push({ ...u, period_old_price: first.old_price, period_new_price: last.new_price, net_delta: net, net_percent: a ? (net / a) * 100 : null, direction });
            const k = u.transaction_type || 'unknown';
            summary[k] = summary[k] || { up: 0, down: 0, unchanged: 0, unknown: 0 };
            summary[k][direction]++;
        }
        res.json({ status: 'success', period: { from, to, timezone: 'Africa/Cairo' }, history_starts_at_release: true, summary_by_transaction_type: summary, data: out });
    } catch (err) {
        console.error('[Price Changes Error]', err.message);
        res.status(503).json({ status: 'error', message: 'Price indicators unavailable' });
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

        // 1.5 Fetch Unit Attachments/Photos
        let attachments = [];
        try {
            const attachRes = await db.query(`
                SELECT id, filename, original_name, mime_type, file_path, created_at, file_data, linked_type
                FROM attachments
                WHERE (linked_type IN ('unit', 're_unit', 'pf_unit_private'))
                  AND linked_id = $1::text
                  AND tenant_id::text = $2::text
                ORDER BY created_at DESC
            `, [id, tenant_id]);
            attachments = (attachRes.rows || []).map(r => ({
                ...r,
                source: r.linked_type === 'pf_unit_private' ? 'property_finder_stored' : undefined,
                file_path: r.file_data ? `data:${r.mime_type || 'image/png'};base64,${r.file_data}` : r.file_path
            }));
        } catch (attachErr) {
            console.warn('[Unit Attachments Fetch Warning]:', attachErr.message);
        }

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
                filtered_deals_count: filteredDeals.length,
                attachments: attachments
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

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        // Lock the unit row. Deal and contract creation lock the same row first, so a link committed
        // before this lock is visible to the checks below, and a later one waits for this transaction.
        const check = await client.query(
            `SELECT id, status, unit_number FROM re_units
              WHERE id::text = $1::text AND tenant_id::text = $2::text
                AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)
              FOR UPDATE`,
            [id, tenant_id, branch_id ? String(branch_id) : null]
        );
        if (check.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Unit not found' });
        }
        if (check.rows[0].status !== 'Available') {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: `Cannot delete a unit with status '${check.rows[0].status}'. Only Available units can be removed.` });
        }
        // Status alone is not enough: a unit released or reset after a sale still has history attached.
        const linked = await countUnitLinks(client, [check.rows[0].id], tenant_id);
        if (Object.keys(linked).length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                status: 'error',
                code: 'UNIT_HAS_LINKED_RECORDS',
                message: 'Cannot delete a unit that is linked to a deal, contract, cancellation, handover or payment record.',
                linked
            });
        }
        const hist = await client.query(`SELECT 1 FROM re_unit_events WHERE unit_id = $1::uuid AND tenant_id::text = $2::text LIMIT 1`, [check.rows[0].id, tenant_id]);
        if (hist.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ status: 'error', code: 'UNIT_HAS_HISTORY', message: 'This unit has price or marketing history. Deactivate it instead of deleting it.' });
        }
        await client.query(`DELETE FROM re_units WHERE id = $1`, [check.rows[0].id]);
        await client.query('COMMIT');
        logDelete(req, 'Unit', String(id), { unit_number: check.rows[0].unit_number });
        res.json({ status: 'success', message: 'Unit removed from inventory' });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* already closed */ }
        console.error('[Unit Delete Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Server error' });
    } finally {
        client.release();
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
            includeAllStatus: include_all === 'true' || include_all === '1',
            minScore: (req.query.min_score === undefined || Number.isNaN(parseInt(req.query.min_score))) ? undefined : parseInt(req.query.min_score)
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
    const { min_score } = req.query;
    const tenant_id = String(req.user.tenant_id);
    const branch_id = req.branchId || req.user?.branch_id || null;

    try {
        const { matchCustomersForUnit } = require('../services/reMatchingService');
        const result = await matchCustomersForUnit({
            tenantId: tenant_id,
            branchId: branch_id,
            unitId,
            minScore: min_score === undefined || min_score === '' || Number.isNaN(parseInt(min_score)) ? undefined : parseInt(min_score)
        });
        res.json({ status: 'success', data: result });
    } catch (err) {
        console.error('[Customer Match Unit Error]:', err.message);
        res.status(err.statusCode || 500).json({ status: 'error', message: err.message });
    }
};

// @desc    Get public unit showcase details and photos for customer gallery link (PUBLIC - No Auth)
// @route   GET /api/public/units/:id/gallery
// @access  Public
exports.getPublicUnitGallery = async (req, res) => {
    const { id } = req.params;
    if (!id || !isUuid(id)) {
        return res.status(400).json({ status: 'error', message: 'Invalid unit ID' });
    }

    try {
        const unitRes = await db.query(`
            SELECT
                ru.id,
                ru.name,
                ru.unit_number,
                ru.type,
                ru.floor,
                ru.area_sqm,
                ru.price,
                ru.rooms,
                ru.location,
                ru.status,
                ru.transaction_type,
                ru.tenant_id,
                COALESCE(proj.name, ru.project_name) as project_name,
                dev.name as developer_name,
                phase.name as phase_name,
                bld.name as building_name,
                t.name as company_name,
                t.logo_url as company_logo,
                t.phone as company_phone,
                t.address as company_address
            FROM re_units ru
            LEFT JOIN re_projects proj ON ru.project_id::text = proj.id::text AND proj.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_developers dev ON ru.developer_id::text = dev.id::text AND dev.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_phases phase ON ru.phase_id::text = phase.id::text AND phase.tenant_id::text = ru.tenant_id::text
            LEFT JOIN re_buildings bld ON ru.building_id::text = bld.id::text AND bld.tenant_id::text = ru.tenant_id::text
            LEFT JOIN tenants t ON ru.tenant_id::text = t.id::text
            WHERE ru.id = $1::uuid
            LIMIT 1
        `, [id]);

        if (unitRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Unit not found' });
        }

        const unit = unitRes.rows[0];

        // Fetch Attachments / Photos
        let photos = [];
        try {
            const attachRes = await db.query(`
                SELECT id, filename, original_name, mime_type, file_path, file_data, created_at
                FROM attachments
                WHERE (linked_type = 'unit' OR linked_type = 're_unit')
                  AND linked_id = $1::text AND tenant_id::text=$2::text
                ORDER BY created_at DESC
            `, [id,unit.tenant_id]);

            photos = (attachRes.rows || [])
                .filter(a => a.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(a.file_path || a.filename || ''))
                .map(r => ({
                    id: r.id,
                    original_name: r.original_name,
                    url: r.file_data ? `data:${r.mime_type || 'image/png'};base64,${r.file_data}` : r.file_path
                }));
        } catch (attachErr) {
            console.warn('[Public Gallery] Attachments fetch warning:', attachErr.message);
        }

        // Return strictly public-safe data (no CRM internal fields)
        return res.json({
            status: 'success',
            data: {
                unit: {
                    id: unit.id,
                    name: unit.name,
                    unit_number: unit.unit_number,
                    type: unit.type,
                    floor: unit.floor,
                    area_sqm: unit.area_sqm,
                    price: unit.price,
                    rooms: unit.rooms,
                    location: unit.location,
                    project_name: unit.project_name,
                    developer_name: unit.developer_name,
                    phase_name: unit.phase_name,
                    building_name: unit.building_name,
                    status: unit.status,
                    transaction_type: unit.transaction_type
                },
                company: {
                    name: unit.company_name,
                    logo_url: unit.company_logo,
                    phone: unit.company_phone,
                    address: unit.company_address
                },
                photos
            }
        });
    } catch (err) {
        console.error('[Public Gallery Error]:', err.message);
        return res.status(500).json({ status: 'error', message: 'Internal server error fetching gallery' });
    }
};

// @desc    Dispatch Public Unit Gallery Link to customer via Meta WhatsApp Business API
// @route   POST /api/re-units/:id/send-whatsapp-gallery
// @access  Private (Authenticated)
exports.sendUnitGalleryWhatsApp = async (req, res) => {
    const { id } = req.params;
    const { recipient_phone, custom_message, account_id } = req.body || {};
    const tenant_id = req.user?.tenant_id ? String(req.user.tenant_id) : null;
    const user_id = req.user?.id;

    if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'Tenant context missing' });
    }
    if (!id || !isUuid(id)) {
        return res.status(400).json({ status: 'error', message: 'Invalid unit ID' });
    }
    if (!recipient_phone || !String(recipient_phone).trim()) {
        return res.status(400).json({ status: 'error', message: 'Recipient phone number is required' });
    }

    const { normalisePhone, sendDirectTextMessage } = require('../services/whatsappService');
    const normPhone = normalisePhone(recipient_phone);
    if (!normPhone) {
        return res.status(400).json({ status: 'error', message: 'Invalid phone number format. Please ensure valid international number (e.g. +20...)' });
    }

    try {
        // 1. Fetch Unit & Tenant Info
        const unitRes = await db.query(`
            SELECT 
                ru.id, ru.name, ru.unit_number, ru.type, ru.area_sqm, ru.price, ru.location,
                COALESCE(proj.name, ru.project_name) as project_name,
                t.name as company_name,
                t.phone as company_phone
            FROM re_units ru
            LEFT JOIN re_projects proj ON ru.project_id::text = proj.id::text AND proj.tenant_id::text = ru.tenant_id::text
            LEFT JOIN tenants t ON ru.tenant_id::text = t.id::text
            WHERE ru.id = $1::uuid AND ru.tenant_id::text = $2::text
            LIMIT 1
        `, [id, tenant_id]);

        if (unitRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Unit not found or unauthorized' });
        }

        const unit = unitRes.rows[0];
        const companyName = unit.company_name || 'Tashgheel';

        // 2. Build Public Gallery URL
        let baseUrl = process.env.APP_URL || process.env.FRONTEND_URL || '';
        if (!baseUrl) {
            const host = req.get('host');
            const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
            baseUrl = `${proto}://${host}`;
        }
        baseUrl = baseUrl.replace(/\/+$/, '');
        const galleryUrl = `${baseUrl}/public/units/${unit.id}/gallery`;

        // 3. Construct Message
        const unitTitle = unit.name || unit.unit_number || 'الوحدة العقارية';
        const projectText = unit.project_name ? `\n📍 المشروع: *${unit.project_name}*` : (unit.location ? `\n📍 الموقع: *${unit.location}*` : '');
        const areaText = unit.area_sqm ? `\n📐 المساحة: *${unit.area_sqm} م²*` : '';
        const priceText = unit.price && Number(unit.price) > 0 ? `\n💰 السعر: *${Number(unit.price).toLocaleString('en-US')} ج.م*` : '';

        let messageText = 
            `مرحباً بك،\n` +
            `يسعدنا مشاركة صور وتفاصيل الوحدة: *${unitTitle}*${projectText}${areaText}${priceText}\n\n` +
            `📸 *يمكنك مشاهدة جميع صور الوحدة عالية الدقة والمعلومات عبر الرابط المباشر التالي:*\n` +
            `${galleryUrl}\n`;

        if (custom_message && custom_message.trim()) {
            messageText += `\n💬 ${custom_message.trim()}\n`;
        }

        messageText += `\nمع تحيات *${companyName}*`;

        const waMeFallbackUrl = `https://wa.me/${normPhone.replace('+', '')}?text=${encodeURIComponent(messageText)}`;

        // 4. Resolve Meta WhatsApp Account Credentials
        let senderAccount = null;
        if (account_id) {
            const accRes = await db.query(
                `SELECT id, phone_number_id, display_phone_number, access_token 
                 FROM whatsapp_accounts 
                 WHERE id::text = $1::text AND tenant_id::text = $2::text AND is_active = true LIMIT 1`,
                [account_id, tenant_id]
            );
            if (accRes.rows.length > 0) senderAccount = accRes.rows[0];
        }

        if (!senderAccount) {
            const defaultAccRes = await db.query(
                `SELECT id, phone_number_id, display_phone_number, access_token 
                 FROM whatsapp_accounts 
                 WHERE tenant_id::text = $1::text AND is_active = true 
                 ORDER BY is_default DESC, id ASC LIMIT 1`,
                [tenant_id]
            );
            if (defaultAccRes.rows.length > 0) senderAccount = defaultAccRes.rows[0];
        }

        let phoneNumberId = senderAccount?.phone_number_id || null;
        let accessToken = senderAccount?.access_token || null;
        let senderDisplayPhone = senderAccount?.display_phone_number || '';

        if (!phoneNumberId || !accessToken) {
            const settingsRes = await db.query(
                `SELECT phone_number_id, access_token, is_active 
                 FROM whatsapp_settings 
                 WHERE tenant_id::text = $1::text LIMIT 1`,
                [tenant_id]
            );
            if (settingsRes.rows.length > 0 && settingsRes.rows[0].access_token && settingsRes.rows[0].phone_number_id) {
                phoneNumberId = settingsRes.rows[0].phone_number_id;
                accessToken = settingsRes.rows[0].access_token;
                senderDisplayPhone = senderDisplayPhone || 'Connected Meta Business Number';
            }
        }

        // If credentials are not configured yet on Meta integration
        if (!phoneNumberId || !accessToken) {
            return res.json({
                status: 'fallback',
                sent_via: 'manual',
                message: 'لم يتم ربط رقم واتساب مفعل عبر Meta Business API لهذا الحساب بعد. يمكنك إرسال الرسالة فوراً عبر واتساب المباشر.',
                gallery_url: galleryUrl,
                direct_whatsapp_url: waMeFallbackUrl,
                message_text: messageText
            });
        }

        // 5. Send via Meta WhatsApp Cloud API
        const sendResult = await sendDirectTextMessage({
            branchId: req.branchId,
            tenantId: tenant_id,
            phoneNumberId,
            accessToken,
            toPhone: normPhone,
            text: messageText
        });

        if (!sendResult.success) {
            // Handle 24-hr window expiration
            if (sendResult.code === 'WINDOW_EXPIRED' || sendResult.code === 131047) {
                return res.json({
                    status: 'window_expired',
                    sent_via: 'manual',
                    message: 'نافذة خدمة العملاء (24 ساعة) مغلقة لهذا الرقم في ميتا. يمكنك إرسال الرابط فوراً بضغطة زر عبر WhatsApp Web أو تطبيق واتساب.',
                    gallery_url: galleryUrl,
                    direct_whatsapp_url: waMeFallbackUrl,
                    message_text: messageText
                });
            }

            return res.status(400).json({
                status: 'error',
                message: sendResult.error || 'فشل إرسال رسالة الواتساب عبر ميتا',
                direct_whatsapp_url: waMeFallbackUrl,
                gallery_url: galleryUrl
            });
        }

        // 6. Log Conversation & Outbound Message in CRM Inbox (so agent sees it in WhatsApp chat)
        try {
            const convUpsert = await db.query(`
                INSERT INTO whatsapp_conversations (
                    tenant_id, account_id, phone_number, contact_name, last_message_body,
                    last_message_at, last_message_direction, unread_count
                )
                VALUES ($1, $2, $3, $4, $5, NOW(), 'outbound', 0)
                ON CONFLICT (tenant_id, phone_number, account_id)
                DO UPDATE SET
                    last_message_body = EXCLUDED.last_message_body,
                    last_message_at = NOW(),
                    last_message_direction = 'outbound'
                RETURNING id
            `, [
                tenant_id,
                senderAccount?.id || null,
                normPhone,
                normPhone,
                `📸 مشاركة صور الوحدة: ${unitTitle} - ${galleryUrl}`
            ]);

            const conversationId = convUpsert.rows[0]?.id;
            if (conversationId) {
                await db.query(`
                    INSERT INTO whatsapp_messages (
                        conversation_id, tenant_id, account_id, meta_message_id,
                        direction, sender_type, sender_id, message_type, body, status, created_at
                    )
                    VALUES ($1, $2, $3, $4, 'outbound', 'agent', $5, 'text', $6, 'sent', NOW())
                    ON CONFLICT DO NOTHING
                `, [
                    conversationId,
                    tenant_id,
                    senderAccount?.id || null,
                    sendResult.messageId || `wamid.local.${Date.now()}`,
                    user_id ? Number(user_id) : null,
                    messageText
                ]);
            }
        } catch (logErr) {
            console.warn('[WhatsApp Log Warning]:', logErr.message);
        }

        return res.json({
            status: 'success',
            sent_via: 'meta_api',
            sender_phone: senderDisplayPhone,
            message: 'تم إرسال رابط ألبوم الصور بنجاح عبر واتساب المتصل بميتا!',
            message_id: sendResult.messageId,
            gallery_url: galleryUrl,
            direct_whatsapp_url: waMeFallbackUrl
        });

    } catch (err) {
        console.error('[Send Unit Gallery WhatsApp Error]:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

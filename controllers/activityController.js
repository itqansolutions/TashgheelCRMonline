const db = require('../config/db');

// Ensure activities table exists and has all required columns to prevent DB crashes.
// The activities table may have been created by dbReconciliation.js with a different schema
// (using actor_id/activity_type/title instead of user_id/action/meta). We add the missing
// columns idempotently so the controller queries always work regardless of creation order.
let activitiesTableEnsured = false;
async function ensureActivitiesTable() {
    if (activitiesTableEnsured) return;
    try {
        // Create table with legacy schema if it doesn't exist at all
        await db.query(`
            CREATE TABLE IF NOT EXISTS activities (
                id SERIAL PRIMARY KEY,
                tenant_id UUID,
                user_id INTEGER,
                entity_type VARCHAR(50) NOT NULL,
                entity_id VARCHAR(50) NOT NULL,
                action VARCHAR(100) NOT NULL,
                meta JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Backfill columns that may be missing if dbReconciliation.js created the table first
        await db.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS user_id INTEGER;`);
        await db.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS action VARCHAR(100);`);
        await db.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';`);
        await db.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS entity_id VARCHAR(255);`);
        await db.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;`);
        await db.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE;`);
        await db.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_reminder_dismissed BOOLEAN DEFAULT FALSE;`);
        await db.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS reminder_note TEXT;`);
        // Drop NOT NULL constraints added by dbReconciliation.js that block legacy INSERTs
        await db.query(`ALTER TABLE activities ALTER COLUMN activity_type DROP NOT NULL;`).catch(() => {});
        await db.query(`ALTER TABLE activities ALTER COLUMN title DROP NOT NULL;`).catch(() => {});
        await db.query(`ALTER TABLE activities ALTER COLUMN entity_type DROP NOT NULL;`).catch(() => {});
        await db.query(`ALTER TABLE activities ALTER COLUMN tenant_id DROP NOT NULL;`).catch(() => {});
        await db.query(`CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(tenant_id, entity_type, entity_id);`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_activities_due_reminders ON activities(scheduled_at) WHERE scheduled_at IS NOT NULL AND reminder_sent_at IS NULL AND is_reminder_dismissed = FALSE;`).catch(() => {});
        activitiesTableEnsured = true;
    } catch (e) {
        console.error('[Activities] Ensure table notice:', e.message);
    }
}

// --- Formatter Layer ---
const formatters = {
    'task.created': () => 'Created Task',
    'task.updated': (changes) => {
        const fields = changes?.fields_updated?.to || [];
        return fields.length ? `Updated ${fields.join(', ')}` : 'Updated Task';
    },
    'task.status_changed': (changes) => {
        const from = changes?.status?.from || 'Unknown';
        const to   = changes?.status?.to   || 'Unknown';
        return `Moved from ${from} → ${to}`;
    },
    'deal.created': () => 'Created Deal',
    'deal.updated': (changes) => {
        const fields = changes?.fields_updated?.to || [];
        return fields.length ? `Updated ${fields.join(', ')}` : 'Updated Deal';
    },
    'deal.stage_changed': (changes) => {
        const from = changes?.pipeline_stage?.from || 'Unknown';
        const to   = changes?.pipeline_stage?.to   || 'Unknown';
        return `Moved from ${from} → ${to}`;
    },
    'customer.created': () => 'Created Customer',
    'customer.updated': (changes) => {
        const fields = changes?.fields_updated?.to || [];
        return fields.length ? `Updated ${fields.join(', ')}` : 'Updated Customer';
    },
    'customer.assigned': (changes) => {
        const to = changes?.assigned_to?.to || 'Unassigned';
        return `Assigned to User ID: ${to}`;
    },

    // ── Manual Interaction Log Formatters ─────────────────────────────────
    'customer.called': (changes) => {
        const note = changes?.note?.to;
        return note ? `📞 Called — "${note}"` : '📞 Called customer';
    },
    'customer.whatsapp': (changes) => {
        const note = changes?.note?.to;
        return note ? `💬 WhatsApp — "${note}"` : '💬 Sent WhatsApp message';
    },
    'customer.meeting': (changes) => {
        const note = changes?.note?.to;
        return note ? `🤝 Meeting — "${note}"` : '🤝 Had a meeting';
    },
    'customer.email_sent': (changes) => {
        const note = changes?.note?.to;
        return note ? `📧 Email Sent — "${note}"` : '📧 Sent email';
    },
    'customer.follow_up': (changes) => {
        const note = changes?.note?.to;
        return note ? `🔔 Follow-Up — "${note}"` : '🔔 Followed up with customer';
    },
    'customer.visited': (changes) => {
        const note = changes?.note?.to;
        return note ? `🏠 Site Visit — "${note}"` : '🏠 Visited site with customer';
    },
    'customer.note': (changes) => {
        const note = changes?.note?.to;
        return note ? `📝 Note — "${note}"` : '📝 Added a note';
    },
    // ── Deal Action Formatters ──────────────────────────────────────────
    'deal.called':     (changes) => { const n = changes?.note?.to; return n ? `📞 Called — "${n}"` : '📞 Called'; },
    'deal.whatsapp':   (changes) => { const n = changes?.note?.to; return n ? `💬 WhatsApp — "${n}"` : '💬 Sent WhatsApp message'; },
    'deal.meeting':    (changes) => { const n = changes?.note?.to; return n ? `🤝 Meeting — "${n}"` : '🤝 Held a meeting'; },
    'deal.email_sent': (changes) => { const n = changes?.note?.to; return n ? `📧 Email Sent — "${n}"` : '📧 Sent email'; },
    'deal.follow_up':  (changes) => { const n = changes?.note?.to; return n ? `🔔 Follow-Up — "${n}"` : '🔔 Followed up on deal'; },
    'deal.visited':    (changes) => { const n = changes?.note?.to; return n ? `🏠 Site Visit — "${n}"` : '🏠 Site visit for deal'; },
    'deal.note':       (changes) => { const n = changes?.note?.to; return n ? `📝 Note — "${n}"` : '📝 Added a note'; },
    'deal.task':       (changes) => { const n = changes?.note?.to; return n ? `📋 Task — "${n}"` : '📋 Logged task'; },
    'deal.sla_extended': (changes) => {
        const until = changes?.sla_extended_until?.to;
        const count = changes?.extension_number?.to;
        return until ? `⏱️ SLA Extended (+48h #${count || 1}) until ${new Date(until).toLocaleString('en-GB')}` : '⏱️ SLA Extended (+48h)';
    },
    'deal.reassigned': (changes) => {
        const to = changes?.assignee_name?.to || changes?.assigned_to?.to || 'new rep';
        return `🔄 Reassigned to ${to} (fresh 48h SLA started)`;
    },
};

const formatActivity = (entity_type, action, meta) => {
    const key = `${entity_type?.toLowerCase()}.${action}`;
    const formatter = formatters[key];
    if (formatter) {
        return formatter(meta?.changes || {});
    }
    return `Performed action: ${action}`;
};

// @desc    Get activities for a specific entity
// @route   GET /api/activities/:entity_type/:entity_id
// @access  Private
exports.getActivities = async (req, res) => {
    await ensureActivitiesTable();
    const { entity_type, entity_id } = req.params;
    const tenant_id = req.user.tenant_id;
    const cleanEntityType = (entity_type || '').toLowerCase();

    // Deal permission and row-level scope authorization check
    if (cleanEntityType === 'deal') {
        const { checkDealPermission } = require('../middleware/dealPermission');
        const canView = await checkDealPermission(req.user.id, tenant_id, 'deal.view', req.user.role);
        if (!canView) {
            return res.status(403).json({
                status: 'error',
                code: 'PERMISSION_DENIED',
                message: 'Permission denied: "deal.view" is required to view deal activities.',
                required_permission: 'deal.view'
            });
        }

        const accessScopeService = require('../services/accessScopeService');
        const scope = await accessScopeService.buildScopePredicate({
            user: req.user,
            tableAlias: 'deals',
            assigneeCol: 'assigned_to',
            paramIndex: 3
        });
        let dealWhere = 'id::text = $1::text AND tenant_id::text = $2::text';
        const dealParams = [entity_id, tenant_id];
        if (scope.sql && scope.sql !== '1=1') {
            dealWhere += ` AND ${scope.sql}`;
            dealParams.push(...scope.params);
        }
        const dealChk = await db.query(`SELECT id FROM deals WHERE ${dealWhere}`, dealParams);
        if (dealChk.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized.' });
        }
    }

    // Pagination
    const limit  = parseInt(req.query.limit)  || 30;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const query = `
            SELECT a.*, u.name as user_name 
            FROM activities a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.tenant_id::text = $1::text 
              AND LOWER(a.entity_type) = LOWER($2) 
              AND a.entity_id::text   = $3::text
            ORDER BY a.created_at DESC
            LIMIT $4 OFFSET $5
        `;
        const result = await db.query(query, [tenant_id, entity_type, entity_id, limit, offset]);

        // Format data before sending to frontend
        const formattedData = result.rows.map(activity => {
            const meta = typeof activity.meta === 'string'
                ? JSON.parse(activity.meta)
                : (activity.meta || {});

            const display_user_name = activity.user_name || meta?.user_snapshot?.user_name || 'System';

            return {
                id:                    activity.id,
                action:                activity.action,
                entity_type:           activity.entity_type,
                entity_id:             activity.entity_id,
                created_at:            activity.created_at,
                user_name:             display_user_name,
                formatted_message:     formatActivity(activity.entity_type, activity.action, meta),
                meta,
                scheduled_at:          activity.scheduled_at || meta?.scheduled_at || null,
                reminder_sent_at:      activity.reminder_sent_at || meta?.reminder_sent_at || null,
                is_reminder_dismissed: Boolean(activity.is_reminder_dismissed || meta?.is_reminder_dismissed),
                reminder_note:         activity.reminder_note || meta?.reminder_note || null
            };
        });

        res.json({ status: 'success', data: formattedData });
    } catch (err) {
        console.error('[Activity API Error]', err.message, err.detail || '', err.hint || '');
        res.status(500).json({ status: 'error', message: 'Failed to fetch activities', debug: err.message });
    }
};

// @desc    Manually create an activity log entry (call log, meeting, note, etc.)
// @route   POST /api/activities/:entity_type/:entity_id
// @access  Private
exports.createActivity = async (req, res) => {
    await ensureActivitiesTable();
    const { entity_type, entity_id } = req.params;
    const { action, note, scheduled_at, reminder_note } = req.body;
    const tenant_id = req.user.tenant_id;

    // Validate action type
    const ALLOWED_MANUAL_ACTIONS = ['called', 'whatsapp', 'meeting', 'email_sent', 'follow_up', 'visited', 'note', 'task'];
    if (!action || !ALLOWED_MANUAL_ACTIONS.includes(action)) {
        return res.status(400).json({
            status: 'error',
            message: `Invalid action. Must be one of: ${ALLOWED_MANUAL_ACTIONS.join(', ')}`
        });
    }

    if (!note || note.trim() === '') {
        return res.status(400).json({
            status: 'error',
            message: 'A description/note is required for manual log entries.'
        });
    }

    let parsedScheduledAt = null;
    if (scheduled_at) {
        const dt = new Date(scheduled_at);
        if (isNaN(dt.getTime())) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid scheduled_at date.'
            });
        }
        parsedScheduledAt = dt.toISOString();
    }

    try {
        const meta = {
            user_snapshot: {
                user_id:   req.user.id,
                user_name: req.user.name || 'Unknown',
                user_role: req.user.role || 'employee'
            },
            changes: {
                note: { to: note.trim() }
            },
            is_manual: true
        };

        if (parsedScheduledAt) {
            meta.scheduled_at = parsedScheduledAt;
            if (reminder_note) meta.reminder_note = reminder_note.trim();
        }

        const cleanEntityType = (entity_type || 'customer').toLowerCase();

        // Deal permission and row-level scope check
        if (cleanEntityType === 'deal') {
            const { checkDealPermission } = require('../middleware/dealPermission');
            const allowed = await checkDealPermission(req.user.id, tenant_id, 'deal.log_activity', req.user.role);
            if (!allowed) {
                return res.status(403).json({
                    status: 'error',
                    code: 'PERMISSION_DENIED',
                    message: 'Permission denied: "deal.log_activity" is required to log activities on deals.',
                    required_permission: 'deal.log_activity'
                });
            }

            const accessScopeService = require('../services/accessScopeService');
            const scope = await accessScopeService.buildScopePredicate({
                user: req.user,
                tableAlias: 'deals',
                assigneeCol: 'assigned_to',
                paramIndex: 3
            });
            let dealWhere = 'id::text = $1::text AND tenant_id::text = $2::text';
            const dealParams = [entity_id, tenant_id];
            if (scope.sql && scope.sql !== '1=1') {
                dealWhere += ` AND ${scope.sql}`;
                dealParams.push(...scope.params);
            }
            const dealChk = await db.query(`SELECT id FROM deals WHERE ${dealWhere}`, dealParams);
            if (dealChk.rows.length === 0) {
                return res.status(404).json({ status: 'error', message: 'Deal not found or unauthorized.' });
            }
        }

        const result = await db.query(
            `INSERT INTO activities (tenant_id, user_id, entity_type, entity_id, action, meta, scheduled_at, reminder_note)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                tenant_id,
                req.user.id,
                cleanEntityType,
                String(entity_id),
                action,
                JSON.stringify(meta),
                parsedScheduledAt,
                reminder_note ? reminder_note.trim() : null
            ]
        );

        const activity = result.rows[0];
        let updatedDealStage = null;
        let updatedDealId = null;

        // Auto-transition deal to 'Site Visit' when logging a 'visited' (🏠 Site Visit) action
        if (action === 'visited') {
            try {
                let targetDeal = null;
                if (cleanEntityType === 'deal') {
                    const dRes = await db.query(
                        `SELECT id, title, pipeline_stage, custom_fields, assigned_to, assigned_team_id, branch_id
                         FROM deals WHERE id::text = $1::text AND tenant_id::text = $2::text`,
                        [entity_id, tenant_id]
                    );
                    targetDeal = dRes.rows[0] || null;
                } else if (cleanEntityType === 'customer') {
                    const dRes = await db.query(
                        `SELECT id, title, pipeline_stage, custom_fields, assigned_to, assigned_team_id, branch_id
                         FROM deals
                         WHERE client_id::text = $1::text AND tenant_id::text = $2::text
                           AND LOWER(COALESCE(pipeline_stage, '')) NOT IN ('won', 'lost', 'cancelled', 'closed', 'closed won', 'closed lost')
                         ORDER BY id DESC LIMIT 1`,
                        [entity_id, tenant_id]
                    );
                    targetDeal = dRes.rows[0] || null;
                }

                if (targetDeal) {
                    const currentStageLower = String(targetDeal.pipeline_stage || '').toLowerCase().trim();
                    const preVisitStages = ['lead', 'qualified', 'new', 'contacted', 'inquiry', ''];
                    const customFields = (targetDeal.custom_fields && typeof targetDeal.custom_fields === 'object')
                        ? { ...targetDeal.custom_fields }
                        : {};

                    if (!customFields.visit_date) {
                        customFields.visit_date = new Date().toISOString().slice(0, 16);
                    }
                    customFields.visit_notes = note.trim();
                    if (!customFields.visit_result) {
                        customFields.visit_result = 'Completed';
                    }

                    const newStage = preVisitStages.includes(currentStageLower) ? 'Site Visit' : targetDeal.pipeline_stage;
                    const newAssignee = targetDeal.assigned_to || (targetDeal.assigned_team_id ? null : req.user.id);

                    await db.query(
                        `UPDATE deals
                         SET pipeline_stage = $1,
                             custom_fields = $2::jsonb,
                             assigned_to = $3,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = $4 AND tenant_id::text = $5::text`,
                        [newStage, JSON.stringify(customFields), newAssignee, targetDeal.id, tenant_id]
                    );

                    updatedDealStage = newStage;
                    updatedDealId = targetDeal.id;

                    if (newStage !== targetDeal.pipeline_stage) {
                        const { logActivity } = require('../utils/activityLogger');
                        await logActivity(tenant_id, req.user, 'deal', targetDeal.id, 'stage_changed', {
                            pipeline_stage: { from: targetDeal.pipeline_stage, to: newStage }
                        }).catch(() => {});

                        const templateAutomationService = require('../services/templateAutomationService');
                        templateAutomationService.runTemplateAutomation({
                            tenantId: tenant_id,
                            event: 'stage_change',
                            payload: {
                                stage: newStage,
                                deal_id: targetDeal.id,
                                title: targetDeal.title,
                                assigned_to: newAssignee,
                                user_id: req.user.id,
                                branch_id: targetDeal.branch_id,
                                custom_fields: customFields
                            }
                        }).catch(err => console.error('[SiteVisit Activity Automation Error]', err.message));
                    }
                }
            } catch (stageErr) {
                console.warn('[Activity -> Site Visit Stage Sync Warning]:', stageErr.message);
            }
        }

        const formattedMessage = formatActivity(cleanEntityType, action, meta);

        res.status(201).json({
            status: 'success',
            data: {
                id:                    activity.id,
                action:                activity.action,
                entity_type:           activity.entity_type,
                entity_id:             activity.entity_id,
                created_at:            activity.created_at,
                user_name:             req.user.name || 'Unknown',
                formatted_message:     formattedMessage,
                meta,
                scheduled_at:          activity.scheduled_at || parsedScheduledAt,
                reminder_sent_at:      activity.reminder_sent_at || null,
                is_reminder_dismissed: Boolean(activity.is_reminder_dismissed),
                reminder_note:         activity.reminder_note || (reminder_note ? reminder_note.trim() : null),
                updated_deal_id:       updatedDealId,
                updated_deal_stage:    updatedDealStage
            }
        });
    } catch (err) {
        console.error('[Create Activity Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to save activity log.' });
    }
};

// @desc    Dismiss or reschedule an activity reminder
// @route   PATCH /api/activities/:id/reminder
// @access  Private
exports.updateReminder = async (req, res) => {
    await ensureActivitiesTable();
    const { id } = req.params;
    const tenant_id = req.user.tenant_id;
    const { dismiss, scheduled_at, reminder_note } = req.body;

    try {
        const existing = await db.query(
            `SELECT * FROM activities WHERE id::text = $1::text AND tenant_id::text = $2::text`,
            [id, tenant_id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Activity log not found.' });
        }

        const act = existing.rows[0];
        // Reminder changes on deals must obey the same permission and record scope as activity creation.
        if (String(act.entity_type || '').toLowerCase() === 'deal') {
            const { checkDealPermission } = require('../middleware/dealPermission');
            if (!(await checkDealPermission(req.user.id, tenant_id, 'deal.log_activity', req.user.role))) {
                return res.status(403).json({status:'error', code:'PERMISSION_DENIED', required_permission:'deal.log_activity', message:'Permission denied: "deal.log_activity" is required to update deal reminders.'});
            }
            const scope = await require('../services/accessScopeService').buildScopePredicate({user:req.user, tableAlias:'deals', assigneeCol:'assigned_to', paramIndex:3});
            const params = [act.entity_id, tenant_id];
            let where = 'id::text = $1::text AND tenant_id::text = $2::text';
            if (scope.sql && scope.sql !== '1=1') { where += ` AND ${scope.sql}`; params.push(...scope.params); }
            const deal = await db.query(`SELECT id FROM deals WHERE ${where}`, params);
            if (!deal.rows.length) return res.status(404).json({status:'error', message:'Deal not found or unauthorized.'});
        }
        const meta = typeof act.meta === 'string' ? JSON.parse(act.meta) : (act.meta || {});

        if (dismiss) {
            meta.is_reminder_dismissed = true;
            const updated = await db.query(
                `UPDATE activities 
                 SET is_reminder_dismissed = TRUE, meta = $1 
                 WHERE id::text = $2::text AND tenant_id::text = $3::text 
                 RETURNING *`,
                [JSON.stringify(meta), id, tenant_id]
            );
            return res.json({
                status: 'success',
                message: 'Reminder dismissed successfully.',
                data: {
                    id: updated.rows[0]?.id || id,
                    is_reminder_dismissed: true
                }
            });
        }

        if (scheduled_at) {
            const dt = new Date(scheduled_at);
            if (isNaN(dt.getTime())) {
                return res.status(400).json({ status: 'error', message: 'Invalid scheduled_at date.' });
            }
            const parsedScheduledAt = dt.toISOString();
            meta.scheduled_at = parsedScheduledAt;
            meta.is_reminder_dismissed = false;
            meta.reminder_sent_at = null;
            if (reminder_note !== undefined) {
                meta.reminder_note = reminder_note ? reminder_note.trim() : null;
            }

            const updated = await db.query(
                `UPDATE activities 
                 SET scheduled_at = $1, reminder_sent_at = NULL, is_reminder_dismissed = FALSE, reminder_note = $2, meta = $3 
                 WHERE id::text = $4::text AND tenant_id::text = $5::text 
                 RETURNING *`,
                [
                    parsedScheduledAt,
                    reminder_note !== undefined ? (reminder_note ? reminder_note.trim() : null) : (act.reminder_note || null),
                    JSON.stringify(meta),
                    id,
                    tenant_id
                ]
            );

            return res.json({
                status: 'success',
                message: 'Reminder rescheduled successfully.',
                data: {
                    id: updated.rows[0]?.id || id,
                    scheduled_at: updated.rows[0]?.scheduled_at || parsedScheduledAt,
                    reminder_sent_at: null,
                    is_reminder_dismissed: false,
                    reminder_note: updated.rows[0]?.reminder_note || (reminder_note ? reminder_note.trim() : null)
                }
            });
        }

        return res.status(400).json({ status: 'error', message: 'Provide either dismiss: true or a new scheduled_at date.' });
    } catch (err) {
        console.error('[Update Reminder Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to update reminder.' });
    }
};

exports.ensureActivitiesTable = ensureActivitiesTable;


// @desc    Manual deal activity counts per employee (calls, WhatsApp, meetings, ...), period in Africa/Cairo days
// @route   GET /api/activities/reports/deal-activity?from=YYYY-MM-DD&to=YYYY-MM-DD[&team_id=][&user_id=]
// @access  Private. Admin: all employees. Others: self + own departments + teams they manage/lead.
exports.getDealActivityReport = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const { from, to } = req.query;
    const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T00:00:00Z').getTime()) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
    if (!isDay(from) || !isDay(to) || from > to) {
        return res.status(400).json({ status: 'error', code: 'INVALID_PERIOD', message: 'from and to must be valid YYYY-MM-DD dates with from <= to.' });
    }
    const intOrNull = (v) => (v === undefined || v === '' ) ? null : (Number.isInteger(Number(v)) ? Number(v) : NaN);
    const teamId = intOrNull(req.query.team_id), userId = intOrNull(req.query.user_id);
    if (Number.isNaN(teamId) || Number.isNaN(userId)) {
        return res.status(400).json({ status: 'error', code: 'INVALID_FILTER', message: 'team_id and user_id must be integers.' });
    }
    try {
        const { checkDealPermission } = require('../middleware/dealPermission');
        if (!(await checkDealPermission(req.user.id, tenant_id, 'deal.view', req.user.role))) {
            return res.status(403).json({ status: 'error', code: 'PERMISSION_DENIED', message: 'Permission denied: "deal.view" is required.', required_permission: 'deal.view' });
        }
        const accessScopeService = require('../services/accessScopeService');
        const branch_id = req.branchId || req.user?.branch_id || null;
        let visible = null; // null = every employee of the tenant
        if (req.user.role !== 'admin') {
            const deptIds = (await accessScopeService.getAccessibleDepartmentIds(req.user)) || [];
            const r = await db.query(
                `SELECT DISTINCT u.id FROM users u WHERE u.tenant_id::text = $1::text AND (
                    u.id::text = $2::text
                    OR u.department_id = ANY($3::int[])
                    OR u.id IN (SELECT stm.user_id FROM sales_team_members stm JOIN sales_teams st ON st.id = stm.team_id AND st.tenant_id::text = stm.tenant_id::text
                                WHERE st.tenant_id::text = $1::text AND (st.manager_id::text = $2::text OR st.leader_id::text = $2::text)))`,
                [String(tenant_id), String(req.user.id), deptIds]);
            visible = r.rows.map(x => x.id);
        }
        const params = [String(tenant_id), from, to, branch_id, visible, userId, teamId];
        const result = await db.query(
            `SELECT u.id AS user_id, u.name AS user_name, a.action, COUNT(*)::int AS count
             FROM activities a
             JOIN users u ON u.id = a.user_id AND u.tenant_id::text = a.tenant_id::text
             JOIN deals d ON d.id::text = a.entity_id AND d.tenant_id::text = a.tenant_id::text
             WHERE a.tenant_id::text = $1::text
               AND LOWER(a.entity_type) = 'deal'
               AND a.action IN ('called','whatsapp','meeting','email_sent','follow_up','visited','note','task')
               AND (a.meta::jsonb ->> 'is_manual') = 'true'
               AND a.created_at >= ($2::date)::timestamp AT TIME ZONE 'Africa/Cairo'
               AND a.created_at <  (($3::date) + 1)::timestamp AT TIME ZONE 'Africa/Cairo'
               AND ($4::text IS NULL OR d.branch_id::text = $4::text OR d.branch_id IS NULL)
               AND ($5::int[] IS NULL OR u.id = ANY($5::int[]))
               AND ($6::int IS NULL OR u.id = $6::int)
               AND ($7::int IS NULL OR d.assigned_team_id = $7::int)
             GROUP BY u.id, u.name, a.action
             ORDER BY u.name, a.action`, params);
        const byUser = new Map();
        for (const row of result.rows) {
            if (!byUser.has(row.user_id)) byUser.set(row.user_id, { user_id: row.user_id, user_name: row.user_name, total: 0, by_action: {} });
            const u = byUser.get(row.user_id); u.by_action[row.action] = row.count; u.total += row.count;
        }
        res.json({ status: 'success', period: { from, to, timezone: 'Africa/Cairo' }, source: 'manual_logs', data: [...byUser.values()] });
    } catch (err) {
        console.error('[Deal Activity Report Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to build activity report' });
    }
};

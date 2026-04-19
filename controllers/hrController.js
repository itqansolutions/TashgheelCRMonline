const db = require('../config/db');

/**
 * HR ATTENDANCE ENGINE (Enterprise Logic)
 */

// @desc    Employee Check-in
// @route   POST /api/hr/attendance/check-in
// @access  Private
exports.checkIn = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const user_id = req.user.id;
    const ip_address = req.ip || req.connection.remoteAddress;

    try {
        await db.query('BEGIN');

        // 1. Prevent Double Check-in (Block if active session exists today)
        const activeRes = await db.query(`
            SELECT id FROM hr_attendance 
            WHERE user_id = $1 AND DATE(check_in) = CURRENT_DATE 
            FOR UPDATE
        `, [user_id]);

        if (activeRes.rows.length > 0) {
            throw new Error('Already checked in today.');
        }

        // 2. Status Engine: Late Logic (9:15 AM threshold based on Server local time for MVP)
        let status = 'present';
        let late_minutes = 0;
        const now = new Date();
        const startHour = 9;
        const startMinute = 15;
        
        // Convert to minutes for easy diff
        const currentMins = (now.getHours() * 60) + now.getMinutes();
        const startTotalMins = (startHour * 60) + startMinute;

        if (currentMins > startTotalMins) {
            status = 'late';
            late_minutes = currentMins - startTotalMins;
        }

        // 3. Register Check-In
        const insertRes = await db.query(`
            INSERT INTO hr_attendance (user_id, tenant_id, branch_id, check_in, status, late_minutes, ip_address, source)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, 'manual')
            RETURNING *
        `, [user_id, tenant_id, branch_id, status, late_minutes, ip_address]);

        await db.query('COMMIT');

        res.status(201).json({ 
            status: 'success', 
            message: late_minutes > 0 ? `Checked in late by ${late_minutes} mins.` : 'Checked in successfully.',
            data: insertRes.rows[0] 
        });

        // Phase 7 Workflow Engine: Late Employee → Escalation Check
        if (late_minutes > 0) {
            const workflowEngine = require('../services/workflowEngine');
            workflowEngine.onEmployeeLate({
                user_id,
                user_name: req.user.name || `Employee #${user_id}`,
                late_minutes,
                tenant_id,
                branch_id
            }).catch(e => console.error('[Workflow] onEmployeeLate error:', e.message));

            // Phase 3: DB-driven rules for EMPLOYEE_LATE
            const { runRules } = require('../services/ruleEngine');
            runRules('EMPLOYEE_LATE', {
                tenant_id,
                branch_id,
                user_id,
                late_minutes,
                _entity_type: 'hr_attendance',
                _entity_id: user_id,
                _summary: `${req.user.name || 'Employee'} was ${late_minutes} minutes late.`,
                _link: '/hr/attendance/admin'
            }).catch(e => console.error('[RuleEngine] EMPLOYEE_LATE error:', e.message));
        }

    } catch (err) {
        await db.query('ROLLBACK');
        console.error('Check-in Error:', err.message);
        // Note: constraint idx_unique_daily_attendance might catch race conditions natively which is great.
        res.status(400).json({ status: 'error', message: err.message });
    }
};

// @desc    Employee Check-out
// @route   POST /api/hr/attendance/check-out
// @access  Private
exports.checkOut = async (req, res) => {
    const user_id = req.user.id;

    try {
        await db.query('BEGIN');

        // 1. Ensure Open Session
        const sessionRes = await db.query(`
            SELECT * FROM hr_attendance 
            WHERE user_id = $1 AND DATE(check_in) = CURRENT_DATE AND check_out IS NULL
            FOR UPDATE
        `, [user_id]);

        if (sessionRes.rows.length === 0) {
            throw new Error('No active open session to check out from.');
        }

        const session = sessionRes.rows[0];

        // 2. Calculate runtime Working Hours (Bulletproof Logic)
        const checkInDate = new Date(session.check_in);
        const checkOutDate = new Date();
        const diffMs = checkOutDate.getTime() - checkInDate.getTime();
        
        // work_hours in decimal (e.g., 8.5 hours)
        const work_hours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

        // 3. Log Check-Out & Hours
        const updateRes = await db.query(`
            UPDATE hr_attendance 
            SET check_out = CURRENT_TIMESTAMP, work_hours = $1 
            WHERE id = $2 
            RETURNING *
        `, [work_hours, session.id]);

        await db.query('COMMIT');

        res.status(200).json({ 
            status: 'success', 
            message: `Checked out successfully. Logged ${work_hours} hours.`,
            data: updateRes.rows[0] 
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error('Check-out Error:', err.message);
        res.status(400).json({ status: 'error', message: err.message });
    }
};

// @desc    Get Current User's Attendance Log
// @route   GET /api/hr/attendance/my
// @access  Private
exports.getMyAttendance = async (req, res) => {
    const user_id = req.user.id;
    // We only fetch for the current active branch context to maintain strict layout
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId; 

    try {
        const result = await db.query(`
            SELECT * FROM hr_attendance 
            WHERE user_id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text
            ORDER BY check_in DESC
            LIMIT 30
        `, [user_id, tenant_id, branch_id]);

        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('getMyAttendance Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve attendance logs.' });
    }
};

// @desc    Admin/Manager View of Branch Attendance
// @route   GET /api/hr/attendance
// @access  Private (Admin/Manager)
exports.getStaffAttendance = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        const result = await db.query(`
            SELECT h.*, u.name as employee_name, u.email as employee_email
            FROM hr_attendance h
            JOIN users u ON h.user_id = u.id
            WHERE h.tenant_id::text = $1::text AND h.branch_id::text = $2::text
            ORDER BY h.check_in DESC
            LIMIT 100
        `, [tenant_id, branch_id]);

        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('getStaffAttendance Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve branch attendance.' });
    }
};

/**
 * HR OPERATIONS ENGINE (Phase 2: Leaves, Requests)
 */

// @desc    Submit new leave request
// @route   POST /api/hr/leaves
// @access  Private
exports.submitLeave = async (req, res) => {
    const user_id = req.user.id;
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const { type, start_date, end_date, reason } = req.body;

    try {
        await db.query('BEGIN');

        // Security Guard: No Retroactive Leaves
        const today = new Date().toISOString().split('T')[0];
        if (start_date < today) {
            throw new Error('Security Guard: Cannot apply for retroactive leave (past dates are blocked).');
        }

        // 1. Leave Conflict Detection Engine (Game Changer Feature)
        // Ensure the employee does not have an overlapping leave that is pending/approved
        const conflictRes = await db.query(`
            SELECT id, status, start_date, end_date FROM hr_leaves
            WHERE user_id = $1 AND status != 'rejected'
            AND (start_date <= $3 AND end_date >= $2)
            FOR UPDATE
        `, [user_id, start_date, end_date]);

        if (conflictRes.rows.length > 0) {
            throw new Error('Conflict Detective: You already have an active leave request during this period.');
        }

        // 2. Calculate Days
        const d1 = new Date(start_date);
        const d2 = new Date(end_date);
        const diffTime = Math.abs(d2 - d1);
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive

        if (days <= 0) throw new Error('Invalid date range.');

        // 3. Insert Leave
        const insertRes = await db.query(`
            INSERT INTO hr_leaves (user_id, tenant_id, branch_id, type, start_date, end_date, days, reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
        `, [user_id, tenant_id, branch_id, type, start_date, end_date, days, reason]);

        await db.query('COMMIT');

        res.status(201).json({ status: 'success', message: 'Leave request submitted successfully.', data: insertRes.rows[0] });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error('submitLeave Error:', err.message);
        res.status(400).json({ status: 'error', message: err.message });
    }
};

// @desc    Update Leave Status (Manager)
// @route   PUT /api/hr/leaves/:id/status
// @access  Private (Admin/Manager)
exports.updateLeaveStatus = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const approved_by = req.user.id;
    const leave_id = req.params.id;
    const { status } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ status: 'error', message: 'Invalid status' });
    }

    try {
        const updateRes = await db.query(`
            UPDATE hr_leaves 
            SET status = $1, approved_by = $2
            WHERE id = $3 AND tenant_id::text = $4::text AND branch_id::text = $5::text
            RETURNING *
        `, [status, approved_by, leave_id, tenant_id, branch_id]);

        if (updateRes.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Leave request not found or unauthorized' });

        // Phase 2 Enterprise Request: Audit Logging
        const { logAction, ACTIONS } = require('../services/loggerService');
        const actionType = status === 'approved' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED';
        logAction({ req, action: actionType, entityType: 'Leave', entityId: leave_id, details: { status } });

        res.json({ status: 'success', message: `Leave marked as ${status}`, data: updateRes.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ status: 'error', message: 'Failed to update leave status.' });
    }
};

// @desc    Get My Leaves
// @route   GET /api/hr/leaves/my
// @access  Private
exports.getMyLeaves = async (req, res) => {
    const user_id = req.user.id;
    try {
        const result = await db.query(`SELECT * FROM hr_leaves WHERE user_id = $1 ORDER BY created_at DESC`, [user_id]);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to retrieve leaves.' });
    }
};

// @desc    Get All Leaves (Manager)
// @route   GET /api/hr/leaves
// @access  Private (Admin/Manager)
exports.getAllLeaves = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    try {
        const result = await db.query(`
            SELECT l.*, u.name as employee_name
            FROM hr_leaves l
            JOIN users u ON l.user_id = u.id
            WHERE l.tenant_id::text = $1::text AND l.branch_id::text = $2::text
            ORDER BY l.created_at DESC
        `, [tenant_id, branch_id]);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to retrieve leaves.' });
    }
};

/**
 * HR PAYROLL ENGINE (Phase 3: The Calculation Layer)
 */

// @desc    Generate Draft Payroll for a particular Month/Year
// @route   POST /api/hr/payroll/generate
// @access  Private (Admin/Manager)
exports.generatePayroll = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;
    const { month, year, user_id } = req.body;

    try {
        await db.query('BEGIN');

        // 1. Fetch Employee Profile
        const profileRes = await db.query(`SELECT * FROM hr_profiles WHERE user_id = $1 AND tenant_id::text = $2::text`, [user_id, tenant_id]);
        if (profileRes.rows.length === 0) throw new Error('Employee profile not found or unauthorized.');
        
        const profile = profileRes.rows[0];
        const base_salary = parseFloat(profile.salary) || 0;

        // Ensure payroll for this month doesn't already exist
        const existRes = await db.query(`
            SELECT id FROM hr_payroll WHERE user_id = $1 AND payroll_month = $2 AND payroll_year = $3
        `, [user_id, month, year]);
        
        if (existRes.rows.length > 0) throw new Error(`Payroll for ${month}/${year} already exists for this employee.`);

        // 2. Calculate Attendance (Late penalties, Work hours)
        const attRes = await db.query(`
            SELECT SUM(work_hours) as total_hours, SUM(late_minutes) as total_late_minutes
            FROM hr_attendance
            WHERE user_id = $1 AND EXTRACT(MONTH FROM check_in) = $2 AND EXTRACT(YEAR FROM check_in) = $3
        `, [user_id, month, year]);

        const total_work_hours = parseFloat(attRes.rows[0].total_hours) || 0;
        const total_late_minutes = parseInt(attRes.rows[0].total_late_minutes) || 0;

        // Penalty calculations
        const hourly_rate = base_salary / 160;
        const minute_rate = hourly_rate / 60;
        let penalty_amount = parseFloat((total_late_minutes * minute_rate).toFixed(2));

        // 3. Unpaid Leaves logic
        const leavesRes = await db.query(`
            SELECT SUM(days) as unpaid_days
            FROM hr_leaves 
            WHERE user_id = $1 AND type = 'unpaid' AND status = 'approved'
            AND EXTRACT(MONTH FROM start_date) = $2 AND EXTRACT(YEAR FROM start_date) = $3
        `, [user_id, month, year]);

        const unpaid_days = parseInt(leavesRes.rows[0].unpaid_days) || 0;
        const daily_rate = base_salary / 22; 
        const leave_deduction = parseFloat((unpaid_days * daily_rate).toFixed(2));

        const total_deductions = penalty_amount + leave_deduction;

        // 4. Final Net Salary Calculation
        const net_salary = base_salary - total_deductions;

        // 5. Insert Core Payroll
        const payRes = await db.query(`
            INSERT INTO hr_payroll (user_id, tenant_id, branch_id, payroll_month, payroll_year, base_salary, total_work_hours, deduction_amount, net_salary, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft') RETURNING *
        `, [user_id, tenant_id, branch_id, month, year, base_salary, total_work_hours, total_deductions, net_salary]);

        const payroll_id = payRes.rows[0].id;

        // 6. Insert Payroll Tracing Layout (hr_payroll_items)
        if (penalty_amount > 0) {
            await db.query(`INSERT INTO hr_payroll_items (payroll_id, type, amount, description) VALUES ($1, 'penalty_late', $2, $3)`, [payroll_id, -penalty_amount, `${total_late_minutes} Mins Late`]);
        }
        if (leave_deduction > 0) {
            await db.query(`INSERT INTO hr_payroll_items (payroll_id, type, amount, description) VALUES ($1, 'leave_unpaid', $2, $3)`, [payroll_id, -leave_deduction, `${unpaid_days} Days Unpaid Leave`]);
        }

        await db.query('COMMIT');

        res.status(201).json({ status: 'success', message: 'Payroll Engine computed successfully (Draft).', data: payRes.rows[0] });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error('generatePayroll Error:', err.message);
        res.status(400).json({ status: 'error', message: err.message });
    }
};

// @desc    Get All Payroll Slips
// @route   GET /api/hr/payroll
// @access  Private (Admin/Manager)
exports.getPayrolls = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId;

    try {
        const result = await db.query(`
            SELECT p.*, u.name as employee_name, (SELECT json_agg(i.*) FROM hr_payroll_items i WHERE i.payroll_id = p.id) as details
            FROM hr_payroll p
            JOIN users u ON p.user_id = u.id
            WHERE p.tenant_id::text = $1::text AND p.branch_id::text = $2::text
            ORDER BY p.payroll_year DESC, p.payroll_month DESC
        `, [tenant_id, branch_id]);

        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to retrieve payrolls.' });
    }
};

// @desc    Finalize Payroll
// @route   PUT /api/hr/payroll/:id/finalize
// @access  Private (Admin/Manager)
exports.finalizePayroll = async (req, res) => {
    const payroll_id = req.params.id;
    const tenant_id = req.user.tenant_id;
    try {
        const result = await db.query(`
            UPDATE hr_payroll SET status = 'finalized'
            WHERE id = $1 AND tenant_id::text = $2::text AND status = 'draft'
            RETURNING *
        `, [payroll_id, tenant_id]);

        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Payroll not found or it is already locked.' });
        res.json({ status: 'success', message: 'Payroll has been finalized and Locked.', data: result.rows[0] });
    } catch(err) {
        res.status(500).json({ status: 'error', message: 'Failed to finalize payroll.' });
    }
};

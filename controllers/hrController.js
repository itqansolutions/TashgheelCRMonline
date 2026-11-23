const db = require('../config/db');

/**
 * HR ATTENDANCE ENGINE (Enterprise Logic)
 */

// @desc    Employee Check-in
// @route   POST /api/hr/attendance/check-in
// @access  Private
const attendanceService = require('../services/attendanceService');
exports.checkIn = async (req, res) => {
    try {
        const { row } = await attendanceService.transact({tenant:req.user.tenant_id,branch:req.branchId,user:req.user.id,mode:'in',ip:req.ip || req.connection?.remoteAddress});
        res.status(201).json({status:'success',message:'Checked in successfully.',data:row});
        const {late_minutes}=row;
        const user_id=req.user.id, tenant_id=req.user.tenant_id, branch_id=req.branchId;
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

    } catch (err) { if (!res.headersSent) res.status(err.status || 400).json({status:'error',message:err.message}); }
};
exports.checkOut = async (req,res) => {
    try {
        const {row}=await attendanceService.transact({tenant:req.user.tenant_id,branch:req.branchId,user:req.user.id,mode:'out'});
        res.json({status:'success',message:'Checked out successfully.',data:row});
    } catch(err) {res.status(err.status || 400).json({status:'error',message:err.message});}
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
            SELECT *, attendance_date::text AS attendance_date FROM hr_attendance
            WHERE user_id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text
            ORDER BY check_in DESC
            LIMIT 30
        `, [user_id, tenant_id, branch_id]);

        const timezone = await attendanceService.timezoneFor(db, tenant_id, branch_id);
        const today = attendanceService.localParts(new Date(), timezone).day;
        const current = result.rows.filter(row => (row.attendance_date ? String(row.attendance_date instanceof Date ? row.attendance_date.toISOString().slice(0,10) : row.attendance_date).slice(0,10) : attendanceService.localParts(new Date(row.check_in),timezone).day) === today);
        const session_state = current.length > 1 ? 'conflict' : current.length ? (current[0].check_out ? 'completed' : 'checked_in') : 'none';
        res.json({status:'success',data:result.rows,meta:{timezone,today,session_state}});
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

    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
    if (!validDate(start_date) || !validDate(end_date) || end_date < start_date) {
        return res.status(400).json({ status: 'error', message: 'Provide valid leave dates with end date on or after start date.' });
    }
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
        const diffTime = d2 - d1;
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

    const payrollMonth = Number(month), payrollYear = Number(year);
    if (!['string','number'].includes(typeof month) || !['string','number'].includes(typeof year) || !Number.isInteger(payrollMonth) || payrollMonth < 1 || payrollMonth > 12 || !Number.isInteger(payrollYear) || payrollYear < 1900 || payrollYear > 9999 || !user_id) {
        return res.status(400).json({status:'error', message:'Valid employee, month (1-12) and year are required.'});
    }
    let client;
    try {
        client = await db.pool.connect();
        await client.query('BEGIN');
        const employee = await client.query(`SELECT id FROM users WHERE id = $1 AND tenant_id::text = $2::text
            AND branch_id::text = $3::text FOR UPDATE`, [user_id, tenant_id, branch_id]);
        if (!employee.rows.length) throw new Error('Employee not found in this tenant and branch.');

        // 1. Fetch Employee Profile
        const profileRes = await client.query(`SELECT * FROM hr_profiles WHERE user_id = $1 AND tenant_id::text = $2::text`, [user_id, tenant_id]);
        if (profileRes.rows.length === 0) throw new Error('Employee profile not found or unauthorized.');

        const profile = profileRes.rows[0];
        const base_salary = parseFloat(profile.salary) || 0;

        // Ensure payroll for this month doesn't already exist
        const existRes = await client.query(`
            SELECT id FROM hr_payroll WHERE user_id = $1 AND payroll_month = $2 AND payroll_year = $3 AND tenant_id::text = $4::text
        `, [user_id, payrollMonth, payrollYear, tenant_id]);

        if (existRes.rows.length > 0) throw new Error(`Payroll for ${month}/${year} already exists for this employee.`);

        // 2. Calculate Attendance (Late penalties, Work hours)
        const attRes = await client.query(`
            SELECT SUM(work_hours) as total_hours, SUM(late_minutes) as total_late_minutes
            FROM hr_attendance
            WHERE user_id = $1 AND EXTRACT(MONTH FROM check_in) = $2 AND EXTRACT(YEAR FROM check_in) = $3 AND tenant_id::text = $4::text AND branch_id::text = $5::text
        `, [user_id, payrollMonth, payrollYear, tenant_id, branch_id]);

        const total_work_hours = parseFloat(attRes.rows[0].total_hours) || 0;
        const total_late_minutes = parseInt(attRes.rows[0].total_late_minutes) || 0;

        // Penalty calculations
        const hourly_rate = base_salary / 160;
        const minute_rate = hourly_rate / 60;
        let penalty_amount = parseFloat((total_late_minutes * minute_rate).toFixed(2));

        // 3. Unpaid Leaves logic
        const leavesRes = await client.query(`
            SELECT COALESCE(SUM(LEAST(end_date, (make_date($3::int,$2::int,1) + INTERVAL '1 month - 1 day')::date)
                - GREATEST(start_date, make_date($3::int,$2::int,1)) + 1),0) as unpaid_days
            FROM hr_leaves WHERE user_id = $1 AND type = 'unpaid' AND status = 'approved'
              AND tenant_id::text = $4::text AND branch_id::text = $5::text
              AND start_date < make_date($3::int,$2::int,1) + INTERVAL '1 month'
              AND end_date >= make_date($3::int,$2::int,1)
        `, [user_id, payrollMonth, payrollYear, tenant_id, branch_id]);

        const unpaid_days = parseInt(leavesRes.rows[0].unpaid_days) || 0;
        const daily_rate = base_salary / 22;
        const leave_deduction = parseFloat((unpaid_days * daily_rate).toFixed(2));

        const total_deductions = penalty_amount + leave_deduction;

        // 4. Final Net Salary Calculation
        const net_salary = base_salary - total_deductions;

        // 5. Insert Core Payroll
        const payRes = await client.query(`
            INSERT INTO hr_payroll (user_id, tenant_id, branch_id, payroll_month, payroll_year, base_salary, total_work_hours, deduction_amount, net_salary, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft') RETURNING *
        `, [user_id, tenant_id, branch_id, payrollMonth, payrollYear, base_salary, total_work_hours, total_deductions, net_salary]);

        const payroll_id = payRes.rows[0].id;

        // 6. Insert Payroll Tracing Layout (hr_payroll_items)
        if (penalty_amount > 0) {
            await client.query(`INSERT INTO hr_payroll_items (payroll_id, type, amount, description) VALUES ($1, 'penalty_late', $2, $3)`, [payroll_id, -penalty_amount, `${total_late_minutes} Mins Late`]);
        }
        if (leave_deduction > 0) {
            await client.query(`INSERT INTO hr_payroll_items (payroll_id, type, amount, description) VALUES ($1, 'leave_unpaid', $2, $3)`, [payroll_id, -leave_deduction, `${unpaid_days} Days Unpaid Leave`]);
        }

        await client.query('COMMIT');

        res.status(201).json({ status: 'success', message: 'Payroll Engine computed successfully (Draft).', data: payRes.rows[0] });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('generatePayroll Error:', err.message);
        res.status(400).json({ status: 'error', message: err.message });
    } finally {
        if (client) client.release();
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
            WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text AND status = 'draft'
            RETURNING *
        `, [payroll_id, tenant_id, req.branchId]);

        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Payroll not found or it is already locked.' });
        res.json({ status: 'success', message: 'Payroll has been finalized and Locked.', data: result.rows[0] });
    } catch(err) {
        res.status(500).json({ status: 'error', message: 'Failed to finalize payroll.' });
    }
};

// @desc    Get Current User's Payroll Slips (Employee Self-Service)
// @route   GET /api/hr/payroll/my
// @access  Private (All Authenticated Employees)
exports.getMyPayrolls = async (req, res) => {
    const user_id = req.user.id;
    const tenant_id = req.user.tenant_id;

    try {
        const result = await db.query(`
            SELECT p.*, u.name as employee_name,
                   (SELECT json_agg(i.*) FROM hr_payroll_items i WHERE i.payroll_id = p.id) as details
            FROM hr_payroll p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id = $1 AND p.tenant_id::text = $2::text
            ORDER BY p.payroll_year DESC, p.payroll_month DESC
        `, [user_id, tenant_id]);

        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('getMyPayrolls Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve your payroll slips.' });
    }
};

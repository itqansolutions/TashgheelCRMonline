const db = require('../config/db');
const notificationService = require('../services/notificationService');
const { logCreate, logUpdate, logDelete } = require('../services/loggerService');
const { logActivity } = require('../utils/activityLogger');

// @desc    Get all tasks
// @route   GET /api/tasks
// @access  Private
exports.getTasks = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const branch_id = req.branchId || req.user?.branch_id;

    let query = `
      SELECT t.*, 
             ts.name as status_name,
             ts.can_make_deal,
             ts.color as status_color,
             u1.name as in_charge_name, 
             u2.name as director_name, 
             u3.name as creator_name,
             COALESCE((
               SELECT json_agg(json_build_object('user_id', tf.user_id, 'name', u.name))
               FROM task_followers tf
               JOIN users u ON tf.user_id = u.id
               WHERE tf.task_id = t.id
             ), '[]'::json) as followers
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.director_id = u2.id
      LEFT JOIN users u3 ON t.created_by = u3.id
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.tenant_id::text = $1::text AND t.branch_id::text = $2::text
    `;

    // Fallback query (no task_statuses join) used if table doesn't exist yet
    let fallbackQuery = `
      SELECT t.*,
             NULL as status_name,
             false as can_make_deal,
             NULL as status_color,
             u1.name as in_charge_name, 
             u2.name as director_name, 
             u3.name as creator_name,
             COALESCE((
               SELECT json_agg(json_build_object('user_id', tf.user_id, 'name', u.name))
               FROM task_followers tf
               JOIN users u ON tf.user_id = u.id
               WHERE tf.task_id = t.id
             ), '[]'::json) as followers
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.director_id = u2.id
      LEFT JOIN users u3 ON t.created_by = u3.id
      WHERE t.tenant_id::text = $1::text AND t.branch_id::text = $2::text
    `;

    const queryParams = [tenant_id, branch_id];

    if (userRole === 'admin') {
      // Admin sees ALL tasks in the tenant/branch - no extra filter needed
    } else if (userRole === 'manager') {
      const managerFilter = ` 
        AND (t.assigned_to = $3 
             OR t.director_id = $3 
             OR t.created_by = $3
             OR t.assigned_to IN (SELECT id FROM users WHERE manager_id = $3 AND tenant_id::text = $1::text)
             OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id = t.id AND tf.user_id = $3))
      `;
      query += managerFilter;
      fallbackQuery += managerFilter;
      queryParams.push(userId);
    } else {
      const employeeFilter = ` 
        AND (t.assigned_to = $3 
             OR t.director_id = $3 
             OR t.created_by = $3 
             OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id = t.id AND tf.user_id = $3))
      `;
      query += employeeFilter;
      fallbackQuery += employeeFilter;
      queryParams.push(userId);
    }

    query += ` ORDER BY t.due_date ASC NULLS LAST`;
    fallbackQuery += ` ORDER BY t.due_date ASC NULLS LAST`;

    let result;
    try {
      result = await db.query(query, queryParams);
    } catch (joinErr) {
      // task_statuses table not migrated yet — degrade gracefully
      if (joinErr.message && joinErr.message.includes('task_statuses')) {
        console.warn('[Tasks] task_statuses not yet migrated, using fallback query.');
        result = await db.query(fallbackQuery, queryParams);
      } else {
        throw joinErr; // re-throw unrelated errors
      }
    }

    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error('getTasks Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error retrieving tasks' });
  }
};


// @desc    Get single task
// @route   GET /api/tasks/:id
// @access  Private
exports.getTaskById = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const result = await db.query(`
      SELECT t.*, 
             ts.name as status_name,
             ts.can_make_deal,
             ts.color as status_color,
             u1.name as in_charge_name, 
             u2.name as director_name, 
             u3.name as creator_name,
             COALESCE((
               SELECT json_agg(json_build_object('user_id', tf.user_id, 'name', u.name))
               FROM task_followers tf
               JOIN users u ON tf.user_id = u.id
               WHERE tf.task_id = t.id
             ), '[]'::json) as followers
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.director_id = u2.id
      LEFT JOIN users u3 ON t.created_by = u3.id
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.id = $1 AND t.tenant_id::text = $2::text AND t.branch_id::text = $3::text
    `, [req.params.id, tenant_id, req.branchId || req.user?.branch_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Task not found or unauthorized' });
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('getTaskById Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Create task
// @route   POST /api/tasks
// @access  Private
exports.createTask = async (req, res) => {
  const { title, description, priority, status, status_id, assigned_to, director_id, follower_ids, parent_type, parent_id, due_date } = req.body;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    const result = await client.query(
      'INSERT INTO tasks (title, description, priority, status, status_id, assigned_to, director_id, created_by, parent_type, parent_id, due_date, tenant_id, branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *',
      [title, description, priority || 'medium', status || 'todo', status_id || null, assigned_to || null, director_id || null, req.user.id, parent_type, parent_id, due_date || null, tenant_id, branch_id]
    );

    const taskId = result.rows[0].id;

    if (follower_ids && Array.isArray(follower_ids)) {
      for (const userId of follower_ids) {
        await client.query('INSERT INTO task_followers (task_id, user_id) VALUES ($1, $2)', [taskId, userId]);
      }
    }

    await client.query('COMMIT');

    // Trigger Notification for Assignee
    if (assigned_to && assigned_to !== req.user.id) {
        notificationService.notify({
            user_id: assigned_to,
            tenant_id: tenant_id,
            branch_id: branch_id,
            type: 'info',
            title: 'New Task Assigned',
            message: `You have been assigned a new task: ${title}`,
            link: '/tasks'
        });
    }

    // Audit Logging
    logCreate(req, 'Task', result.rows[0].id, result.rows[0]);

    // Activity Timeline Logging
    await logActivity(tenant_id, req.user, 'task', taskId, 'created', { 
        title: { to: title } 
    });

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createTask Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error creating task' });
  } finally {
    client.release();
  }
};

// @desc    Update task
// @route   PUT /api/tasks/:id
// @access  Private
exports.updateTask = async (req, res) => {
  const { title, description, priority, status, status_id, assigned_to, director_id, follower_ids, parent_type, parent_id, due_date } = req.body;
  const tenant_id = req.user.tenant_id;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Verify task belongs to tenant
    const branch_id = req.branchId || req.user?.branch_id;

    const verifyResult = await client.query('SELECT id, status_id FROM tasks WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text', [req.params.id, tenant_id, branch_id]);
    if (verifyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ status: 'error', message: 'Task not found or unauthorized' });
    }

    const result = await client.query(
      'UPDATE tasks SET title = $1, description = $2, priority = $3, status = $4, status_id = $5, assigned_to = $6, director_id = $7, parent_type = $8, parent_id = $9, due_date = $10, updated_at = CURRENT_TIMESTAMP WHERE id = $11 AND tenant_id::text = $12::text AND branch_id::text = $13::text RETURNING *',
      [title, description, priority, status, status_id || null, assigned_to || null, director_id || null, parent_type, parent_id, due_date || null, req.params.id, tenant_id, branch_id]
    );

    // Update followers: Delete then Insert (simple sync)
    await client.query('DELETE FROM task_followers WHERE task_id = $1', [req.params.id]);
    if (follower_ids && Array.isArray(follower_ids)) {
      for (const userId of follower_ids) {
        await client.query('INSERT INTO task_followers (task_id, user_id) VALUES ($1, $2)', [req.params.id, userId]);
      }
    }

    await client.query('COMMIT');

    // Detect status change for specific activity logging
    if (req.body.status_id && req.body.status_id !== verifyResult.rows[0].status_id) {
        await logActivity(tenant_id, req.user, 'task', req.params.id, 'status_changed', { 
            status_id: { from: verifyResult.rows[0].status_id, to: req.body.status_id },
            status: { to: req.body.status }
        });
    } else {
        await logActivity(tenant_id, req.user, 'task', req.params.id, 'updated', { 
            fields_updated: { to: Object.keys(req.body) } 
        });
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateTask Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error updating task' });
  } finally {
    client.release();
  }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
// @access  Private
exports.deleteTask = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const branch_id = req.branchId || req.user?.branch_id;
    const result = await db.query('DELETE FROM tasks WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text RETURNING *', [req.params.id, tenant_id, branch_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Task not found or unauthorized' });
    }
    res.json({ status: 'success', message: 'Task deleted' });
  } catch (err) {
    console.error('deleteTask Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error deleting task' });
  }
};

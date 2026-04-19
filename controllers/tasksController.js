const db = require('../config/db');
const { sendNotification } = require('../services/notificationService');

// @desc    Get all tasks
// @route   GET /api/tasks
// @access  Private
exports.getTasks = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    let query = `
      SELECT t.*, 
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
      WHERE t.tenant_id::text = $1::text
    `;

    const queryParams = [tenant_id];
    
    if (!isAdmin) {
      // User sees tasks they are In Charge of, Director of, Creator of, or following within their tenant
      query += ` 
        AND (t.assigned_to = $2 
             OR t.director_id = $2 
             OR t.created_by = $2 
             OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id = t.id AND tf.user_id = $2))
      `;
      queryParams.push(userId);
    }

    query += ` ORDER BY t.due_date ASC NULLS LAST`;

    const result = await db.query(query, queryParams);
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
      WHERE t.id = $1 AND t.tenant_id::text = $2::text
    `, [req.params.id, tenant_id]);

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
  const { title, description, priority, status, assigned_to, director_id, follower_ids, parent_type, parent_id, due_date } = req.body;
  const tenant_id = req.user.tenant_id;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    const result = await client.query(
      'INSERT INTO tasks (title, description, priority, status, assigned_to, director_id, created_by, parent_type, parent_id, due_date, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
      [title, description, priority || 'medium', status || 'todo', assigned_to || null, director_id || null, req.user.id, parent_type, parent_id, due_date || null, tenant_id]
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
        sendNotification({
            userId: assigned_to,
            tenantId: tenant_id,
            type: 'info',
            title: 'New Task Assigned',
            message: `You have been assigned a new task: ${title}`,
            link: '/tasks'
        });
    }

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
  const { title, description, priority, status, assigned_to, director_id, follower_ids, parent_type, parent_id, due_date } = req.body;
  const tenant_id = req.user.tenant_id;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Verify task belongs to tenant
    const verifyResult = await client.query('SELECT id FROM tasks WHERE id = $1 AND tenant_id::text = $2::text', [req.params.id, tenant_id]);
    if (verifyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ status: 'error', message: 'Task not found or unauthorized' });
    }

    const result = await client.query(
      'UPDATE tasks SET title = $1, description = $2, priority = $3, status = $4, assigned_to = $5, director_id = $6, parent_type = $7, parent_id = $8, due_date = $9, updated_at = CURRENT_TIMESTAMP WHERE id = $10 AND tenant_id::text = $11::text RETURNING *',
      [title, description, priority, status, assigned_to || null, director_id || null, parent_type, parent_id, due_date || null, req.params.id, tenant_id]
    );

    // Update followers: Delete then Insert (simple sync)
    await client.query('DELETE FROM task_followers WHERE task_id = $1', [req.params.id]);
    if (follower_ids && Array.isArray(follower_ids)) {
      for (const userId of follower_ids) {
        await client.query('INSERT INTO task_followers (task_id, user_id) VALUES ($1, $2)', [req.params.id, userId]);
      }
    }

    await client.query('COMMIT');
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
    const result = await db.query('DELETE FROM tasks WHERE id = $1 AND tenant_id::text = $2::text RETURNING *', [req.params.id, tenant_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Task not found or unauthorized' });
    }
    res.json({ status: 'success', message: 'Task deleted' });
  } catch (err) {
    console.error('deleteTask Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error deleting task' });
  }
};

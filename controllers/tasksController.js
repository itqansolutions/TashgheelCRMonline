const db = require('../config/db');
const accessScopeService = require('../services/accessScopeService');
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
    } else if (userRole === 'manager' || userRole === 'supervisor') {
      const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
      queryParams.push(userId); // $3
      let deptFilter = '';
      if (accessibleDeptIds && accessibleDeptIds.length > 0) {
        queryParams.push(accessibleDeptIds); // $4
        deptFilter = `OR t.assigned_to IN (SELECT id FROM users WHERE department_id = ANY($4::int[]) AND tenant_id::text = $1::text)`;
      }
      const managerFilter = ` 
        AND (t.assigned_to = $3 
             OR t.director_id = $3 
             OR t.created_by = $3
             OR t.assigned_to IN (SELECT id FROM users WHERE manager_id = $3 AND tenant_id::text = $1::text)
             ${deptFilter}
             OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id = t.id AND tf.user_id = $3))
      `;
      query += managerFilter;
      fallbackQuery += managerFilter;
    } else {
      queryParams.push(userId); // $3
      const employeeFilter = ` 
        AND (t.assigned_to = $3 
             OR t.director_id = $3 
             OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id = t.id AND tf.user_id = $3))
      `;
      query += employeeFilter;
      fallbackQuery += employeeFilter;
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

    let taskAssignedEvent = null;
    if (assigned_to && String(assigned_to) !== String(req.user.id)) {
      const DomainEvent = require('../src/infrastructure/events/DomainEvent');
      const outboxService = require('../src/infrastructure/events/OutboxService');
      taskAssignedEvent = new DomainEvent({
        eventName: 'task.assigned',
        tenantId: tenant_id,
        branchId: branch_id,
        aggregateType: 'Task',
        aggregateId: taskId,
        payload: {
          taskId,
          taskTitle: title,
          dueDate: due_date || null,
          priority: priority || 'medium',
          assignedTo: assigned_to,
          assignedByUserId: req.user.id,
          assignedByName: req.user.name,
          assignedAt: result.rows[0].created_at || new Date().toISOString()
        },
        actorId: req.user.id
      });

      // Stage atomically in outbox inside same database transaction
      await outboxService.stageEvent(client, taskAssignedEvent);
    }

    await client.query('COMMIT');

    // Trigger Notification for Assignee
    if (taskAssignedEvent) {
      notificationService.notify({
        user_id: assigned_to,
        tenant_id: tenant_id,
        branch_id: branch_id,
        type: 'info',
        title: 'New Task Assigned',
        message: `You have been assigned a new task: ${title}`,
        link: '/tasks'
      });

      // Emit Domain Event: task.assigned (Messaging & Notification Layer)
      try {
        const { eventBus } = require('../src/infrastructure/events/LocalEventBus');
        await eventBus.publish(taskAssignedEvent);
        await db.query(`UPDATE outbox_events SET status = 'published', processed_at = CURRENT_TIMESTAMP WHERE id = $1`, [taskAssignedEvent.id]).catch(() => {});
      } catch (eventErr) {
        console.warn('⚠️ [task.assigned] Immediate publish failed; Outbox poller will retry automatically:', eventErr.message);
      }
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

    // Verify task belongs to tenant and branch, and fetch ownership columns
    const branch_id = req.branchId || req.user?.branch_id;

    const verifyResult = await client.query(
      'SELECT id, status_id, assigned_to, created_by, director_id FROM tasks WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text',
      [req.params.id, tenant_id, branch_id]
    );
    if (verifyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ status: 'error', message: 'Task not found or unauthorized' });
    }

    const taskRow = verifyResult.rows[0];
    const userId = req.user.id;
    const userRole = req.user.role;

    // RBAC Authorization Check for Update
    let canUpdate = false;
    if (userRole === 'admin') {
      canUpdate = true;
    } else if (
      String(taskRow.created_by) === String(userId) ||
      String(taskRow.assigned_to) === String(userId) ||
      String(taskRow.director_id) === String(userId)
    ) {
      canUpdate = true;
    } else if (userRole === 'manager' || userRole === 'supervisor') {
      if (taskRow.assigned_to) {
        const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
        const params = [taskRow.assigned_to, String(tenant_id), userId];
        let deptSql = '';
        if (accessibleDeptIds && accessibleDeptIds.length > 0) {
          params.push(accessibleDeptIds);
          deptSql = 'OR department_id = ANY($4::int[])';
        }
        const subCheck = await client.query(
          `SELECT 1 FROM users WHERE id = $1 AND tenant_id::text = $2::text AND (manager_id = $3 ${deptSql})`,
          params
        );
        if (subCheck.rows.length > 0) canUpdate = true;
      }
    }

    if (!canUpdate) {
      await client.query('ROLLBACK');
      return res.status(403).json({ status: 'error', message: 'Unauthorized: You do not have permission to update this task' });
    }

    const result = await client.query(
      'UPDATE tasks SET title = $1, description = $2, priority = $3, status = $4, status_id = $5, assigned_to = $6, director_id = $7, parent_type = $8, parent_id = $9, due_date = $10, updated_at = CURRENT_TIMESTAMP WHERE id = $11 AND tenant_id::text = $12::text AND branch_id::text = $13::text RETURNING *',
      [title, description, priority, status, status_id || null, assigned_to || null, director_id || null, parent_type, parent_id, due_date || null, req.params.id, tenant_id, branch_id]
    );

    // Update followers: Delete then Insert (simple sync)
    await client.query('DELETE FROM task_followers WHERE task_id = $1', [req.params.id]);
    if (follower_ids && Array.isArray(follower_ids)) {
      for (const followerId of follower_ids) {
        await client.query('INSERT INTO task_followers (task_id, user_id) VALUES ($1, $2)', [req.params.id, followerId]);
      }
    }

    const isReassigned = assigned_to && String(assigned_to) !== String(verifyResult.rows[0].assigned_to);
    let taskReassignedEvent = null;
    if (isReassigned && String(assigned_to) !== String(req.user.id)) {
      const DomainEvent = require('../src/infrastructure/events/DomainEvent');
      const outboxService = require('../src/infrastructure/events/OutboxService');
      taskReassignedEvent = new DomainEvent({
        eventName: 'task.assigned',
        tenantId: tenant_id,
        branchId: branch_id,
        aggregateType: 'Task',
        aggregateId: req.params.id,
        payload: {
          taskId: req.params.id,
          taskTitle: result.rows[0].title,
          dueDate: result.rows[0].due_date || null,
          priority: result.rows[0].priority || 'medium',
          assignedTo: assigned_to,
          previousAssignedTo: verifyResult.rows[0].assigned_to,
          assignedByUserId: req.user.id,
          assignedByName: req.user.name,
          assignedAt: result.rows[0].updated_at || new Date().toISOString()
        },
        actorId: req.user.id
      });

      // Stage atomically in outbox inside same database transaction
      await outboxService.stageEvent(client, taskReassignedEvent);
    }

    await client.query('COMMIT');

    // Trigger Notification if task was reassigned to another user
    if (taskReassignedEvent) {
      notificationService.notifyAssignment({
        tenantId: tenant_id,
        branchId: branch_id,
        recipientUserId: assigned_to,
        assignedByUserId: req.user.id,
        assignedByName: req.user.name,
        entityType: 'Task',
        entityName: result.rows[0].title,
        link: '/tasks'
      }).catch(e => console.warn('[Task Reassignment Notification Warning]:', e.message));

      // Emit Domain Event: task.assigned (Messaging & Notification Layer)
      try {
        const { eventBus } = require('../src/infrastructure/events/LocalEventBus');
        await eventBus.publish(taskReassignedEvent);
        await db.query(`UPDATE outbox_events SET status = 'published', processed_at = CURRENT_TIMESTAMP WHERE id = $1`, [taskReassignedEvent.id]).catch(() => {});
      } catch (eventErr) {
        console.warn('⚠️ [task.assigned] Immediate publish failed; Outbox poller will retry automatically:', eventErr.message);
      }
    }

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
    const taskRes = await db.query(
      'SELECT id, title, assigned_to, created_by, director_id FROM tasks WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text',
      [req.params.id, tenant_id, branch_id]
    );
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Task not found or unauthorized' });
    }

    const taskRow = taskRes.rows[0];
    const userId = req.user.id;
    const userRole = req.user.role;

    // RBAC Authorization Check for Delete: Only creator, manager of assignee, or admin can delete
    let canDelete = false;
    if (userRole === 'admin') {
      canDelete = true;
    } else if (String(taskRow.created_by) === String(userId)) {
      canDelete = true;
    } else if (userRole === 'manager' || userRole === 'supervisor') {
      if (String(taskRow.director_id) === String(userId)) {
        canDelete = true;
      } else if (taskRow.assigned_to) {
        const accessibleDeptIds = await accessScopeService.getAccessibleDepartmentIds(req.user);
        const params = [taskRow.assigned_to, String(tenant_id), userId];
        let deptSql = '';
        if (accessibleDeptIds && accessibleDeptIds.length > 0) {
          params.push(accessibleDeptIds);
          deptSql = 'OR department_id = ANY($4::int[])';
        }
        const subCheck = await db.query(
          `SELECT 1 FROM users WHERE id = $1 AND tenant_id::text = $2::text AND (manager_id = $3 ${deptSql})`,
          params
        );
        if (subCheck.rows.length > 0) canDelete = true;
      }
    }

    if (!canDelete) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized: Only the task creator or a manager can delete this task' });
    }

    const result = await db.query('DELETE FROM tasks WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text RETURNING *', [req.params.id, tenant_id, branch_id]);
    res.json({ status: 'success', message: 'Task deleted' });
  } catch (err) {
    console.error('deleteTask Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error deleting task' });
  }
};

const db = require('../config/db');

/**
 * Centeralized service for sending system notifications
 * @param {object} params Notification details
 */
exports.sendNotification = async ({ userId, tenantId, type = 'info', title, message, link = null }) => {
  try {
    const result = await db.query(
      `INSERT INTO notifications (user_id, tenant_id, type, title, message, link) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, tenantId, type, title, message, link]
    );
    
    // In a production app, we would emit a Socket.io event here for real-time delivery
    // io.to(`user_${userId}`).emit('notification', result.rows[0]);
    
    return result.rows[0];
  } catch (err) {
    console.error('Error sending notification:', err.message);
    // We don't throw here to avoid breaking the main business flow if notifications fail
    return null;
  }
};

/**
 * Send notification to all admins of a tenant
 * @param {string} tenantId 
 * @param {object} data 
 */
exports.notifyAdmins = async (tenantId, data) => {
  try {
    const admins = await db.query('SELECT id FROM users WHERE tenant_id = $1 AND role = \'admin\'', [tenantId]);
    for (const admin of admins.rows) {
      await this.sendNotification({ ...data, userId: admin.id, tenantId });
    }
  } catch (err) {
    console.error('Error notifying admins:', err.message);
  }
};

const db = require('../config/db');
const { logAction, ACTIONS, LOG_LEVELS } = require('../services/loggerService');

// @desc    Get all global settings
// @route   GET /api/settings
// @access  Private (Admin)
exports.getSettings = async (req, res) => {
  try {
    const result = await db.query('SELECT key, value FROM settings');
    // Convert array of {key, value} to single object { [key]: value }
    const settingsMap = result.rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    
    res.json({ status: 'success', data: settingsMap });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Update multiple global settings
// @route   POST /api/settings
// @access  Private (Admin)
exports.updateSettings = async (req, res) => {
  const settings = req.body; // Expects { key1: value1, key2: value2 }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'Not authorized' });
  }

  try {
    for (const [key, value] of Object.entries(settings)) {
      await db.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
        [key, value]
      );
    }

    // Log the branding change
    logAction({ 
      req, 
      action: ACTIONS.BRANDING_UPDATE, 
      entityType: 'Settings', 
      details: { updatedKeys: Object.keys(settings) },
      level: LOG_LEVELS.WARNING 
    });

    res.json({ status: 'success', message: 'Settings updated successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error updating settings' });
  }
};

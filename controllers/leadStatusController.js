const db = require('../config/db');

exports.getStatuses = async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM lead_statuses WHERE tenant_id = $1 ORDER BY sort_order ASC',
            [req.user.tenant_id]
        );
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.createStatus = async (req, res) => {
    const { name, color, sort_order } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO lead_statuses (tenant_id, name, color, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.user.tenant_id, name, color, sort_order || 0]
        );
        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.updateStatus = async (req, res) => {
    const { id } = req.params;
    const { name, color, sort_order } = req.body;
    try {
        const result = await db.query(
            'UPDATE lead_statuses SET name = $1, color = $2, sort_order = $3 WHERE id = $4 AND tenant_id = $5 RETURNING *',
            [name, color, sort_order, id, req.user.tenant_id]
        );
        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Status not found' });
        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.deleteStatus = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            'DELETE FROM lead_statuses WHERE id = $1 AND tenant_id = $2 AND is_default = false RETURNING *',
            [id, req.user.tenant_id]
        );
        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Status not found or cannot delete default status' });
        res.json({ status: 'success', message: 'Status deleted' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

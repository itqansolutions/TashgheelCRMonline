const db = require('../config/db');

/**
 * Real Estate Units Controller
 * Manages the inventory of units (Apartments, Villas, etc.)
 */

// @desc    Get all units for tenant
// @route   GET /api/re-units
exports.getUnits = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    try {
        const result = await db.query(`
            SELECT * FROM re_units 
            WHERE tenant_id = $1 
            ORDER BY project_name, unit_number
        `, [tenant_id]);
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Create a new unit
// @route   POST /api/re-units
exports.createUnit = async (req, res) => {
    const { project_name, unit_number, type, floor, area, price } = req.body;
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId || null;

    try {
        const result = await db.query(`
            INSERT INTO re_units (tenant_id, branch_id, project_name, unit_number, type, floor, area, price, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Available')
            RETURNING *
        `, [tenant_id, branch_id, project_name, unit_number, type, floor, area, price]);
        
        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Update unit details or status
// @route   PUT /api/re-units/:id
exports.updateUnit = async (req, res) => {
    const { id } = req.params;
    const { project_name, unit_number, type, floor, area, price, status } = req.body;
    const tenant_id = req.user.tenant_id;

    try {
        const result = await db.query(`
            UPDATE re_units SET
                project_name = COALESCE($1, project_name),
                unit_number = COALESCE($2, unit_number),
                type = COALESCE($3, type),
                floor = COALESCE($4, floor),
                area = COALESCE($5, area),
                price = COALESCE($6, price),
                status = COALESCE($7, status),
                updated_at = NOW()
            WHERE id = $8 AND tenant_id = $9
            RETURNING *
        `, [project_name, unit_number, type, floor, area, price, status, id, tenant_id]);

        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Unit not found' });
        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// @desc    Delete unit (only if Available)
// @route   DELETE /api/re-units/:id
exports.deleteUnit = async (req, res) => {
    const { id } = req.params;
    const tenant_id = req.user.tenant_id;

    try {
        // Safety: Can't delete if Reserved or Sold
        const check = await db.query('SELECT status FROM re_units WHERE id = $1 AND tenant_id = $2', [id, tenant_id]);
        if (check.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Unit not found' });
        
        if (check.rows[0].status !== 'Available') {
            return res.status(400).json({ status: 'error', message: 'Cannot delete a unit that is Reserved or Sold' });
        }

        await db.query('DELETE FROM re_units WHERE id = $1 AND tenant_id = $2', [id, tenant_id]);
        res.json({ status: 'success', message: 'Unit removed from inventory' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

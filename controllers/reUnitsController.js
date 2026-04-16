const db = require('../config/db');

/**
 * Real Estate Units Controller
 * Manages the inventory of units (Apartments, Villas, etc.)
 */

// @desc    Get all units for tenant
// @route   GET /api/re-units
exports.getUnits = async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId || req.user?.branch_id;

    try {
        const result = await db.query(`
            SELECT 
                ru.*,
                c.name as vendor_name,
                u.name as responsible_person_name
            FROM re_units ru
            LEFT JOIN customers c ON ru.vendor_id = c.id
            LEFT JOIN users u ON ru.responsible_person_id = u.id
            WHERE ru.tenant_id = $1 AND ru.branch_id = $2
            ORDER BY ru.project_name DESC, ru.name ASC
        `, [tenant_id, branch_id]);

        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        console.error('[Units API Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to fetch units' });
    }
};

// @desc    Create a new unit
// @route   POST /api/re-units
exports.createUnit = async (req, res) => {
    const { 
        name, project_name, unit_number, type, floor, area_sqm, price, 
        vendor_id, responsible_person_id, transaction_type, rooms, location 
    } = req.body;
    
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId || req.user?.branch_id;

    try {
        const result = await db.query(`
            INSERT INTO re_units (
                tenant_id, branch_id, name, project_name, unit_number, type, floor, area_sqm, price, 
                vendor_id, responsible_person_id, transaction_type, rooms, location, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'Available')
            RETURNING *
        `, [
            tenant_id, branch_id, name, project_name, unit_number, type, floor, area_sqm, price,
            vendor_id, responsible_person_id, transaction_type || 'sale', rooms || 0, location
        ]);
        
        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('[Unit Create Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to create unit' });
    }
};

// @desc    Update unit details or status
// @route   PUT /api/re-units/:id
exports.updateUnit = async (req, res) => {
    const { id } = req.params;
    const { 
        name, project_name, unit_number, type, floor, area_sqm, price, status,
        vendor_id, responsible_person_id, transaction_type, rooms, location 
    } = req.body;
    
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId || req.user?.branch_id;

    try {
        const result = await db.query(`
            UPDATE re_units SET
                name = COALESCE($1, name),
                project_name = COALESCE($2, project_name),
                unit_number = COALESCE($3, unit_number),
                type = COALESCE($4, type),
                floor = COALESCE($5, floor),
                area_sqm = COALESCE($6, area_sqm),
                price = COALESCE($7, price),
                status = COALESCE($8, status),
                vendor_id = COALESCE($9, vendor_id),
                responsible_person_id = COALESCE($10, responsible_person_id),
                transaction_type = COALESCE($11, transaction_type),
                rooms = COALESCE($12, rooms),
                location = COALESCE($13, location),
                updated_at = NOW()
            WHERE id = $14 AND tenant_id = $15 AND branch_id = $16
            RETURNING *
        `, [
            name, project_name, unit_number, type, floor, area_sqm, price, status,
            vendor_id, responsible_person_id, transaction_type, rooms, location,
            id, tenant_id, branch_id
        ]);

        if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Unit not found or unauthorized' });
        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('[Unit Update Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to update unit' });
    }
};

// @desc    Delete unit (only if Available)
// @route   DELETE /api/re-units/:id
exports.deleteUnit = async (req, res) => {
    const { id } = req.params;
    const tenant_id = req.user.tenant_id;
    const branch_id = req.branchId || req.user?.branch_id;

    try {
        // Safety: Can't delete if Reserved or Sold
        const check = await db.query('SELECT status FROM re_units WHERE id = $1 AND tenant_id = $2 AND branch_id = $3', [id, tenant_id, branch_id]);
        if (check.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Unit not found' });
        
        if (check.rows[0].status !== 'Available') {
            return res.status(400).json({ status: 'error', message: 'Cannot delete a unit that is Reserved or Sold' });
        }

        await db.query('DELETE FROM re_units WHERE id = $1 AND tenant_id = $2 AND branch_id = $3', [id, tenant_id, branch_id]);
        res.json({ status: 'success', message: 'Unit removed from inventory' });
    } catch (err) {
        console.error('[Unit Delete Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

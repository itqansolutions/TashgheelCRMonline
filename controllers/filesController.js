const db = require('../config/db');
const path = require('path');
const fs = require('fs');

// @desc    Upload a file and link to entity
// @route   POST /api/files/upload
// @access  Private
exports.uploadFile = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'Please upload a file' });
  }

  const { linked_type, linked_id } = req.body;
  
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  
  if (!linked_type || !linked_id) {
    // Remove the uploaded file if entity linkage is missing
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ status: 'error', message: 'Entity type and ID are required' });
  }

  try {
    const result = await db.query(
      'INSERT INTO attachments (filename, original_name, mime_type, file_path, linked_type, linked_id, uploaded_by, tenant_id, branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [req.file.filename, req.file.originalname, req.file.mimetype, req.file.path, linked_type, linked_id, req.user.id, tenant_id, branch_id]
    );

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    // Cleanup file on DB error
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get all attachments for an entity
// @route   GET /api/files/:entityType/:entityId
// @access  Private
exports.getAttachments = async (req, res) => {
  const { entityType, entityId } = req.params;
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query(
      'SELECT * FROM attachments WHERE linked_type = $1 AND linked_id = $2 AND tenant_id::text = $3::text AND branch_id::text = $4::text ORDER BY created_at DESC',
      [entityType, entityId, tenant_id, branch_id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Delete an attachment
// @route   DELETE /api/files/:id
// @access  Private (Admin or Owner)
exports.deleteAttachment = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    // 1. Get file details AND enforce Tenant isolation
    const fileResult = await db.query('SELECT * FROM attachments WHERE id = $1 AND tenant_id::text = $2::text AND branch_id::text = $3::text', [req.params.id, tenant_id, branch_id]);
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'File not found' });
    }

    const file = fileResult.rows[0];

    // 2. Check permissions (Simple check for now)
    if (req.user.role !== 'admin' && req.user.id !== file.uploaded_by) {
      return res.status(403).json({ status: 'error', message: 'Not authorized' });
    }

    // 3. Delete from DB
    await db.query('DELETE FROM attachments WHERE id = $1', [req.params.id]);

    // 4. Delete from Disk
    if (fs.existsSync(file.file_path)) {
      fs.unlinkSync(file.file_path);
    }

    res.json({ status: 'success', message: 'File deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// @desc    Get all system files
// @route   GET /api/files
// @access  Private
exports.getFiles = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;
  try {
    const result = await db.query('SELECT * FROM attachments WHERE tenant_id::text = $1::text AND branch_id::text = $2::text ORDER BY created_at DESC', [tenant_id, branch_id]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

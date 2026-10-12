const db = require('../config/db');
const path = require('path');
const fs = require('fs');

// @desc    Upload a file and link to entity
// @route   POST /api/files/upload
// @access  Private
exports.uploadFile = async (req, res) => {
  if (!req.file) {
    console.error('[Upload] No file provided in request.');
    return res.status(400).json({ status: 'error', message: 'No file was uploaded. Please try again.' });
  }

  const { linked_type, linked_id } = req.body;
  
  const tenant_id = req.user?.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;
  
  console.log('[UPLOAD DEBUG] Metadata:', { linked_type, linked_id, tenant_id, branch_id, userId: req.user?.id });

  if (!tenant_id) {
    if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(401).json({ status: 'error', message: 'Tenant context is missing.' });
  }

  if (!linked_type || linked_id === undefined || linked_id === null || String(linked_id).trim() === '') {
    console.error(`[Upload] Missing metadata: Type=${linked_type}, ID=${linked_id}`);
    if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ status: 'error', message: 'Entity linkage information (type/id) is missing.' });
  }

  // Store normalized relative path to uploads root (e.g. "uploads/<tenantId>/<filename>")
  const uploadsRootDir = path.resolve(__dirname, '..', 'uploads');
  const normalizedRelativePath = path.relative(uploadsRootDir, req.file.path).replace(/\\/g, '/');
  const storedFilePath = `uploads/${normalizedRelativePath}`;

  try {
    const result = await db.query(
      'INSERT INTO attachments (filename, original_name, mime_type, file_path, linked_type, linked_id, uploaded_by, tenant_id, branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [
        req.file.filename, 
        req.file.originalname, 
        req.file.mimetype, 
        storedFilePath, 
        linked_type, 
        String(linked_id), 
        req.user?.id || null, 
        tenant_id, 
        branch_id
      ]
    );

    console.log('[UPLOAD SUCCESS] File linked:', result.rows[0].id);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error('[Upload DB Error CRITICAL]:', {
      message: err.message,
      detail: err.detail,
      table: err.table,
      constraint: err.constraint
    });
    // Cleanup file on DB error
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ 
        status: 'error', 
        message: 'Database failed to link file', 
        debug: err.message 
    });
  }
};

// @desc    Get all attachments for an entity
// @route   GET /api/files/:entityType/:entityId
// @access  Private
exports.getAttachments = async (req, res) => {
  const { entityType, entityId } = req.params;
  const tenant_id = req.user?.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  if (!tenant_id) {
    return res.status(401).json({ status: 'error', message: 'Tenant context is missing.' });
  }

  try {
    const result = await db.query(
      'SELECT * FROM attachments WHERE linked_type = $1 AND linked_id = $2 AND tenant_id::text = $3::text AND (branch_id::text = $4::text OR branch_id IS NULL) ORDER BY created_at DESC',
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
  const tenant_id = req.user?.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  if (!tenant_id) {
    return res.status(401).json({ status: 'error', message: 'Tenant context is missing.' });
  }

  try {
    // 1. Get file details AND enforce Tenant isolation
    const fileResult = await db.query(
      'SELECT * FROM attachments WHERE id = $1 AND tenant_id::text = $2::text AND (branch_id::text = $3::text OR branch_id IS NULL)',
      [req.params.id, tenant_id, branch_id]
    );
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'File not found' });
    }

    const file = fileResult.rows[0];

    // 2. Check permissions
    if (req.user.role !== 'admin' && req.user.id !== file.uploaded_by) {
      return res.status(403).json({ status: 'error', message: 'Not authorized' });
    }

    // 3. Delete from DB with strict tenant isolation
    await db.query('DELETE FROM attachments WHERE id = $1 AND tenant_id::text = $2::text', [req.params.id, tenant_id]);

    // 4. Delete from Disk (resolving stored path or tenant uploads directory)
    const uploadsRootDir = path.resolve(__dirname, '..', 'uploads');
    const diskPath = path.isAbsolute(file.file_path)
      ? file.file_path
      : path.resolve(__dirname, '..', file.file_path);

    if (fs.existsSync(diskPath)) {
      fs.unlinkSync(diskPath);
    } else {
      // Fallback: check in tenant-specific subfolder
      const tenantSpecificPath = path.resolve(uploadsRootDir, String(tenant_id), file.filename);
      if (fs.existsSync(tenantSpecificPath)) {
        fs.unlinkSync(tenantSpecificPath);
      }
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
  const tenant_id = req.user?.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id;

  if (!tenant_id) {
    return res.status(401).json({ status: 'error', message: 'Tenant context is missing.' });
  }

  try {
    const result = await db.query(
      'SELECT * FROM attachments WHERE tenant_id::text = $1::text AND (branch_id::text = $2::text OR branch_id IS NULL) ORDER BY created_at DESC',
      [tenant_id, branch_id]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

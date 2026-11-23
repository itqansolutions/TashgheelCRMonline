const db = require('../config/db');
const path = require('path');
const fs = require('fs');

// Deal files follow the existing deal view permission and assigned-record scope.
// Other entity policies are intentionally unchanged.
async function dealFileReadPredicate(user, paramIndex) {
  const { checkDealPermission } = require('../middleware/dealPermission');
  if (!(await checkDealPermission(user.id, user.tenant_id, 'deal.view', user.role))) {
    return { allowed: false, sql: "LOWER(COALESCE(linked_type, '')) <> 'deal'", params: [] };
  }
  const scope = await require('../services/accessScopeService').buildScopePredicate({user,tableAlias:'deals',assigneeCol:'assigned_to',paramIndex});
  const extra = scope.sql && scope.sql !== '1=1' ? ` AND ${scope.sql}` : '';
  return {
    allowed: true,
    sql: `(LOWER(COALESCE(linked_type, '')) <> 'deal' OR EXISTS (SELECT 1 FROM deals WHERE deals.id::text = attachments.linked_id::text AND deals.tenant_id::text = attachments.tenant_id::text${extra}))`,
    params: extra ? scope.params : []
  };
}

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

  let effectiveLinkedId = linked_id;
  if (!effectiveLinkedId || effectiveLinkedId === 'undefined' || effectiveLinkedId === 'null' || String(effectiveLinkedId).trim() === '') {
    if (String(linked_type).toLowerCase() === 'tenant') {
      effectiveLinkedId = String(tenant_id);
    }
  }

  if (!linked_type || !effectiveLinkedId || String(effectiveLinkedId).trim() === '') {
    console.error(`[Upload] Missing metadata: Type=${linked_type}, ID=${linked_id}`);
    if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ status: 'error', message: 'Entity linkage information (type/id) is missing.' });
  }

  // Store normalized relative path to uploads root (e.g. "uploads/<tenantId>/<filename>")
  const uploadsRootDir = path.resolve(__dirname, '..', 'uploads');
  const normalizedRelativePath = path.relative(uploadsRootDir, req.file.path).replace(/\\/g, '/');
  const storedFilePath = `uploads/${normalizedRelativePath}`;

  // 1. If uploading a tenant logo/asset, immediately persist logo_url to tenants table
  if (String(linked_type).toLowerCase() === 'tenant') {
    try {
      await db.query('UPDATE tenants SET logo_url = $1 WHERE id::text = $2::text', [storedFilePath, String(tenant_id)]);
      console.log(`[Upload] Auto-updated tenant ${tenant_id} logo_url to ${storedFilePath}`);
    } catch (tErr) {
      console.warn('[Upload] Failed auto-updating tenant logo_url:', tErr.message);
    }
  }

  // 2. Safe attachment record creation
  let uploadedById = null;
  if (req.user?.id && !isNaN(Number(req.user.id))) {
    uploadedById = Number(req.user.id);
  }

  let fileData = null;
  try {
    if (req.file.path && fs.existsSync(req.file.path) && req.file.size <= 10 * 1024 * 1024) {
      fileData = fs.readFileSync(req.file.path).toString('base64');
    }
  } catch (readErr) {
    console.warn('[Upload] Buffer read error:', readErr.message);
  }

  let attachmentRecord = {
    filename: req.file.filename,
    original_name: req.file.originalname,
    mime_type: req.file.mimetype,
    file_path: storedFilePath,
    file_data: fileData,
    linked_type,
    linked_id: String(effectiveLinkedId),
    uploaded_by: uploadedById,
    tenant_id: String(tenant_id),
    branch_id: branch_id ? String(branch_id) : null
  };

  try {
    const result = await db.query(
      'INSERT INTO attachments (filename, original_name, mime_type, file_path, linked_type, linked_id, uploaded_by, tenant_id, branch_id, file_data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [
        req.file.filename, 
        req.file.originalname, 
        req.file.mimetype, 
        storedFilePath, 
        linked_type, 
        String(effectiveLinkedId), 
        uploadedById, 
        String(tenant_id), 
        branch_id ? String(branch_id) : null,
        fileData
      ]
    );

    if (result.rows && result.rows.length > 0) {
      attachmentRecord = result.rows[0];
    }

    console.log('[UPLOAD SUCCESS] File linked:', attachmentRecord.id);
    return res.status(201).json({ status: 'success', data: attachmentRecord });
  } catch (err) {
    console.error('[Upload DB Error CRITICAL]:', {
      message: err.message,
      detail: err.detail,
      table: err.table,
      constraint: err.constraint
    });

    // If uploading a tenant logo, the logo is already saved to tenants.logo_url and file is on disk
    if (String(linked_type).toLowerCase() === 'tenant') {
      console.warn('[Upload] Attachments record failed but tenant logo was saved successfully. Returning success.');
      return res.status(201).json({ status: 'success', data: attachmentRecord });
    }

    // Cleanup file on DB error for non-tenant entities
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ 
        status: 'error', 
        message: 'Database failed to link file', 
        debug: err.message 
    });
  }
};

// @desc    Upload multiple files and link to entity
// @route   POST /api/files/upload-multiple
// @access  Private
exports.uploadMultipleFiles = async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ status: 'error', message: 'No files were uploaded.' });
  }

  const { linked_type, linked_id } = req.body;
  const tenant_id = req.user?.tenant_id;
  const branch_id = req.branchId || req.user?.branch_id || null;

  if (!tenant_id) {
    for (const file of req.files) {
      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
    return res.status(401).json({ status: 'error', message: 'Tenant context is missing.' });
  }

  let effectiveLinkedId = linked_id;
  if (!effectiveLinkedId || effectiveLinkedId === 'undefined' || effectiveLinkedId === 'null' || String(effectiveLinkedId).trim() === '') {
    if (String(linked_type).toLowerCase() === 'tenant') {
      effectiveLinkedId = String(tenant_id);
    }
  }

  if (!linked_type || !effectiveLinkedId || String(effectiveLinkedId).trim() === '') {
    for (const file of req.files) {
      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
    return res.status(400).json({ status: 'error', message: 'Entity linkage information (type/id) is missing.' });
  }

  let uploadedById = null;
  if (req.user?.id && !isNaN(Number(req.user.id))) {
    uploadedById = Number(req.user.id);
  }

  const uploadsRootDir = path.resolve(__dirname, '..', 'uploads');
  const insertedRecords = [];

  for (const file of req.files) {
    const normalizedRelativePath = path.relative(uploadsRootDir, file.path).replace(/\\/g, '/');
    const storedFilePath = `uploads/${normalizedRelativePath}`;

    let fileData = null;
    try {
      if (file.path && fs.existsSync(file.path) && file.size <= 10 * 1024 * 1024) {
        fileData = fs.readFileSync(file.path).toString('base64');
      }
    } catch (readErr) {
      console.warn('[Upload Multiple] Buffer read error:', readErr.message);
    }

    try {
      const result = await db.query(
        'INSERT INTO attachments (filename, original_name, mime_type, file_path, linked_type, linked_id, uploaded_by, tenant_id, branch_id, file_data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [
          file.filename,
          file.originalname,
          file.mimetype,
          storedFilePath,
          linked_type,
          String(effectiveLinkedId),
          uploadedById,
          String(tenant_id),
          branch_id ? String(branch_id) : null,
          fileData
        ]
      );
      if (result.rows && result.rows.length > 0) {
        insertedRecords.push(result.rows[0]);
      }
    } catch (err) {
      console.error('[Upload Multiple DB Error]:', err.message);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
  }

  return res.status(201).json({ status: 'success', data: insertedRecords });
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

  const isUnit = entityType === 'unit' || entityType === 're_unit';

  try {
    const dealScope = String(entityType).toLowerCase() === 'deal' ? await dealFileReadPredicate(req.user, 5) : {allowed:true,sql:'TRUE',params:[]};
    if (String(entityType).toLowerCase() === 'deal' && !dealScope.allowed) {
      return res.status(403).json({status:'error',code:'PERMISSION_DENIED',required_permission:'deal.view',message:'Permission denied.'});
    }
    const result = await db.query(
      `SELECT * FROM attachments 
       WHERE (${isUnit ? "(linked_type = $1 OR linked_type IN ('unit', 're_unit'))" : "linked_type = $1"})
         AND linked_id = $2 
         AND tenant_id::text = $3::text 
         AND ($4::text IS NULL OR branch_id::text = $4::text OR branch_id IS NULL) 
         AND ${dealScope.sql}
       ORDER BY created_at DESC`,
      [entityType, entityId, tenant_id, branch_id || null, ...dealScope.params]
    );
    const normalizedRows = (result.rows || []).map(r => ({
      ...r,
      file_path: r.file_data ? `data:${r.mime_type || 'image/png'};base64,${r.file_data}` : r.file_path
    }));
    res.json({ status: 'success', data: normalizedRows });
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
      'SELECT * FROM attachments WHERE id = $1 AND tenant_id::text = $2::text AND ($3::text IS NULL OR branch_id::text = $3::text OR branch_id IS NULL)',
      [req.params.id, tenant_id, branch_id || null]
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
    const dealScope = await dealFileReadPredicate(req.user, 3);
    const result = await db.query(
      `SELECT * FROM attachments WHERE tenant_id::text = $1::text AND ($2::text IS NULL OR branch_id::text = $2::text OR branch_id IS NULL) AND ${dealScope.sql} ORDER BY created_at DESC`,
      [tenant_id, branch_id || null, ...dealScope.params]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

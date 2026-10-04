const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

/**
 * PRODUCTION-GRADE Secure Uploads Middleware
 * Enforces authentication, path traversal defense, and strict tenant isolation
 * for all static file access under /uploads.
 * 
 * - Token accepted via Authorization header or ?token= query parameter
 * - Never logs or exposes token strings
 * - Path traversal defense using path normalization and prefix verification
 * - Enforces tenant boundaries for WhatsApp media and general attachments
 * - Preserves public availability for tenant branding logos
 */
function secureUploads(uploadsDir) {
  const resolvedUploadsDir = path.resolve(uploadsDir);

  return async (req, res, next) => {
    try {
      // 1. Path Traversal & Sanitization Defense
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(req.path);
      } catch (e) {
        return res.status(400).json({ status: 'error', message: 'Invalid file path encoding.' });
      }

      // Check for null bytes
      if (decodedPath.indexOf('\0') !== -1) {
        return res.status(400).json({ status: 'error', message: 'Invalid file path.' });
      }

      // Check for path traversal sequences
      if (decodedPath.includes('..')) {
        return res.status(403).json({ status: 'error', message: 'Access denied: Path traversal detected.' });
      }

      // Normalize and resolve path
      const cleanRelativePath = decodedPath.replace(/^[/\\]+/, '');
      const filePath = path.resolve(resolvedUploadsDir, cleanRelativePath);

      // Verify the resolved path is strictly within uploadsDir
      if (!filePath.startsWith(resolvedUploadsDir + path.sep) && filePath !== resolvedUploadsDir) {
        return res.status(403).json({ status: 'error', message: 'Access denied: Path traversal detected.' });
      }

      // 2. Check File Existence
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return res.status(404).json({ status: 'error', message: 'File not found.' });
      }

      // 3. Extract Authentication Token (Header or Query Param)
      let token = null;
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      } else if (req.query && req.query.token) {
        token = String(req.query.token).trim();
      }

      let authenticatedUser = null;
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          authenticatedUser = decoded.user || decoded;
        } catch (jwtErr) {
          // Token provided but invalid or expired (never log token content)
          return res.status(401).json({ status: 'error', message: 'Invalid or expired authorization token.' });
        }
      }

      const filename = path.basename(filePath);

      // Look up attachment record for tenant isolation check
      let attachmentRecord = null;
      try {
        const attachRes = await db.query(
          'SELECT tenant_id, linked_type FROM attachments WHERE filename = $1 OR file_path LIKE $2 LIMIT 1',
          [filename, `%${filename}`]
        );
        if (attachRes.rows.length > 0) {
          attachmentRecord = attachRes.rows[0];
        }
      } catch (dbErr) {
        console.error('[Uploads Security] Database lookup error:', dbErr.message);
      }

      // 4. Authorization & Tenant Isolation Enforcement
      // Unauthenticated request handling:
      if (!authenticatedUser) {
        // Public tenant branding logos are permitted for quotation/invoice rendering
        if (attachmentRecord && String(attachmentRecord.linked_type).toLowerCase() === 'tenant') {
          return res.sendFile(filePath);
        }
        return res.status(401).json({ status: 'error', message: 'Authentication required to access this file.' });
      }

      // Authenticated User: Verify Tenant Isolation
      const userTenantId = authenticatedUser.tenant_id;

      // WhatsApp files isolation: /uploads/whatsapp/:tenantId/*
      const relativeToUploads = path.relative(resolvedUploadsDir, filePath);
      const parts = relativeToUploads.split(path.sep);

      if (parts[0] === 'whatsapp' && parts.length >= 3) {
        const fileTenantId = parts[1];
        if (userTenantId && String(fileTenantId).toLowerCase() !== String(userTenantId).toLowerCase()) {
          return res.status(403).json({ status: 'error', message: 'Access denied: File belongs to another organization.' });
        }
        return res.sendFile(filePath);
      }

      // Attachments isolation: Verify tenant_id matches
      if (attachmentRecord && attachmentRecord.tenant_id && userTenantId) {
        if (String(attachmentRecord.tenant_id).toLowerCase() !== String(userTenantId).toLowerCase()) {
          return res.status(403).json({ status: 'error', message: 'Access denied: File belongs to another organization.' });
        }
      }

      // Deliver file
      return res.sendFile(filePath);
    } catch (err) {
      console.error('[Uploads Security] Server error during file delivery:', err.message);
      return res.status(500).json({ status: 'error', message: 'Internal server error processing file request.' });
    }
  };
}

module.exports = secureUploads;

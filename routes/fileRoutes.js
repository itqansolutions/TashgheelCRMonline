const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const filesController = require('../controllers/filesController');
const authMiddleware = require('../middleware/auth');

const fs = require('fs');

// Multer Storage Configuration (Tenant Isolated Directory)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const tenantId = (req.user && req.user.tenant_id) ? String(req.user.tenant_id) : 'common';
      const uploadDirPath = path.join(__dirname, '..', 'uploads', tenantId);
      if (!fs.existsSync(uploadDirPath)) {
        fs.mkdirSync(uploadDirPath, { recursive: true });
      }
      cb(null, uploadDirPath);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const sanitizedOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${sanitizedOriginal}`);
  }
});

// File Filter (for specific types)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|docx|doc|webp|svg|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype.toLowerCase());

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Error: File type not supported! (Allowed: JPEG, JPG, PNG, WEBP, SVG, GIF, PDF, DOCX, DOC)'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// Apply authMiddleware to all routes
router.use(authMiddleware);

// @route   GET api/files
// @desc    Get all system files
// @access  Private
router.get('/', filesController.getFiles);

// @route   POST api/files/upload
// @desc    Upload file and link to entity
// @access  Private
router.post('/upload', upload.single('file'), filesController.uploadFile);

// @route   GET api/files/:entityType/:entityId
// @desc    Get attachments for entity
// @access  Private
router.get('/:entityType/:entityId', filesController.getAttachments);

// @route   DELETE api/files/:id
// @desc    Delete attachment
// @access  Private
router.delete('/:id', filesController.deleteAttachment);

module.exports = router;

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const filesController = require('../controllers/filesController');
const authMiddleware = require('../middleware/auth');

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// File Filter (for specific types)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|docx|doc/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Error: File type not supported! (Allowed: JPEG, JPG, PNG, PDF, DOCX, DOC)'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// Apply authMiddleware to all routes
router.use(authMiddleware);

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

const express = require('express');
const router = express.Router();
const controller = require('../controllers/journalController');
const { requirePermission } = require('../middleware/financialPermission');
const { sodGuard, loadDocument } = require('../middleware/sodGuard');

router.get('/',         requirePermission('gl.view'),         controller.getJournalEntries);
router.get('/:id',      requirePermission('gl.view'),         controller.getJournalEntryById);

// Posting manual journal entry requires journal.post permission
router.post('/',        requirePermission('journal.post'),    controller.postJournal);

// Reversing a journal entry requires journal.reverse permission + SOD Guard
router.post('/:id/reverse',
  requirePermission('journal.reverse'),
  loadDocument('journal_entries', 'id'),
  sodGuard('journal_entry'),
  controller.reverseJournal
);

module.exports = router;

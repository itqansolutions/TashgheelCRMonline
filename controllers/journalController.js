/**
 * journalController.js — Journal Entry REST API Controller
 */

const JournalEngine = require('../src/domains/accounting/JournalEngine');
const ReversalService = require('../src/domains/accounting/ReversalService');
const db = require('../config/db');

// GET /api/erp/journals
exports.getJournalEntries = async (req, res) => {
  const { start_date, end_date, source_type, page, limit } = req.query;
  try {
    const data = await JournalEngine.getJournalEntries(req.user.tenant_id, {
      startDate: start_date,
      endDate: end_date,
      sourceType: source_type,
      page: Number(page || 1),
      limit: Number(limit || 50)
    });
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[journalController] getJournalEntries error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /api/erp/journals/:id
exports.getJournalEntryById = async (req, res) => {
  try {
    const data = await JournalEngine.getJournalEntryById(req.user.tenant_id, req.params.id);
    if (!data) {
      return res.status(404).json({ status: 'error', message: 'Journal Entry not found.' });
    }
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[journalController] getJournalEntryById error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/erp/journals — Manual Journal Entry posting
exports.postJournal = async (req, res) => {
  const { date, source_type, source_id, entry_purpose, description, entries } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const result = await JournalEngine.postJournal(client, {
      tenantId: req.user.tenant_id,
      branchId: req.branchId || req.user?.branch_id,
      date: date || new Date(),
      sourceType: source_type || 'manual',
      sourceId: source_id || req.user.id,
      entryPurpose: entry_purpose || 'manual_journal',
      description,
      postedBy: req.user.id,
      entries
    });

    await client.query('COMMIT');
    res.status(201).json({ status: 'success', message: 'Journal Entry posted successfully.', data: result });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[journalController] postJournal error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  } finally {
    client.release();
  }
};

// POST /api/erp/journals/:id/reverse — Reverse a posted Journal Entry
exports.reverseJournal = async (req, res) => {
  const { reason } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const result = await ReversalService.reverseJournalEntry(client, {
      tenantId: req.user.tenant_id,
      branchId: req.branchId || req.user?.branch_id,
      originalJournalEntryId: req.params.id,
      reason: reason || 'Manual Reversal via API',
      postedBy: req.user.id
    });

    await client.query('COMMIT');
    res.json({ status: 'success', message: 'Journal Entry reversed successfully.', data: result });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[journalController] reverseJournal error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  } finally {
    client.release();
  }
};

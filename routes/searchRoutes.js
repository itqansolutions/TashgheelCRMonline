const express = require('express');
const router = express.Router();
const globalSearchService = require('../src/domains/shared/services/globalSearchService');

// @desc    Global Multi-Entity Search (HubSpot Style)
// @route   GET /api/search?q=query
// @access  Private
router.get('/', async (req, res) => {
    try {
        const query = req.query.q || '';
        const tenantId = req.user.tenant_id;
        const results = await globalSearchService.search(tenantId, query);
        res.json({ status: 'success', ...results });
    } catch (err) {
        console.error('[Search API Error]', err.message);
        res.status(500).json({ status: 'error', message: 'Search query failed' });
    }
});

module.exports = router;

const insightsService = require('../services/insightsService');

// @desc    Get SaaS System Insights (Strategic Analytics)
// @route   GET /api/super-admin/insights
// @access  Private (System Admin Only)
exports.getInsights = async (req, res) => {
    // SECURITY: System Admin Only (Tenant ID: 0000-...)
    const SYSTEM_DEFAULT_TENANT = '00000000-0000-0000-0000-000000000000';
    if (req.user.tenant_id !== SYSTEM_DEFAULT_TENANT) {
        return res.status(403).json({ 
            status: 'error', 
            message: 'Strategic intelligence is restricted to system administrators.' 
        });
    }

    try {
        const insights = await insightsService.getPlatformInsights();
        res.json({
            status: 'success',
            data: insights
        });
    } catch (err) {
        console.error('SYSTEM INSIGHT ERROR:', err.message);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to generate system intelligence reports.' 
        });
    }
};

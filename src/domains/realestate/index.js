const moduleRegistry = require('../../infrastructure/plugins/ModuleRegistry');
const { ReserveUnitCommand, ReserveUnitHandler } = require('./commands/ReserveUnitCommand');

/**
 * 🏢 Real Estate Domain Plugin Registration
 */
moduleRegistry.registerModule({
    name: 'realestate',
    label: 'Real Estate Vertical',
    version: '2.0.0',
    menus: [
        { title: 'Properties & Units', path: '/real-estate/units', icon: 'Building' },
        { title: 'Payment Plans', path: '/real-estate/payments', icon: 'Calendar' }
    ],
    widgets: [
        { id: 're_occupancy_rate', label: 'Unit Occupancy Rate', domain: 'realestate' },
        { id: 're_reserved_units', label: 'Reserved Units Status', domain: 'realestate' }
    ],
    permissions: [
        'realestate.view',
        'realestate.reserve',
        'realestate.sell',
        'realestate.cancel'
    ],
    registerEvents(eventBus) {
        console.log('🏢 [RealEstateDomain] Module events registered on EventBus.');
    },
    registerRoutes(app) {
        // Express router hook for Real Estate Domain
        app.post('/api/v2/real-estate/reserve', async (req, res) => {
            try {
                const command = new ReserveUnitCommand({
                    tenantId: req.user.tenant_id,
                    branchId: req.branchId,
                    userId: req.user.id,
                    unitId: req.body.unitId,
                    customerId: req.body.customerId,
                    durationDays: req.body.durationDays,
                    notes: req.body.notes
                });

                const result = await ReserveUnitHandler.execute(command);
                res.json(result);
            } catch (err) {
                console.error('[Reserve API Error]', err.message);
                res.status(err.status || 500).json({ status: 'error', message: err.message });
            }
        });
    }
});

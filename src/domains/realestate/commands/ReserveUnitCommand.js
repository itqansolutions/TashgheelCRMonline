const { BaseCommand, BaseHandler } = require('../../../application/commands/BaseCommand');
const reUnitRepository = require('../repositories/REUnitRepository');
const ReservationPolicy = require('../policies/ReservationPolicy');
const DomainEvent = require('../../../infrastructure/events/DomainEvent');
const { eventBus } = require('../../../infrastructure/events/LocalEventBus');

/**
 * 📝 ReserveUnitCommand
 * CQRS Command payload for reserving a property unit.
 */
class ReserveUnitCommand extends BaseCommand {
    constructor({ tenantId, branchId = null, userId = null, unitId, customerId = null, durationDays = 7, notes = '' }) {
        super({ tenantId, branchId, userId, payload: { unitId, customerId, durationDays, notes } });
        this.unitId = String(unitId);
        this.customerId = customerId ? String(customerId) : null;
        this.durationDays = durationDays;
        this.notes = notes;
    }
}

/**
 * ⚙️ ReserveUnitHandler
 * Executes unit reservation command with policy validation and event emission.
 */
class ReserveUnitHandler extends BaseHandler {
    /**
     * @param {ReserveUnitCommand} command 
     */
    async execute(command) {
        // 1. Fetch unit using tenant isolation
        const unit = await reUnitRepository.findById(command.tenantId, command.unitId);
        
        // 2. Validate Domain Policy
        ReservationPolicy.canReserve(unit);

        // 3. Calculate Expiration Timestamp
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + (command.durationDays || 7));

        // 4. Update Unit Status
        const updatedUnit = await reUnitRepository.updateReservation(
            command.tenantId, 
            command.unitId, 
            'Reserved', 
            expirationDate
        );

        // 5. Emit Versioned Domain Event
        const reservationEvent = new DomainEvent({
            eventName: 'reservation.created',
            version: 'v1',
            tenantId: command.tenantId,
            branchId: command.branchId,
            aggregateType: 'REUnit',
            aggregateId: command.unitId,
            payload: {
                unitId: command.unitId,
                unitNumber: updatedUnit?.unit_number || updatedUnit?.name,
                customerId: command.customerId,
                expiresAt: expirationDate.toISOString(),
                assignedTo: command.userId,
                notes: command.notes
            },
            actorId: command.userId
        });

        await eventBus.publish(reservationEvent);

        return {
            status: 'success',
            message: 'Unit reserved successfully',
            unit: updatedUnit,
            event: reservationEvent.toJSON()
        };
    }
}

module.exports = {
    ReserveUnitCommand,
    ReserveUnitHandler: new ReserveUnitHandler()
};

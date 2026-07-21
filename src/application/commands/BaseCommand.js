/**
 * 🎯 BaseCommand
 * Encapsulates request parameters, user context, tenant ID, and branch ID.
 */
class BaseCommand {
    constructor({ tenantId, branchId = null, userId = null, payload = {} }) {
        if (!tenantId) throw new Error('Command requires a tenantId');
        this.tenantId = String(tenantId);
        this.branchId = branchId ? String(branchId) : null;
        this.userId = userId ? String(userId) : 'SYSTEM';
        this.payload = payload;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * 🛠️ BaseHandler
 * Abstract class for command handlers.
 */
class BaseHandler {
    /**
     * Executes the command logic. Must be implemented by concrete handlers.
     * @param {BaseCommand} command 
     */
    async execute(command) {
        throw new Error('BaseHandler.execute() must be implemented');
    }
}

module.exports = {
    BaseCommand,
    BaseHandler
};

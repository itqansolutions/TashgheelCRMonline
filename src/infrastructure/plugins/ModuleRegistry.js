/**
 * 🧩 ModuleRegistry Framework
 * Enables modular plug-and-play domain registration for Tashgheel Enterprise Platform.
 * Modules register routes, event listeners, menu items, dashboard widgets, and permissions.
 */
class ModuleRegistry {
    constructor() {
        this.modules = new Map();
        this.registeredRoutes = [];
        this.registeredEvents = [];
        this.registeredMenus = [];
        this.registeredWidgets = [];
        this.registeredPermissions = [];
    }

    /**
     * Registers a new domain module into the platform
     * @param {Object} moduleConfig
     * @param {string} moduleConfig.name - Module ID e.g. 'crm', 'realestate'
     * @param {string} moduleConfig.label - Display Name e.g. 'Real Estate'
     * @param {Function} [moduleConfig.registerRoutes] - (app) => void
     * @param {Function} [moduleConfig.registerEvents] - (eventBus) => void
     * @param {Array} [moduleConfig.menus] - Menu items list
     * @param {Array} [moduleConfig.widgets] - Dashboard widgets list
     * @param {Array} [moduleConfig.permissions] - Permissions list
     */
    registerModule(moduleConfig) {
        if (!moduleConfig.name) throw new Error('Module must have a unique name');
        if (this.modules.has(moduleConfig.name)) {
            console.warn(`⚠️ [ModuleRegistry] Module '${moduleConfig.name}' already registered.`);
            return;
        }

        this.modules.set(moduleConfig.name, moduleConfig);
        console.log(`🧩 [PluginFramework] Registered Module: '${moduleConfig.label || moduleConfig.name}'`);

        if (moduleConfig.menus) {
            this.registeredMenus.push(...moduleConfig.menus);
        }

        if (moduleConfig.widgets) {
            this.registeredWidgets.push(...moduleConfig.widgets);
        }

        if (moduleConfig.permissions) {
            this.registeredPermissions.push(...moduleConfig.permissions);
        }
    }

    /**
     * Bootstraps event listeners across all registered modules
     * @param {import('../events/EventBusInterface')} eventBus 
     */
    bootstrapEvents(eventBus) {
        for (const [name, module] of this.modules.entries()) {
            if (typeof module.registerEvents === 'function') {
                module.registerEvents(eventBus);
                console.log(`📡 [PluginFramework] Bootstrapped events for module: '${name}'`);
            }
        }
    }

    /**
     * Mounts routes across all registered modules
     * @param {Object} app - Express app instance
     */
    mountRoutes(app) {
        for (const [name, module] of this.modules.entries()) {
            if (typeof module.registerRoutes === 'function') {
                module.registerRoutes(app);
                console.log(`🛣️ [PluginFramework] Mounted routes for module: '${name}'`);
            }
        }
    }

    /**
     * Returns all registered menu items for dynamic navigation
     */
    getMenus() {
        return this.registeredMenus;
    }

    /**
     * Returns dashboard widgets for role-based dynamic dashboards
     */
    getWidgets() {
        return this.registeredWidgets;
    }

    /**
     * Returns list of all registered modules metadata
     */
    listModules() {
        return Array.from(this.modules.values()).map(m => ({
            name: m.name,
            label: m.label,
            version: m.version || '1.0.0'
        }));
    }
}

module.exports = new ModuleRegistry();

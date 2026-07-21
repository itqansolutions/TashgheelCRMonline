/**
 * 📦 IoC Container (Inversion of Control)
 * Manages dependency injection, service lifetimes (Singleton / Transient), and mocking.
 */
class Container {
    constructor() {
        this.services = new Map();
        this.singletons = new Map();
    }

    /**
     * Registers a service factory or class
     * @param {string} name 
     * @param {Function|Object} definition 
     * @param {Object} [options={ singleton: true }]
     */
    register(name, definition, { singleton = true } = {}) {
        this.services.set(name, { definition, singleton });
    }

    /**
     * Resolves a registered service instance
     * @param {string} name 
     */
    resolve(name) {
        const item = this.services.get(name);
        if (!item) {
            throw new Error(`[IoC Container] Service '${name}' not registered.`);
        }

        if (item.singleton) {
            if (!this.singletons.has(name)) {
                const instance = typeof item.definition === 'function' ? item.definition(this) : item.definition;
                this.singletons.set(name, instance);
            }
            return this.singletons.get(name);
        }

        return typeof item.definition === 'function' ? item.definition(this) : item.definition;
    }
}

const container = new Container();
module.exports = container;

/**
 * 🎨 MetadataEngine (Schema-Driven UI Engine)
 * Defines UI form schemas, field validations, lookups, and visibilities dynamically (Salesforce/Odoo pattern).
 */
class MetadataEngine {
    constructor() {
        this.schemas = new Map();
        this._initDefaultSchemas();
    }

    _initDefaultSchemas() {
        this.schemas.set('Customer', {
            title: 'Customer Details Schema',
            fields: [
                { name: 'name', type: 'text', label: 'Full Name', required: true, section: 'General' },
                { name: 'email', type: 'email', label: 'Email Address', required: false, section: 'General' },
                { name: 'phone', type: 'phone', label: 'Phone Number', required: true, section: 'General' },
                { name: 'budget_min', type: 'number', label: 'Minimum Budget', required: false, section: 'Preferences' },
                { name: 'budget_max', type: 'number', label: 'Maximum Budget', required: false, section: 'Preferences' }
            ]
        });

        this.schemas.set('REUnit', {
            title: 'Property Unit Schema',
            fields: [
                { name: 'name', type: 'text', label: 'Unit Title', required: true, section: 'Overview' },
                { name: 'project_name', type: 'text', label: 'Project Name', required: true, section: 'Overview' },
                { name: 'unit_number', type: 'text', label: 'Unit Code', required: true, section: 'Overview' },
                { name: 'price', type: 'currency', label: 'Price (EGP)', required: true, section: 'Financial' },
                { name: 'status', type: 'select', label: 'Availability', options: ['Available', 'Reserved', 'Sold'], section: 'Financial' }
            ]
        });
    }

    /**
     * Gets schema metadata for target entity type
     * @param {string} entityType 
     */
    getSchema(entityType) {
        return this.schemas.get(entityType) || null;
    }
}

module.exports = new MetadataEngine();

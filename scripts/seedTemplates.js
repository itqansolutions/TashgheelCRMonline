const db = require('../config/db');

const templates = [
  {
    name: 'general',
    config: {
      deal_fields: [
        { key: 'value', type: 'number' },
        { key: 'source', type: 'text' }
      ],
      pipeline: ['Lead', 'Contacted', 'Proposal', 'Negotiation', 'Won', 'Lost']
    }
  },
  {
    name: 'real_estate',
    config: {
      deal_fields: [
        { key: 'unit_type', label: 'Unit Type', icon: 'Building2', type: 'text' },
        { key: 'project', label: 'Property Project', icon: 'MapPin', type: 'text' },
        { key: 'price', label: 'Price (Expected)', icon: 'Coins', type: 'number' },
        { key: 'area', label: 'Total Area (m²)', icon: 'Ruler', type: 'number' }
      ],
      pipeline: [
        'Lead',
        'Interested',
        'Site Visit',
        'Negotiation',
        'Closed'
      ],
      automation_rules: [
        {
          trigger: 'stage_change',
          condition: { stage: 'Site Visit' },
          actions: [
            { type: 'create_task', title: 'Follow up after site visit' },
            { type: 'notify', message: 'New follow-up task created' }
          ]
        }
      ]
    }
  }
];

async function seedTemplates() {
  console.log('🌱 Seeding Business Templates...');
  try {
    for (const template of templates) {
      await db.query(
        `INSERT INTO business_templates (name, config) 
         VALUES ($1, $2) 
         ON CONFLICT (name) DO UPDATE SET config = $2`,
        [template.name, JSON.stringify(template.config)]
      );
      console.log(`✅ Template '${template.name}' seeded.`);
    }
    console.log('✨ Seeding complete.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  }
}

seedTemplates();

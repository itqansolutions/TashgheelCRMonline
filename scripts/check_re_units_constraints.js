const db = require('../config/db');

async function checkConstraints() {
  try {
    const res = await db.query(`
      SELECT conname, pg_get_constraintdef(oid) 
      FROM pg_constraint 
      WHERE conrelid = 're_units'::regclass
    `);
    console.log('RE_UNITS_CONSTRAINTS:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkConstraints();

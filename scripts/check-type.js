const db = require('../config/db');

async function check() {
  try {
    const res = await db.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'parent_id'");
    console.log('TYPE:', res.rows[0].data_type);
  } catch (err) {
    console.error('CHECK FAILED:', err.message);
  } finally {
    process.exit();
  }
}

check();

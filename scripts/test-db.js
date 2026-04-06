const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

const client = new Client({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

console.log('Attempting to connect to:', connectionString.replace(/:[^:@]+@/, ':****@'));

client.connect()
  .then(() => {
    console.log('✅ Successfully connected to PostgreSQL!');
    return client.query('SELECT NOW()');
  })
  .then(res => {
    console.log('Current Time from DB:', res.rows[0].now);
    return client.end();
  })
  .catch(err => {
    console.error('❌ Connection error:', err.stack);
    process.exit(1);
  });

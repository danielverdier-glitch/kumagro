const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'kumagro',
  user: process.env.PGUSER || 'kumagro',
  password: process.env.PGPASSWORD || '',
  max: 10
});

module.exports = pool;

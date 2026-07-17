require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');
  try {
    await pool.query(schema);
    console.log('Database schema created successfully.');
  } catch (err) {
    console.error('Error initializing database:', err.message);
  } finally {
    await pool.end();
  }
}

init();

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error('Set ADMIN_PASSWORD in .env before running this script.');
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO admins (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET password_hash = $2',
      [username, hash]
    );
    console.log(`Admin "${username}" created/updated successfully.`);
  } catch (err) {
    console.error('Error seeding admin:', err.message);
  } finally {
    await pool.end();
  }
}

seedAdmin();

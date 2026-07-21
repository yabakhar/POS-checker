require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/db');

// Wipes all client/admin/synced-data rows for a clean end-to-end test run.
// Leaves schema_migrations untouched (tables stay, so `npm run db:seed-admin`
// works immediately after this — no need to re-run migrations).
async function resetDb() {
  await pool.query('TRUNCATE TABLE pos_data, clients, admins RESTART IDENTITY CASCADE');
  console.log('clients, pos_data et admins vidés. Relance "npm run db:seed-admin" pour recréer le compte admin.');
}

resetDb()
  .catch((err) => {
    console.error('Echec du reset :', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

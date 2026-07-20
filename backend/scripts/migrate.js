require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

const migrationsDir = path.join(__dirname, '../migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations() {
  const result = await pool.query('SELECT name FROM schema_migrations');
  return new Set(result.rows.map((r) => r.name));
}

// Nom de fichier = ordre d'application (001_, 002_, ...) : ne jamais modifier
// un fichier deja applique en prod, toujours en ajouter un nouveau.
function getMigrationFiles() {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function migrate() {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const pending = getMigrationFiles().filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('Aucune migration en attente.');
    return;
  }

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applique : ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Echec sur ${file} : ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`${pending.length} migration(s) appliquee(s).`);
}

migrate()
  .catch(() => {
    process.exitCode = 1;
  })
  .finally(() => pool.end());

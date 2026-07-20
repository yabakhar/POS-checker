// Jalon J-01 du CDC : "Analyse de la structure de la base de données du POS.
// Identification des tables et colonnes."
// Lance ce script une fois l'accès HeidiSQL/MySQL obtenu chez le client pour
// générer un inventaire brut du schéma, à comparer aux requêtes de l'Annexe A.
const db = require('./db');
const config = require('./config');

async function inspect() {
  console.log(`=== Inspection du schéma : ${config.db.database} ===\n`);

  const tables = await db.query(
    `SELECT TABLE_NAME, TABLE_ROWS
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME`,
    [config.db.database]
  );

  for (const t of tables) {
    console.log(`\nTable: ${t.TABLE_NAME}  (~${t.TABLE_ROWS} lignes)`);
    const columns = await db.query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [config.db.database, t.TABLE_NAME]
    );
    for (const c of columns) {
      const key = c.COLUMN_KEY ? ` [${c.COLUMN_KEY}]` : '';
      console.log(`  - ${c.COLUMN_NAME} (${c.DATA_TYPE})${key}`);
    }
  }

  process.exit(0);
}

module.exports = { main: inspect };

if (require.main === module) {
  inspect().catch((err) => {
    console.error('Erreur inspection schéma:', err.message);
    process.exit(1);
  });
}

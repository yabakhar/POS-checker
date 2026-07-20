// Script de test rapide : se connecte à la DB, collecte les données UNE FOIS,
// affiche le résultat dans la console ET le sauvegarde dans le fichier
// DRY_RUN_FILE (par défaut ./data/test-output.json), puis s'arrête.
//
// Usage :
//   DRY_RUN=true npm run test-run
// (ou mets DRY_RUN=true directement dans ton .env)

const config = require('./config');
const db = require('./db');
const tableWatcher = require('./tableWatcher');
const httpClient = require('./httpClient');

async function main() {
  console.log('=== Test unique de collecte (dry-run) ===\n');

  if (!config.dryRun) {
    console.log('DRY_RUN n\'est pas activé dans .env — active-le pour éviter');
    console.log('tout envoi réel vers le cloud pendant les tests :');
    console.log('  DRY_RUN=true\n');
  }

  const connected = await db.testConnection();
  if (!connected) {
    console.error('\nImpossible de se connecter à la base MySQL locale.');
    console.error('Vérifie DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME dans .env');
    process.exit(1);
  }

  console.log('Connexion MySQL OK. Collecte des données...\n');

  console.log('--- Tables surveillées (WATCHED_TABLES) ---');
  const watched = await tableWatcher.resolveTables();
  if (watched.length === 0) {
    console.log('Aucune table configurée (WATCHED_TABLES vide dans .env).');
  } else {
    console.log(`${watched.length} table(s) surveillée(s) : ${watched.join(', ')}`);
    const changes = await tableWatcher.collectChanges();
    const changedTables = Object.keys(changes);
    if (changedTables.length === 0) {
      console.log('Aucun changement détecté (normal au tout premier run : la base de référence vient d\'être créée).');
    } else {
      for (const table of changedTables) {
        console.log(`  - ${table} : ${changes[table].length} ligne(s) nouvelle(s)/modifiée(s)`);
        await httpClient.pushMetric(`table_sync:${table}`, changes[table]);
      }
    }
  }

  console.log(`\nRésultat sauvegardé dans : ${config.dryRunFile}`);
  console.log('Ouvre ce fichier pour voir exactement ce qui serait envoyé au cloud.');

  process.exit(0);
}

module.exports = { main };

if (require.main === module) {
  main().catch((err) => {
    console.error('Erreur pendant le test:', err.message);
    process.exit(1);
  });
}

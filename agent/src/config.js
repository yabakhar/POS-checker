require('dotenv').config();
const path = require('path');

const isDryRun = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';

function required(name, fallbackIfDryRun) {
  const value = process.env[name];
  if (!value) {
    if (isDryRun && fallbackIfDryRun !== undefined) {
      return fallbackIfDryRun;
    }
    console.error(`[CONFIG] Variable d'environnement manquante: ${name}`);
    console.error(`[CONFIG] Copiez .env.example vers .env et remplissez les valeurs.`);
    process.exit(1);
  }
  return value;
}

const config = {
  // En DRY_RUN (config de test), SHOP_TOKEN n'est pas encore nécessaire —
  // fallback 'test-token' (pas de compte cloud requis pour tester la
  // collecte DB). Hors DRY_RUN (config livrée au client), SHOP_TOKEN devient
  // obligatoire : sans fallback, `required()` arrête l'agent s'il est vide.
  shopToken: required('SHOP_TOKEN', 'test-token'),

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME'),
  },

  cloudApiUrl: process.env.CLOUD_API_URL || '',

  // Mode test : si true, les données ne sont PAS envoyées au cloud.
  // Elles sont sauvegardées dans un fichier local pour inspection.
  dryRun: isDryRun,
  dryRunFile: path.resolve(process.env.DRY_RUN_FILE || './data/test-output.json'),


  // Tables génériques à surveiller (npm run setup les propose de façon interactive) :
  // vide = aucune, "*" = toutes les tables, ou liste "table1,table2"
  watchedTables: process.env.WATCHED_TABLES || '',

  sync: {
    tablesSeconds: Number(process.env.SYNC_TABLES_SECONDS || 3600),
  },

  retryIntervalSeconds: Number(process.env.RETRY_INTERVAL_SECONDS || 60),

  log: {
    level: process.env.LOG_LEVEL || 'info',
    dir: path.resolve(process.env.LOG_DIR || './logs'),
  },

  queueFile: path.resolve('./data/queue.json'),
};

module.exports = config;

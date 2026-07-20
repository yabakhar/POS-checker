const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const scheduler = require('./scheduler');

async function waitForDatabase() {
  let connected = await db.testConnection();
  while (!connected) {
    logger.warn(`MySQL indisponible, nouvelle tentative dans ${config.retryIntervalSeconds}s`);
    await new Promise((r) => setTimeout(r, config.retryIntervalSeconds * 1000));
    connected = await db.testConnection();
  }
}

async function main() {
  logger.info('=== Démarrage Agent Local POS ===');

  // F-06: ne démarre les synchros qu'une fois la DB locale joignable,
  // et continue de réessayer indéfiniment sinon (jamais de crash bloquant)
  await waitForDatabase();

  scheduler.start();

  logger.info('Agent démarré et opérationnel');
}

module.exports = { main };

if (require.main === module) {
  process.on('unhandledRejection', (reason) => {
    logger.error('Rejection non gérée', { reason: String(reason) });
  });

  process.on('SIGINT', () => {
    logger.info('Arrêt de l\'agent (SIGINT)');
    process.exit(0);
  });

  main().catch((err) => {
    logger.error('Erreur fatale au démarrage', { error: err.message });
    process.exit(1);
  });
}

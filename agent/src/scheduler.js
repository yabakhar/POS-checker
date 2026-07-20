const config = require('./config');
const logger = require('./logger');
const tableWatcher = require('./tableWatcher');
const httpClient = require('./httpClient');

function start() {
  // Watch générique de tables (WATCHED_TABLES) : ne pousse que les lignes
  // nouvelles/modifiées depuis le dernier cycle, une table à la fois
  setInterval(async () => {
    try {
      const changes = await tableWatcher.collectChanges();
      for (const [table, rows] of Object.entries(changes)) {
        await httpClient.pushMetric(`table_sync:${table}`, rows);
      }
    } catch (err) {
      logger.error('Erreur cycle watch tables', { error: err.message });
    }
  }, config.sync.tablesSeconds * 1000);

  // Retry de la file d'attente hors ligne (F-06) : à la même cadence que retryIntervalSeconds
  setInterval(async () => {
    await httpClient.retryQueued();
  }, config.retryIntervalSeconds * 1000);

  logger.info('Scheduler démarré', {
    tables: `${config.sync.tablesSeconds}s`,
    retry: `${config.retryIntervalSeconds}s`,
  });
}

module.exports = { start };

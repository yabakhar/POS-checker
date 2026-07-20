const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const queue = require('./queue');

const http = axios.create({
  baseURL: config.cloudApiUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': config.shopToken, // F-05 / section 5.2: jamais en query string
  },
});

// Mode DRY_RUN : au lieu d'envoyer au cloud, on ajoute l'entrée dans un
// fichier JSON local. Permet de vérifier ce que l'agent collecte et ce
// qu'il enverrait au cloud, sans avoir de backend cloud prêt.
function saveDryRun(type, payload) {
  const dir = path.dirname(config.dryRunFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let existing = [];
  if (fs.existsSync(config.dryRunFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(config.dryRunFile, 'utf8'));
    } catch {
      existing = [];
    }
  }

  existing.push({
    type,
    data: payload,
    wouldSendAt: new Date().toISOString(),
    wouldSendTo: `${config.cloudApiUrl || '(URL cloud pas encore configurée)'}/api/agent/data`,
  });

  // Garde uniquement les 200 dernières entrées pour ne pas grossir indéfiniment
  const trimmed = existing.slice(-200);
  fs.writeFileSync(config.dryRunFile, JSON.stringify(trimmed, null, 2), 'utf8');
  logger.info(`[DRY_RUN] Sauvegardé localement au lieu d'envoyer: ${type}`, {
    file: config.dryRunFile,
  });
}

// Envoie un payload directement (utilisé aussi bien pour un envoi normal
// que pour vider la file d'attente). Retourne true/false, ne jette jamais.
async function send(type, payload) {
  if (config.dryRun) {
    saveDryRun(type, payload);
    return true;
  }

  try {
    await http.post('/api/agent/data', {
      type,
      data: payload,
      collectedAt: new Date().toISOString(),
    });
    logger.info(`Sync envoyée: ${type}`);
    return true;
  } catch (err) {
    const status = err.response ? err.response.status : 'NETWORK_ERROR';
    logger.error(`Echec envoi sync: ${type}`, { status, message: err.message });
    return false;
  }
}

// F-05/F-06: pousse un payload; en cas d'échec, le met en file d'attente
// pour retenter plus tard, sans jamais bloquer l'agent
async function pushMetric(type, payload) {
  if (!payload) return; // collecte a échoué en amont, rien à envoyer

  const ok = await send(type, payload);
  if (!ok) {
    queue.enqueue(type, payload);
  }
}

// Appelée périodiquement pour retenter les envois en attente (F-06)
async function retryQueued() {
  const pending = queue.size();
  if (pending === 0) return;
  logger.info(`Tentative de renvoi de la file d'attente`, { pending });
  await queue.flush(send);
}

module.exports = { pushMetric, retryQueued };

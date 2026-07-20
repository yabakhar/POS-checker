const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const queueDir = path.dirname(config.queueFile);

function ensureQueueFile() {
  if (!fs.existsSync(queueDir)) {
    fs.mkdirSync(queueDir, { recursive: true });
  }
  if (!fs.existsSync(config.queueFile)) {
    fs.writeFileSync(config.queueFile, '[]', 'utf8');
  }
}

function readQueue() {
  ensureQueueFile();
  try {
    const raw = fs.readFileSync(config.queueFile, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    logger.error('Queue corrompue, réinitialisation', { error: err.message });
    fs.writeFileSync(config.queueFile, '[]', 'utf8');
    return [];
  }
}

function writeQueue(items) {
  ensureQueueFile();
  fs.writeFileSync(config.queueFile, JSON.stringify(items, null, 2), 'utf8');
}

// Ajoute un payload qui n'a pas pu être envoyé (panne réseau/API)
function enqueue(type, payload) {
  const items = readQueue();
  items.push({
    type,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
  writeQueue(items);
  logger.warn('Payload mis en file d\'attente (hors ligne)', { type, queueSize: items.length });
}

function size() {
  return readQueue().length;
}

// Retente l'envoi de tout ce qui est en attente, via la fonction sendFn fournie
// sendFn(type, payload) doit retourner true si succès, false sinon
async function flush(sendFn) {
  const items = readQueue();
  if (items.length === 0) return { sent: 0, remaining: 0 };

  const remaining = [];
  let sent = 0;

  for (const item of items) {
    item.attempts += 1;
    const ok = await sendFn(item.type, item.payload).catch(() => false);
    if (ok) {
      sent += 1;
    } else {
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  if (sent > 0) {
    logger.info(`File d'attente vidée partiellement`, { sent, remaining: remaining.length });
  }
  return { sent, remaining: remaining.length };
}

module.exports = { enqueue, flush, size };

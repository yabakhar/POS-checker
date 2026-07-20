const mysql = require('mysql2/promise');
const config = require('./config');
const logger = require('./logger');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 10000,
    });
  }
  return pool;
}

// F-01: vérifie que la connexion MySQL locale fonctionne
async function testConnection() {
  const p = getPool();
  try {
    const conn = await p.getConnection();
    await conn.ping();
    conn.release();
    logger.info('Connexion MySQL locale OK', { host: config.db.host, database: config.db.database });
    return true;
  } catch (err) {
    logger.error('Echec connexion MySQL locale', { error: err.message });
    return false;
  }
}

async function query(sql, params = []) {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

module.exports = { getPool, testConnection, query };

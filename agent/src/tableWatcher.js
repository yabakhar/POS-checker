// Watch générique de tables : au lieu de requêtes SQL figées (voir collectors.js),
// permet de surveiller n'importe quelle table (choisie au `npm run setup`, ou
// WATCHED_TABLES=* pour toutes) et de ne remonter que les lignes nouvelles/modifiées
// depuis le dernier cycle, en comparant un hash par ligne à l'état sauvegardé
// localement (./data/table-state/<table>.json).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const config = require('./config');
const logger = require('./logger');

const stateDir = path.resolve('./data/table-state');

function ensureStateDir() {
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
}

function statePath(table) {
  return path.join(stateDir, `${table}.json`);
}

function loadState(table) {
  ensureStateDir();
  const p = statePath(table);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    logger.warn('État de table corrompu, réinitialisation', { table, error: err.message });
    return {};
  }
}

function saveState(table, state) {
  ensureStateDir();
  fs.writeFileSync(statePath(table), JSON.stringify(state), 'utf8');
}

function hashRow(row) {
  return crypto.createHash('sha1').update(JSON.stringify(row)).digest('hex');
}

// Sans clé primaire, la ligne s'identifie par son propre contenu (une
// modification apparaît alors comme une suppression + un ajout, faute de mieux).
function rowKey(row, pkCols) {
  if (pkCols.length === 0) return hashRow(row);
  return pkCols.map((c) => row[c]).join('|');
}

async function listAllTables() {
  const rows = await db.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
    [config.db.database]
  );
  return rows.map((r) => r.TABLE_NAME);
}

// Tables volontairement exclues quelle que soit la config WATCHED_TABLES
// (trop volumineuses / non pertinentes à synchroniser)
const IGNORED_TABLES = [
  'tbl_occupation',
  'tbl_langue_description',
  'test_1',
  'test_0',
  'tbl_type_glory',
  'tbl_type_article',
  'tbl_type_reglement',
  'tbl_parameters',
  'tbl_clavier_fonction',
  'tbl_fonctionnalites',
];

// N'autorise jamais un nom de table qui ne provient pas d'information_schema :
// ferme le risque d'injection SQL via WATCHED_TABLES (config locale).
async function resolveTables() {
  const configured = (config.watchedTables || '').trim();
  if (!configured) return [];

  const allTables = await listAllTables();
  if (configured === '*') return allTables.filter((t) => !IGNORED_TABLES.includes(t));

  const requested = configured.split(',').map((t) => t.trim()).filter(Boolean);
  const valid = requested.filter((t) => allTables.includes(t) && !IGNORED_TABLES.includes(t));
  const invalid = requested.filter((t) => !allTables.includes(t));
  if (invalid.length > 0) {
    logger.warn('WATCHED_TABLES: tables introuvables, ignorées', { invalid });
  }
  return valid;
}

async function getPrimaryKeyColumns(table) {
  const rows = await db.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_KEY = 'PRI'
     ORDER BY ORDINAL_POSITION`,
    [config.db.database, table]
  );
  return rows.map((r) => r.COLUMN_NAME);
}

// Retourne les lignes nouvelles ou modifiées depuis le dernier appel pour `table`.
async function diffTable(table) {
  const pkCols = await getPrimaryKeyColumns(table);
  const rows = await db.query(`SELECT * FROM \`${table}\``);
  const prevState = loadState(table);
  const nextState = {};
  const changed = [];

  for (const row of rows) {
    const key = rowKey(row, pkCols);
    const hash = hashRow(row);
    nextState[key] = hash;
    if (prevState[key] !== hash) {
      changed.push(row);
    }
  }

  saveState(table, nextState);
  return changed;
}

// Parcourt toutes les tables surveillées et retourne { table: [lignes changées] }
// (une table sans changement n'apparaît pas dans le résultat).
async function collectChanges() {
  const tables = await resolveTables();
  const result = {};

  for (const table of tables) {
    try {
      const changed = await diffTable(table);
      if (changed.length > 0) {
        result[table] = changed;
      }
    } catch (err) {
      logger.error(`Erreur watch table: ${table}`, { error: err.message });
    }
  }

  return result;
}

module.exports = { collectChanges, resolveTables };

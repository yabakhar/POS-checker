const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const pool = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');
const salesQueries = require('../services/salesQueries');

// Tables excluded everywhere in the client portal (too large / not relevant
// to display), even if older synced rows for them still exist in pos_data.
const IGNORED_TYPES = [
  'table_sync:tbl_occupation',
  'table_sync:tbl_langue_description',
  'table_sync:test_1',
  'table_sync:test_0',
  'table_sync:tbl_type_glory',
  'table_sync:tbl_type_article',
  'table_sync:tbl_type_reglement',
  'table_sync:tbl_parameters',
  'table_sync:tbl_clavier_fonction',
  'table_sync:tbl_fonctionnalites',
];
const IGNORED_TYPES_SQL = `data->>'type' != ALL('{${IGNORED_TYPES.join(',')}}'::text[])`;

// Local DB settings baked into the downloadable agent's .env. Only one MySQL
// instance is ever active at a time on port 3306 (2015/2025 installs are
// swapped in/out under the same C:\Clyo path), so port/dbName are shared —
// but each version has its own dedicated MySQL user/password.
// 2015 still uses root (legacy). 2025 uses a dedicated 'agentPos' user
// (see agent/sql/create-agentpos-user.sql) instead of root.
const AGENT_DB_CONFIG = { dbPort: 3306, dbName: 'dbclyo' };
const POS_VERSION_DB_CREDENTIALS = {
  '2015': { dbUser: 'root', dbPassword: '' },
  '2025': { dbUser: 'agentPos', dbPassword: '' },
};

const AGENT_DIST_DIR = process.env.AGENT_DIST_DIR || '/agent-dist';

function buildAgentEnv({ apiKey, dbUser, dbPassword }) {
  const cloudApiUrl = process.env.PUBLIC_API_URL || 'http://localhost:3001';
  return `SHOP_TOKEN=${apiKey}

DB_HOST=127.0.0.1
DB_PORT=${AGENT_DB_CONFIG.dbPort}
DB_USER=${dbUser}
DB_PASSWORD=${dbPassword}
DB_NAME=${AGENT_DB_CONFIG.dbName}

CLOUD_API_URL=${cloudApiUrl}

DRY_RUN=false
DRY_RUN_FILE=./data/test-output.json

WATCHED_TABLES=*

SYNC_TABLES_SECONDS=3600

RETRY_INTERVAL_SECONDS=60

LOG_LEVEL=info
LOG_DIR=./logs
`;
}

// Downloads a ready-to-run agent package (exe + installer + pre-filled .env
// with this client's own API key) for the chosen POS version.
router.get('/agent-package', verifyToken('client'), async (req, res) => {
  const version = req.query.version === '2025' ? '2025' : '2015';
  const { dbUser, dbPassword } = POS_VERSION_DB_CREDENTIALS[version];

  try {
    const result = await pool.query('SELECT api_key FROM clients WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found.' });
    const apiKey = result.rows[0].api_key;

    const exePath = path.join(AGENT_DIST_DIR, 'pos-agent.exe');
    const batPath = path.join(AGENT_DIST_DIR, 'INSTALLER.bat');
    if (!fs.existsSync(exePath) || !fs.existsSync(batPath)) {
      return res.status(503).json({ error: "Le package de l'agent n'est pas disponible pour le moment." });
    }

    res.attachment(`pos-agent-${version}.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.destroy(err);
    });
    archive.pipe(res);
    archive.file(exePath, { name: 'pos-agent.exe' });
    archive.file(batPath, { name: 'INSTALLER.bat' });
    archive.append(buildAgentEnv({ apiKey, dbUser, dbPassword }), { name: '.env' });

    if (version === '2025') {
      const resetUserBatPath = path.join(AGENT_DIST_DIR, 'reset-agentpos-user-2025.bat');
      if (fs.existsSync(resetUserBatPath)) {
        archive.file(resetUserBatPath, { name: 'reset-agentpos-user-2025.bat' });
      }
    }

    archive.finalize();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/dashboard', verifyToken('client'), async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const { tables, from, to } = req.query;

  const conditions = ['client_id = $1', IGNORED_TYPES_SQL];
  const params = [req.user.id];

  if (tables) {
    const types = tables.split(',').map((t) => `table_sync:${t.trim()}`).filter(Boolean);
    if (types.length > 0) {
      params.push(types);
      conditions.push(`data->>'type' = ANY($${params.length}::text[])`);
    }
  }
  if (from) {
    params.push(from);
    conditions.push(`received_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`received_at <= $${params.length}`);
  }

  const where = conditions.join(' AND ');

  try {
    const [data, count] = await Promise.all([
      pool.query(
        `SELECT id, data, received_at FROM pos_data WHERE ${where} ORDER BY received_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM pos_data WHERE ${where}`, params),
    ]);

    res.json({
      data: data.rows,
      total: parseInt(count.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Interactions grouped by day, respecting the same table/date filters as /dashboard
// (used to draw the "interactions over time" chart in the client portal)
router.get('/timeline', verifyToken('client'), async (req, res) => {
  const { tables, from, to } = req.query;

  const conditions = ['client_id = $1', IGNORED_TYPES_SQL];
  const params = [req.user.id];

  if (tables) {
    const types = tables.split(',').map((t) => `table_sync:${t.trim()}`).filter(Boolean);
    if (types.length > 0) {
      params.push(types);
      conditions.push(`data->>'type' = ANY($${params.length}::text[])`);
    }
  }
  if (from) {
    params.push(from);
    conditions.push(`received_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`received_at <= $${params.length}`);
  }

  const where = conditions.join(' AND ');

  try {
    const result = await pool.query(
      `SELECT
         TO_CHAR(received_at, 'YYYY-MM-DD') AS date,
         COUNT(*) AS interactions,
         COALESCE(SUM(jsonb_array_length(data->'data')), 0) AS rows_synced
       FROM pos_data
       WHERE ${where}
       GROUP BY date
       ORDER BY date ASC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Distinct tables synced for this client, with interaction count and last update
// (used to populate the table selector + sort-by-last-update in the client portal)
router.get('/tables', verifyToken('client'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         substring(data->>'type' from 12) AS table_name,
         COUNT(*) AS sync_count,
         COALESCE(SUM(jsonb_array_length(data->'data')), 0) AS total_rows,
         MAX(received_at) AS last_update
       FROM pos_data
       WHERE client_id = $1 AND data->>'type' LIKE 'table_sync:%' AND ${IGNORED_TYPES_SQL}
       GROUP BY table_name
       ORDER BY last_update DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/stats', verifyToken('client'), async (req, res) => {
  try {
    const [total, today, last] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM pos_data WHERE client_id = $1 AND ${IGNORED_TYPES_SQL}`, [req.user.id]),
      pool.query(`SELECT COUNT(*) FROM pos_data WHERE client_id = $1 AND received_at >= CURRENT_DATE AND ${IGNORED_TYPES_SQL}`, [req.user.id]),
      pool.query(`SELECT received_at FROM pos_data WHERE client_id = $1 AND ${IGNORED_TYPES_SQL} ORDER BY received_at DESC LIMIT 1`, [req.user.id]),
    ]);

    res.json({
      total_records: parseInt(total.rows[0].count),
      today_records: parseInt(today.rows[0].count),
      last_sync: last.rows[0]?.received_at || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Sales reports (Tableau de bord + Rapports et analyses), computed on the fly from the raw
// synced tables in pos_data — see backend/src/services/salesQueries.js for the query layer.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateRange(req, res) {
  const { from, to } = req.query;
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    res.status(400).json({ error: 'Paramètres from/to invalides (format attendu: YYYY-MM-DD).' });
    return null;
  }
  return { from, to };
}

router.get('/reports/summary', verifyToken('client'), async (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  try {
    res.json(await salesQueries.getDashboardSummary(req.user.id, range.from, range.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/sales-recap', verifyToken('client'), async (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  try {
    res.json(await salesQueries.getSalesRecap(req.user.id, range.from, range.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/sales-by-article', verifyToken('client'), async (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  try {
    res.json(await salesQueries.getSalesByArticle(req.user.id, range.from, range.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/sales-by-category', verifyToken('client'), async (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  try {
    res.json(await salesQueries.getSalesByCategory(req.user.id, range.from, range.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/sales-by-employee', verifyToken('client'), async (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  try {
    res.json(await salesQueries.getSalesByEmployee(req.user.id, range.from, range.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

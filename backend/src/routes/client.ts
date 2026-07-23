import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
// @types/archiver (as published for archiver@7) only declares the Archiver/ZipArchive/etc
// classes, not the callable `archiver('zip', opts)` factory the package actually exports at
// runtime — this local type annotation fills that gap instead of losing typing wholesale.
import type { Archiver, ArchiverOptions } from 'archiver';
const archiver: (format: string, options?: ArchiverOptions) => Archiver = require('archiver');
import prisma from '../config/prisma';
import { verifyToken } from '../middleware/authMiddleware';
import { validateQuery } from '../validation/validate';
import { dateRangeQuerySchema, DateRangeQuery } from '../validation/schemas';
import * as salesQueries from '../services/salesQueries';
import { startOfTodayUtc } from '../utils/date';

const router = express.Router();

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
// Raw-SQL equivalent, still needed by the /timeline and /tables routes below — those group
// by expressions (substring, jsonb_array_length) Prisma's query builder can't express.
const IGNORED_TYPES_SQL = `data->>'type' != ALL('{${IGNORED_TYPES.join(',')}}'::text[])`;

interface PosDataFilters {
  tables?: string;
  from?: string;
  to?: string;
}

// Shared `pos_data` filter (client scope + ignored tables + optional table/date filters) for
// the routes below that map cleanly onto Prisma's query builder (no computed GROUP BY needed).
function posDataWhere(clientId: string, { tables, from, to }: PosDataFilters = {}) {
  const AND: object[] = [
    { clientId },
    ...IGNORED_TYPES.map((t) => ({ data: { path: ['type'], not: t } })),
  ];

  if (tables) {
    const types = tables.split(',').map((t) => `table_sync:${t.trim()}`).filter(Boolean);
    if (types.length > 0) {
      AND.push({ OR: types.map((t) => ({ data: { path: ['type'], equals: t } })) });
    }
  }
  if (from) AND.push({ receivedAt: { gte: new Date(from) } });
  if (to) AND.push({ receivedAt: { lte: new Date(to) } });

  return { AND };
}

// Local DB settings baked into the downloadable agent's .env. Only one MySQL
// instance is ever active at a time on port 3306 (2015/2025 installs are
// swapped in/out under the same C:\Clyo path), so port/dbName are shared —
// but each version has its own dedicated MySQL user/password.
// 2015 still uses root (legacy). 2025 uses a dedicated 'agentPos' user
// (see agent/sql/create-agentpos-user.sql) instead of root.
const AGENT_DB_CONFIG = { dbPort: 3306, dbName: 'dbclyo' };
const POS_VERSION_DB_CREDENTIALS: Record<string, { dbUser: string; dbPassword: string }> = {
  '2015': { dbUser: 'root', dbPassword: '' },
  '2025': { dbUser: 'agentPos', dbPassword: '' },
};

const AGENT_DIST_DIR = process.env.AGENT_DIST_DIR || '/agent-dist';

function buildAgentEnv({ apiKey, dbUser, dbPassword }: { apiKey: string; dbUser: string; dbPassword: string }) {
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
router.get('/agent-package', verifyToken('client'), async (req: Request, res: Response) => {
  const version = req.query.version === '2025' ? '2025' : '2015';
  const { dbUser, dbPassword } = POS_VERSION_DB_CREDENTIALS[version];

  try {
    const client = await prisma.client.findUnique({ where: { id: req.user!.id }, select: { apiKey: true } });
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const apiKey = client.apiKey;

    const exePath = path.join(AGENT_DIST_DIR, 'pos-agent.exe');
    const batPath = path.join(AGENT_DIST_DIR, 'INSTALLER.bat');
    if (!fs.existsSync(exePath) || !fs.existsSync(batPath)) {
      return res.status(503).json({ error: "Le package de l'agent n'est pas disponible pour le moment." });
    }

    res.attachment(`pos-agent-${version}.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err: Error) => {
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

router.get('/dashboard', verifyToken('client'), async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = (page - 1) * limit;
  const where = posDataWhere(req.user!.id, req.query as PosDataFilters);

  try {
    const [rows, total] = await Promise.all([
      prisma.posData.findMany({
        where,
        select: { id: true, data: true, receivedAt: true },
        orderBy: { receivedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.posData.count({ where }),
    ]);

    res.json({
      data: rows.map((r) => ({ id: r.id, data: r.data, received_at: r.receivedAt })),
      total,
      page,
      limit,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Interactions grouped by day, respecting the same table/date filters as /dashboard
// (used to draw the "interactions over time" chart in the client portal). Grouping by a
// formatted date and summing jsonb_array_length isn't expressible via Prisma's query
// builder, so this one stays raw SQL — still fully parameterized ($1, $2, ...).
router.get('/timeline', verifyToken('client'), async (req: Request, res: Response) => {
  const { tables, from, to } = req.query as PosDataFilters;

  const conditions = ['client_id = $1::uuid', IGNORED_TYPES_SQL];
  const params: unknown[] = [req.user!.id];

  if (tables) {
    const types = tables.split(',').map((t) => `table_sync:${t.trim()}`).filter(Boolean);
    if (types.length > 0) {
      params.push(types);
      conditions.push(`data->>'type' = ANY($${params.length}::text[])`);
    }
  }
  if (from) {
    params.push(from);
    conditions.push(`received_at >= $${params.length}::timestamp`);
  }
  if (to) {
    params.push(to);
    conditions.push(`received_at <= $${params.length}::timestamp`);
  }

  const where = conditions.join(' AND ');

  try {
    const rows = await prisma.$queryRawUnsafe<{ date: string; interactions: bigint; rows_synced: bigint }[]>(
      `SELECT
         TO_CHAR(received_at, 'YYYY-MM-DD') AS date,
         COUNT(*) AS interactions,
         COALESCE(SUM(jsonb_array_length(data->'data')), 0) AS rows_synced
       FROM pos_data
       WHERE ${where}
       GROUP BY date
       ORDER BY date ASC`,
      ...params
    );
    res.json(rows.map((r) => ({ date: r.date, interactions: Number(r.interactions), rows_synced: Number(r.rows_synced) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Distinct tables synced for this client, with interaction count and last update
// (used to populate the table selector + sort-by-last-update in the client portal).
// Same reasoning as /timeline: substring() + jsonb_array_length() grouping can't be
// expressed through the query builder.
router.get('/tables', verifyToken('client'), async (req: Request, res: Response) => {
  try {
    const rows = await prisma.$queryRawUnsafe<{ table_name: string; sync_count: bigint; total_rows: bigint; last_update: Date }[]>(
      `SELECT
         substring(data->>'type' from 12) AS table_name,
         COUNT(*) AS sync_count,
         COALESCE(SUM(jsonb_array_length(data->'data')), 0) AS total_rows,
         MAX(received_at) AS last_update
       FROM pos_data
       WHERE client_id = $1::uuid AND data->>'type' LIKE 'table_sync:%' AND ${IGNORED_TYPES_SQL}
       GROUP BY table_name
       ORDER BY last_update DESC`,
      req.user!.id
    );
    res.json(rows.map((r) => ({
      table_name: r.table_name,
      sync_count: Number(r.sync_count),
      total_rows: Number(r.total_rows),
      last_update: r.last_update,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/stats', verifyToken('client'), async (req: Request, res: Response) => {
  try {
    const where = posDataWhere(req.user!.id);
    const todayWhere = { AND: [...where.AND, { receivedAt: { gte: startOfTodayUtc() } }] };

    const [total, today, last] = await Promise.all([
      prisma.posData.count({ where }),
      prisma.posData.count({ where: todayWhere }),
      prisma.posData.findFirst({ where, orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } }),
    ]);

    res.json({
      total_records: total,
      today_records: today,
      last_sync: last?.receivedAt || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Sales reports (Tableau de bord + Rapports et analyses), computed on the fly from the raw
// synced tables in pos_data — see backend/src/services/salesQueries.ts for the query layer.
type ReportRequest = Request<{}, {}, {}, DateRangeQuery>;

router.get('/reports/summary', verifyToken('client'), validateQuery(dateRangeQuerySchema), async (req: ReportRequest, res: Response) => {
  try {
    res.json(await salesQueries.getDashboardSummary(req.user!.id, req.query.from, req.query.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/sales-recap', verifyToken('client'), validateQuery(dateRangeQuerySchema), async (req: ReportRequest, res: Response) => {
  try {
    res.json(await salesQueries.getSalesRecap(req.user!.id, req.query.from, req.query.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/sales-by-article', verifyToken('client'), validateQuery(dateRangeQuerySchema), async (req: ReportRequest, res: Response) => {
  try {
    res.json(await salesQueries.getSalesByArticle(req.user!.id, req.query.from, req.query.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/sales-by-category', verifyToken('client'), validateQuery(dateRangeQuerySchema), async (req: ReportRequest, res: Response) => {
  try {
    res.json(await salesQueries.getSalesByCategory(req.user!.id, req.query.from, req.query.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/sales-by-employee', verifyToken('client'), validateQuery(dateRangeQuerySchema), async (req: ReportRequest, res: Response) => {
  try {
    res.json(await salesQueries.getSalesByEmployee(req.user!.id, req.query.from, req.query.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/taxes', verifyToken('client'), validateQuery(dateRangeQuerySchema), async (req: ReportRequest, res: Response) => {
  try {
    res.json(await salesQueries.getTaxesReport(req.user!.id, req.query.from, req.query.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/payment-methods', verifyToken('client'), validateQuery(dateRangeQuerySchema), async (req: ReportRequest, res: Response) => {
  try {
    res.json(await salesQueries.getPaymentMethodsReport(req.user!.id, req.query.from, req.query.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/work-periods', verifyToken('client'), validateQuery(dateRangeQuerySchema), async (req: ReportRequest, res: Response) => {
  try {
    res.json(await salesQueries.getWorkPeriodsReport(req.user!.id, req.query.from, req.query.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/timeclock', verifyToken('client'), validateQuery(dateRangeQuerySchema), async (req: ReportRequest, res: Response) => {
  try {
    res.json(await salesQueries.getTimeclockReport(req.user!.id, req.query.from, req.query.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/reports/cash-movements', verifyToken('client'), validateQuery(dateRangeQuerySchema), async (req: ReportRequest, res: Response) => {
  try {
    res.json(await salesQueries.getCashMovementsReport(req.user!.id, req.query.from, req.query.to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;

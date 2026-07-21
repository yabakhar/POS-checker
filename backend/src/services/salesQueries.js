const pool = require('../config/db');

// Every synced MySQL row is stored as a JSONB blob: { type: 'table_sync:<table>', data: [row, ...] }.
// The agent does DIFF sync (agent/src/tableWatcher.js) — the same row (same primary key) can appear
// in several pos_data records over time if it changes later (e.g. a ticket line gets refunded,
// chp_etatl flips 'N' -> 'R'). So every query must keep only the most recent version per primary
// key: DISTINCT ON (pk) ordered by received_at DESC does exactly that ("first row per group" after
// the sort = latest received_at for that pk).
function latestRowsCTE(cteName, tableType, pkField, selectFields) {
  return `${cteName} AS (
    SELECT DISTINCT ON (row->>'${pkField}')
      ${selectFields.join(',\n      ')}
    FROM pos_data pd, jsonb_array_elements(pd.data->'data') AS row
    WHERE pd.client_id = $1 AND pd.data->>'type' = 'table_sync:${tableType}'
    ORDER BY row->>'${pkField}', pd.received_at DESC
  )`;
}

const CTE_ENTETE = latestRowsCTE('latest_entete', 'note_entete', 'id_note', [
  `row->>'id_note' AS id_note`,
  `(row->>'total')::numeric AS total`,
  `(row->>'chp_date')::date AS chp_date`,
  `row->>'numeroserveur' AS numeroserveur`,
]);

const CTE_DETAIL = latestRowsCTE('latest_detail', 'note_detail', 'id_note_detail', [
  `row->>'id_note_detail' AS id_note_detail`,
  `row->>'id_note' AS id_note`,
  `(row->>'num_des_coresp')::int AS num_des_coresp`,
  `(row->>'chp_qt')::numeric AS chp_qt`,
  `(row->>'chp_pv')::numeric AS chp_pv`,
  `row->>'chp_etatl' AS chp_etatl`,
  `(row->>'chp_date')::date AS chp_date`,
]);

const CTE_CORRES = latestRowsCTE('latest_corres', 'corres_des', 'des_coresp', [
  `(row->>'des_coresp')::int AS des_coresp`,
  `row->>'chp_des' AS chp_des`,
  `row->>'chp_fam' AS chp_fam`,
]);

const CTE_FAMILLE = latestRowsCTE('latest_famille', 'tbl_famille', 'num_fam', [
  `row->>'num_fam' AS num_fam`,
  `row->>'des' AS des`,
]);

const CTE_USERS = latestRowsCTE('latest_users', 'tbl_users', 'num_user', [
  `row->>'num_user' AS num_user`,
  `row->>'nom_user' AS nom_user`,
]);

// Revenue = chp_qt * chp_pv. chp_pv is the unit price actually charged (already reflects any
// per-line discount) — tx_remise is not additionally applied on top, that would double-discount.
// Sample data has no non-zero-discount rows to verify this against; spot-check against a real
// discounted ticket before relying on this in production.
const WEEKDAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function defaultRange(from, to) {
  const today = new Date().toISOString().slice(0, 10);
  return { from: from || today, to: to || today };
}

async function getDashboardSummary(clientId, from, to) {
  const range = defaultRange(from, to);

  const kpiSql = `
    WITH ${CTE_ENTETE}, ${CTE_DETAIL}
    SELECT
      COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS total_revenue,
      COUNT(DISTINCT d.id_note) AS ticket_count
    FROM latest_detail d
    JOIN latest_entete e ON e.id_note = d.id_note
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2 AND $3
  `;

  const dailySql = `
    WITH ${CTE_ENTETE}, ${CTE_DETAIL}
    SELECT d.chp_date AS date, COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS revenue
    FROM latest_detail d
    JOIN latest_entete e ON e.id_note = d.id_note
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2 AND $3
    GROUP BY d.chp_date
    ORDER BY d.chp_date ASC
  `;

  const weekdaySql = `
    WITH ${CTE_ENTETE}, ${CTE_DETAIL}
    SELECT EXTRACT(ISODOW FROM d.chp_date)::int AS dow, COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS revenue
    FROM latest_detail d
    JOIN latest_entete e ON e.id_note = d.id_note
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2 AND $3
    GROUP BY dow
  `;

  const categorySql = `
    WITH ${CTE_DETAIL}, ${CTE_CORRES}, ${CTE_FAMILLE}
    SELECT COALESCE(f.des, 'Non classé') AS category_name, COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS revenue
    FROM latest_detail d
    LEFT JOIN latest_corres c ON c.des_coresp = d.num_des_coresp
    LEFT JOIN latest_famille f ON f.num_fam = c.chp_fam
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2 AND $3
    GROUP BY category_name
    ORDER BY revenue DESC
  `;

  const params = [clientId, range.from, range.to];
  const [kpiRes, dailyRes, weekdayRes, categoryRes] = await Promise.all([
    pool.query(kpiSql, params),
    pool.query(dailySql, params),
    pool.query(weekdaySql, params),
    pool.query(categorySql, params),
  ]);

  const totalRevenue = Number(kpiRes.rows[0].total_revenue);
  const ticketCount = Number(kpiRes.rows[0].ticket_count);

  const weekdayByDow = new Map(weekdayRes.rows.map((r) => [r.dow, Number(r.revenue)]));
  const revenueByWeekday = WEEKDAYS_FR.map((weekday, i) => ({
    weekday,
    revenue: weekdayByDow.get(i + 1) || 0,
  }));

  return {
    kpis: {
      total_revenue: totalRevenue,
      ticket_count: ticketCount,
      avg_ticket: ticketCount > 0 ? totalRevenue / ticketCount : 0,
    },
    daily_revenue: dailyRes.rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), revenue: Number(r.revenue) })),
    revenue_by_weekday: revenueByWeekday,
    revenue_by_category: categoryRes.rows.map((r) => ({ category_name: r.category_name, revenue: Number(r.revenue) })),
  };
}

async function getSalesRecap(clientId, from, to) {
  const range = defaultRange(from, to);

  const totalsSql = `
    WITH ${CTE_ENTETE}, ${CTE_DETAIL}
    SELECT
      COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS total_revenue,
      COUNT(DISTINCT d.id_note) AS ticket_count,
      COALESCE(SUM(d.chp_qt), 0) AS total_qty
    FROM latest_detail d
    JOIN latest_entete e ON e.id_note = d.id_note
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2 AND $3
  `;

  const byDaySql = `
    WITH ${CTE_ENTETE}, ${CTE_DETAIL}
    SELECT
      d.chp_date AS date,
      COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS revenue,
      COUNT(DISTINCT d.id_note) AS ticket_count,
      COALESCE(SUM(d.chp_qt), 0) AS qty
    FROM latest_detail d
    JOIN latest_entete e ON e.id_note = d.id_note
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2 AND $3
    GROUP BY d.chp_date
    ORDER BY d.chp_date ASC
  `;

  const params = [clientId, range.from, range.to];
  const [totalsRes, byDayRes] = await Promise.all([
    pool.query(totalsSql, params),
    pool.query(byDaySql, params),
  ]);

  const totalRevenue = Number(totalsRes.rows[0].total_revenue);
  const ticketCount = Number(totalsRes.rows[0].ticket_count);

  return {
    total_revenue: totalRevenue,
    ticket_count: ticketCount,
    avg_ticket: ticketCount > 0 ? totalRevenue / ticketCount : 0,
    total_qty: Number(totalsRes.rows[0].total_qty),
    by_day: byDayRes.rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      revenue: Number(r.revenue),
      ticket_count: Number(r.ticket_count),
      qty: Number(r.qty),
    })),
  };
}

async function getSalesByArticle(clientId, from, to) {
  const range = defaultRange(from, to);
  const sql = `
    WITH ${CTE_DETAIL}, ${CTE_CORRES}
    SELECT
      COALESCE(c.chp_des, d.id_note_detail) AS article_name,
      COALESCE(SUM(d.chp_qt), 0) AS qty,
      COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS revenue
    FROM latest_detail d
    LEFT JOIN latest_corres c ON c.des_coresp = d.num_des_coresp
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2 AND $3
    GROUP BY article_name
    ORDER BY revenue DESC
  `;
  const res = await pool.query(sql, [clientId, range.from, range.to]);
  return res.rows.map((r) => ({ article_name: r.article_name, qty: Number(r.qty), revenue: Number(r.revenue) }));
}

async function getSalesByCategory(clientId, from, to) {
  const range = defaultRange(from, to);
  const sql = `
    WITH ${CTE_DETAIL}, ${CTE_CORRES}, ${CTE_FAMILLE}
    SELECT
      COALESCE(f.des, 'Non classé') AS category_name,
      COALESCE(SUM(d.chp_qt), 0) AS qty,
      COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS revenue
    FROM latest_detail d
    LEFT JOIN latest_corres c ON c.des_coresp = d.num_des_coresp
    LEFT JOIN latest_famille f ON f.num_fam = c.chp_fam
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2 AND $3
    GROUP BY category_name
    ORDER BY revenue DESC
  `;
  const res = await pool.query(sql, [clientId, range.from, range.to]);
  const rows = res.rows.map((r) => ({ category_name: r.category_name, qty: Number(r.qty), revenue: Number(r.revenue) }));
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  return rows.map((r) => ({ ...r, pct_of_total: total > 0 ? (r.revenue / total) * 100 : 0 }));
}

async function getSalesByEmployee(clientId, from, to) {
  const range = defaultRange(from, to);
  const sql = `
    WITH ${CTE_ENTETE}, ${CTE_DETAIL}, ${CTE_USERS}
    SELECT
      COALESCE(u.nom_user, 'Employé ' || e.numeroserveur) AS employee_name,
      COUNT(DISTINCT d.id_note) AS ticket_count,
      COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS revenue
    FROM latest_detail d
    JOIN latest_entete e ON e.id_note = d.id_note
    LEFT JOIN latest_users u ON u.num_user = e.numeroserveur
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2 AND $3
    GROUP BY employee_name
    ORDER BY revenue DESC
  `;
  const res = await pool.query(sql, [clientId, range.from, range.to]);
  return res.rows.map((r) => {
    const ticketCount = Number(r.ticket_count);
    const revenue = Number(r.revenue);
    return {
      employee_name: r.employee_name,
      ticket_count: ticketCount,
      revenue,
      avg_ticket: ticketCount > 0 ? revenue / ticketCount : 0,
    };
  });
}

module.exports = {
  getDashboardSummary,
  getSalesRecap,
  getSalesByArticle,
  getSalesByCategory,
  getSalesByEmployee,
};

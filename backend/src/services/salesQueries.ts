import prisma from '../config/prisma';
import { todayInBusinessTz } from '../utils/date';

// Every query in this file goes through prisma.$queryRawUnsafe rather than the Prisma query
// builder, on purpose: they all run jsonb_array_elements() over the `pos_data.data` JSONB blob
// with dynamically-composed CTEs (see latestRowsCTE below), which has no equivalent in Prisma's
// model-based API. All CTE/column names interpolated into the SQL below come from hardcoded
// constants in this file, never from request input — every actual value (client id, date range)
// is passed as a real bound parameter ($1, $2, ...), so this stays injection-safe the same way
// the raw `pg` version was. Row shapes coming back are intentionally typed loosely (any[]) —
// this file is the documented raw-SQL escape hatch, not a place to fight the type system.
//
// Every synced MySQL row is stored as a JSONB blob: { type: 'table_sync:<table>', data: [row, ...] }.
// The agent does DIFF sync (agent/src/tableWatcher.js) — the same row (same primary key) can appear
// in several pos_data records over time if it changes later (e.g. a ticket line gets refunded,
// chp_etatl flips 'N' -> 'R'). So every query must keep only the most recent version per primary
// key: DISTINCT ON (pk) ordered by received_at DESC does exactly that ("first row per group" after
// the sort = latest received_at for that pk).
function latestRowsCTE(cteName: string, tableType: string, pkField: string, selectFields: string[]): string {
  return `${cteName} AS (
    SELECT DISTINCT ON (row->>'${pkField}')
      ${selectFields.join(',\n      ')}
    FROM pos_data pd, jsonb_array_elements(pd.data->'data') AS row
    WHERE pd.client_id = $1::uuid AND pd.data->>'type' = 'table_sync:${tableType}'
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

const CTE_TVA_TICKET = latestRowsCTE('latest_tva_ticket', 'tva_par_ticket', 'id_ticket', [
  `row->>'id_ticket' AS id_ticket`,
  `(row->>'tx_tva')::numeric AS tx_tva`,
  `(row->>'mont_ht')::numeric AS mont_ht`,
  `(row->>'mont_tva')::numeric AS mont_tva`,
  `(row->>'mont_ttc')::numeric AS mont_ttc`,
]);

const CTE_CLOTURE = latestRowsCTE('latest_cloture', 'tbl_cloture', 'num_cloture', [
  `(row->>'num_cloture')::int AS num_cloture`,
  `(row->>'journee_cloture')::date AS journee_cloture`,
  `row->>'date_cloture' AS date_cloture`,
  `(row->>'etat_cloture')::int AS etat_cloture`,
  `(row->>'export_compta')::int AS export_compta`,
]);

// caisse_fichier is a daily till-summary row (one per chp_date, this shop only ever has
// num_magasin/chp_num = 1 so we key latest-row-per-day on chp_date alone).
const CTE_CAISSE = `latest_caisse AS (
  SELECT DISTINCT ON (row->>'chp_date')
    (row->>'chp_date')::date AS chp_date,
    (row->>'chp_esp')::numeric AS esp,
    (row->>'chp_chq')::numeric AS chq,
    (row->>'chp_cdj')::numeric AS cdj,
    (row->>'chp_cb')::numeric AS cb,
    (row->>'chp_amex')::numeric AS amex,
    (row->>'chp_din')::numeric AS din,
    (row->>'chp_jcb')::numeric AS jcb,
    (row->>'chp_inv')::numeric AS inv,
    (row->>'chp_remi')::numeric AS remi,
    (row->>'chp_mais')::numeric AS mais,
    (row->>'chp_cpt')::numeric AS cpt,
    (row->>'chp_reg16')::numeric AS reg16,
    (row->>'chp_reg17')::numeric AS reg17,
    (row->>'chp_reg18')::numeric AS reg18,
    (row->>'chp_reg19')::numeric AS reg19,
    (row->>'chp_reg20')::numeric AS reg20,
    (row->>'chp_reg21')::numeric AS reg21,
    (row->>'chp_reg22')::numeric AS reg22,
    (COALESCE((row->>'chp_LIT')::numeric, 0) + COALESCE((row->>'chp_cpt_deb')::numeric, 0)
      + COALESCE((row->>'chp_lib1')::numeric, 0) + COALESCE((row->>'chp_lib2')::numeric, 0)
      + COALESCE((row->>'chp_lib3')::numeric, 0)) AS autres
  FROM pos_data pd, jsonb_array_elements(pd.data->'data') AS row
  WHERE pd.client_id = $1::uuid AND pd.data->>'type' = 'table_sync:caisse_fichier'
  ORDER BY row->>'chp_date', pd.received_at DESC
)`;

// Revenue = chp_qt * chp_pv. chp_pv is the unit price actually charged (already reflects any
// per-line discount) — tx_remise is not additionally applied on top, that would double-discount.
// Sample data has no non-zero-discount rows to verify this against; spot-check against a real
// discounted ticket before relying on this in production.
const WEEKDAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function defaultRange(from?: string, to?: string) {
  const today = todayInBusinessTz();
  return { from: from || today, to: to || today };
}

export async function getDashboardSummary(clientId: string, from?: string, to?: string) {
  const range = defaultRange(from, to);

  const kpiSql = `
    WITH ${CTE_ENTETE}, ${CTE_DETAIL}
    SELECT
      COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS total_revenue,
      COUNT(DISTINCT d.id_note) AS ticket_count
    FROM latest_detail d
    JOIN latest_entete e ON e.id_note = d.id_note
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2::date AND $3::date
  `;

  const dailySql = `
    WITH ${CTE_ENTETE}, ${CTE_DETAIL}
    SELECT d.chp_date AS date, COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS revenue
    FROM latest_detail d
    JOIN latest_entete e ON e.id_note = d.id_note
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2::date AND $3::date
    GROUP BY d.chp_date
    ORDER BY d.chp_date ASC
  `;

  const weekdaySql = `
    WITH ${CTE_ENTETE}, ${CTE_DETAIL}
    SELECT EXTRACT(ISODOW FROM d.chp_date)::int AS dow, COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS revenue
    FROM latest_detail d
    JOIN latest_entete e ON e.id_note = d.id_note
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2::date AND $3::date
    GROUP BY dow
  `;

  const categorySql = `
    WITH ${CTE_DETAIL}, ${CTE_CORRES}, ${CTE_FAMILLE}
    SELECT COALESCE(f.des, 'Non classé') AS category_name, COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS revenue
    FROM latest_detail d
    LEFT JOIN latest_corres c ON c.des_coresp = d.num_des_coresp
    LEFT JOIN latest_famille f ON f.num_fam = c.chp_fam
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2::date AND $3::date
    GROUP BY category_name
    ORDER BY revenue DESC
  `;

  const params = [clientId, range.from, range.to];
  const [kpiRows, dailyRows, weekdayRows, categoryRows] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(kpiSql, ...params),
    prisma.$queryRawUnsafe<any[]>(dailySql, ...params),
    prisma.$queryRawUnsafe<any[]>(weekdaySql, ...params),
    prisma.$queryRawUnsafe<any[]>(categorySql, ...params),
  ]);

  const totalRevenue = Number(kpiRows[0].total_revenue);
  const ticketCount = Number(kpiRows[0].ticket_count);

  const weekdayByDow = new Map(weekdayRows.map((r) => [r.dow, Number(r.revenue)]));
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
    daily_revenue: dailyRows.map((r) => ({ date: r.date.toISOString().slice(0, 10), revenue: Number(r.revenue) })),
    revenue_by_weekday: revenueByWeekday,
    revenue_by_category: categoryRows.map((r) => ({ category_name: r.category_name, revenue: Number(r.revenue) })),
  };
}

export async function getSalesRecap(clientId: string, from?: string, to?: string) {
  const range = defaultRange(from, to);

  const totalsSql = `
    WITH ${CTE_ENTETE}, ${CTE_DETAIL}
    SELECT
      COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS total_revenue,
      COUNT(DISTINCT d.id_note) AS ticket_count,
      COALESCE(SUM(d.chp_qt), 0) AS total_qty
    FROM latest_detail d
    JOIN latest_entete e ON e.id_note = d.id_note
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2::date AND $3::date
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
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2::date AND $3::date
    GROUP BY d.chp_date
    ORDER BY d.chp_date ASC
  `;

  const params = [clientId, range.from, range.to];
  const [totalsRows, byDayRows] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(totalsSql, ...params),
    prisma.$queryRawUnsafe<any[]>(byDaySql, ...params),
  ]);

  const totalRevenue = Number(totalsRows[0].total_revenue);
  const ticketCount = Number(totalsRows[0].ticket_count);

  return {
    total_revenue: totalRevenue,
    ticket_count: ticketCount,
    avg_ticket: ticketCount > 0 ? totalRevenue / ticketCount : 0,
    total_qty: Number(totalsRows[0].total_qty),
    by_day: byDayRows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      revenue: Number(r.revenue),
      ticket_count: Number(r.ticket_count),
      qty: Number(r.qty),
    })),
  };
}

export async function getSalesByArticle(clientId: string, from?: string, to?: string) {
  const range = defaultRange(from, to);
  const sql = `
    WITH ${CTE_DETAIL}, ${CTE_CORRES}
    SELECT
      COALESCE(c.chp_des, d.id_note_detail) AS article_name,
      COALESCE(SUM(d.chp_qt), 0) AS qty,
      COALESCE(SUM(d.chp_qt * d.chp_pv), 0) AS revenue
    FROM latest_detail d
    LEFT JOIN latest_corres c ON c.des_coresp = d.num_des_coresp
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2::date AND $3::date
    GROUP BY article_name
    ORDER BY revenue DESC
  `;
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, clientId, range.from, range.to);
  return rows.map((r) => ({ article_name: r.article_name, qty: Number(r.qty), revenue: Number(r.revenue) }));
}

export async function getSalesByCategory(clientId: string, from?: string, to?: string) {
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
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2::date AND $3::date
    GROUP BY category_name
    ORDER BY revenue DESC
  `;
  const rawRows = await prisma.$queryRawUnsafe<any[]>(sql, clientId, range.from, range.to);
  const rows = rawRows.map((r) => ({ category_name: r.category_name, qty: Number(r.qty), revenue: Number(r.revenue) }));
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  return rows.map((r) => ({ ...r, pct_of_total: total > 0 ? (r.revenue / total) * 100 : 0 }));
}

export async function getSalesByEmployee(clientId: string, from?: string, to?: string) {
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
    WHERE d.chp_etatl = 'N' AND d.chp_date BETWEEN $2::date AND $3::date
    GROUP BY employee_name
    ORDER BY revenue DESC
  `;
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, clientId, range.from, range.to);
  return rows.map((r) => {
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

export async function getTaxesReport(clientId: string, from?: string, to?: string) {
  const range = defaultRange(from, to);
  const sql = `
    WITH ${CTE_TVA_TICKET}, ${CTE_ENTETE}
    SELECT
      t.tx_tva AS vat_rate,
      COUNT(DISTINCT t.id_ticket) AS ticket_count,
      COALESCE(SUM(t.mont_ht), 0) AS total_ht,
      COALESCE(SUM(t.mont_tva), 0) AS total_tva,
      COALESCE(SUM(t.mont_ttc), 0) AS total_ttc
    FROM latest_tva_ticket t
    JOIN latest_entete e ON e.id_note = t.id_ticket
    WHERE e.chp_date BETWEEN $2::date AND $3::date
    GROUP BY vat_rate
    ORDER BY vat_rate DESC
  `;
  const rawRows = await prisma.$queryRawUnsafe<any[]>(sql, clientId, range.from, range.to);
  const rows = rawRows.map((r) => ({
    vat_rate: Number(r.vat_rate),
    ticket_count: Number(r.ticket_count),
    total_ht: Number(r.total_ht),
    total_tva: Number(r.total_tva),
    total_ttc: Number(r.total_ttc),
  }));
  return {
    rows,
    totals: rows.reduce((acc, r) => ({
      total_ht: acc.total_ht + r.total_ht,
      total_tva: acc.total_tva + r.total_tva,
      total_ttc: acc.total_ttc + r.total_ttc,
    }), { total_ht: 0, total_tva: 0, total_ttc: 0 }),
  };
}

// Column -> label mapping below is inferred from column-name semantics (chp_esp = Espèces,
// chp_cdj = Chèque Déjeuner = Ticket Restaurant, etc.), cross-checked against the current
// tbl_les_reglement rows where possible (num_regl 16-22 line up exactly, in order, with
// Deliveroo/Uber Eats/CB Borne/CB EatSelf/Avoir/Fidélité/Bon Cadeau). A few columns
// (chp_din, chp_inv) don't have a fully confirmed current-day match — corresp_paym (last
// touched 2010) says chp_din = Diners, but the live tbl_les_reglement now has num_regl 6
// relabeled "Virement" (inactive/etat=0 though, so unlikely to carry real amounts). Columns
// with no confident mapping at all (chp_LIT, chp_cpt_deb, chp_lib1-3) are bucketed into
// "Autres". Worth spot-checking against a real till closing before fully trusting the labels.
const PAYMENT_METHOD_LABELS: [string, string][] = [
  ['esp', 'Espèces'],
  ['chq', 'Chèques'],
  ['cdj', 'Ticket Restaurant'],
  ['cb', 'Carte Bleue'],
  ['amex', 'Amex'],
  ['din', 'Diners'],
  ['jcb', 'JCB'],
  ['inv', 'Invitation'],
  ['remi', 'Remises'],
  ['mais', 'Maison'],
  ['cpt', 'Compte client'],
  ['reg16', 'Deliveroo'],
  ['reg17', 'Uber Eats'],
  ['reg18', 'CB Borne'],
  ['reg19', 'CB EatSelf'],
  ['reg20', 'Avoir'],
  ['reg21', 'Fidélité'],
  ['reg22', 'Bon Cadeau'],
  ['autres', 'Autres'],
];

export async function getPaymentMethodsReport(clientId: string, from?: string, to?: string) {
  const range = defaultRange(from, to);
  const sql = `
    WITH ${CTE_CAISSE}
    SELECT
      ${PAYMENT_METHOD_LABELS.map(([key]) => `COALESCE(SUM(${key}), 0) AS ${key}`).join(',\n      ')}
    FROM latest_caisse
    WHERE chp_date BETWEEN $2::date AND $3::date
  `;
  const rawRows = await prisma.$queryRawUnsafe<any[]>(sql, clientId, range.from, range.to);
  const totals = rawRows[0];

  const rows = PAYMENT_METHOD_LABELS
    .map(([key, label]) => ({ method: label, amount: Number(totals[key]) }))
    .filter((r) => r.amount !== 0)
    .sort((a, b) => b.amount - a.amount);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return rows.map((r) => ({ ...r, pct_of_total: total > 0 ? (r.amount / total) * 100 : 0 }));
}

// etat_cloture: only value 2 ("Clôturée") has actually been observed in synced data so far —
// other codes are shown as-is rather than guessed at.
const CLOTURE_ETAT_LABELS: Record<number, string> = { 2: 'Clôturée' };

export async function getWorkPeriodsReport(clientId: string, from?: string, to?: string) {
  const range = defaultRange(from, to);
  const sql = `
    WITH ${CTE_CLOTURE}
    SELECT num_cloture, journee_cloture, date_cloture, etat_cloture, export_compta
    FROM latest_cloture
    WHERE journee_cloture BETWEEN $2::date AND $3::date
    ORDER BY journee_cloture DESC
  `;
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, clientId, range.from, range.to);
  return rows.map((r) => ({
    num_cloture: r.num_cloture,
    journee: r.journee_cloture.toISOString().slice(0, 10),
    date_cloture: r.date_cloture,
    etat: CLOTURE_ETAT_LABELS[r.etat_cloture] || `État ${r.etat_cloture}`,
    export_compta: r.export_compta === 1,
  }));
}

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

// tbl_users_fixe is the real staff directory ("1-SAID", "2-BRAHIM", ...). It has two different
// id columns: num_user (its own internal primary key) and log_user (the short POS terminal
// login/server number). ne_fichier.chp_serv and tbl_pointeuse.id_serveur are both that same
// login/server number — NOT num_user — confirmed by cross-checking the actual chp_serv/
// id_serveur values in synced data against each column's range (they land squarely in
// log_user's 0-36 range, not num_user's set of internal ids). Joining on num_user instead
// (an earlier version of this file did) silently attributes sales/punches to the wrong
// employee rather than falling back to "unknown" — worse than no name at all, so there's no
// tbl_users fallback here either: that table only has num_user, no log_user, so it can't be
// joined against chp_serv/id_serveur any more reliably than tbl_users_fixe.num_user could.
const CTE_USERS_FIXE = latestRowsCTE('latest_users_fixe', 'tbl_users_fixe', 'num_user', [
  `row->>'log_user' AS log_user`,
  // Source names occasionally contain a stray C1 control character (0x96, a mis-decoded
  // Windows-1252 dash) in place of a hyphen, e.g. "7\x96MARIA" instead of "7-MARIA".
  `regexp_replace(row->>'nom_user', chr(150), '-', 'g') AS nom_user`,
]);

const CTE_POINTEUSE = latestRowsCTE('latest_pointeuse', 'tbl_pointeuse', 'id_pointage', [
  `row->>'id_pointage' AS id_pointage`,
  `row->>'id_serveur' AS id_serveur`,
  `(row->>'chp_date')::date AS chp_date`,
  `(row->>'date_heure_demarre')::timestamp AS date_heure_demarre`,
  `NULLIF(row->>'date_heure_arret', '')::timestamp AS date_heure_arret`,
  `(row->>'etat_pointage')::int AS etat_pointage`,
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

// ne_fichier / ne_fichier_day are the POS's finalized per-ticket sales log — as opposed to the
// draft note_entete/note_detail pair used elsewhere in this file, these carry the actual
// payment-method breakdown (chp_reg1..chp_reg22, one column per row in tbl_les_reglement) and
// the serving employee (chp_serv), and update the moment a ticket is settled rather than only
// at end-of-day closure (unlike caisse_fichier, which used to back the payment-methods report
// and only ever has a row for days that have already been clôturées).
// ne_fichier_day holds a live rolling window of recent tickets that mirrors into ne_fichier once
// the day closes, so the two overlap on ticket ids still in that window — UNION the two and take
// one row per chp_primary (latest received_at wins) to get a clean per-ticket set.
// chp_etat: 'S' (Soldé) is a real settled sale; 'N' rows carry a negative chp_mont and are
// cancellations/voids, excluded everywhere below.
const CTE_NE_FICHIER = `latest_ne_fichier AS (
  SELECT DISTINCT ON (chp_primary)
    chp_primary, chp_date, chp_serv, chp_etat, chp_mont,
    reg1, reg2, reg3, reg4, reg5, reg6, reg7, reg8, reg9, reg10,
    reg11, reg12, reg13, reg14, reg15, reg16, reg17, reg18, reg19, reg20, reg21, reg22
  FROM (
    SELECT
      pd.received_at,
      row->>'chp_primary' AS chp_primary,
      (row->>'chp_date')::date AS chp_date,
      row->>'chp_serv' AS chp_serv,
      row->>'chp_etat' AS chp_etat,
      (row->>'chp_mont')::numeric AS chp_mont,
      (row->>'chp_reg1')::numeric AS reg1, (row->>'chp_reg2')::numeric AS reg2,
      (row->>'chp_reg3')::numeric AS reg3, (row->>'chp_reg4')::numeric AS reg4,
      (row->>'chp_reg5')::numeric AS reg5, (row->>'chp_reg6')::numeric AS reg6,
      (row->>'chp_reg7')::numeric AS reg7, (row->>'chp_reg8')::numeric AS reg8,
      (row->>'chp_reg9')::numeric AS reg9, (row->>'chp_reg10')::numeric AS reg10,
      (row->>'chp_reg11')::numeric AS reg11, (row->>'chp_reg12')::numeric AS reg12,
      (row->>'chp_reg13')::numeric AS reg13, (row->>'chp_reg14')::numeric AS reg14,
      (row->>'chp_reg15')::numeric AS reg15, (row->>'chp_reg16')::numeric AS reg16,
      (row->>'chp_reg17')::numeric AS reg17, (row->>'chp_reg18')::numeric AS reg18,
      (row->>'chp_reg19')::numeric AS reg19, (row->>'chp_reg20')::numeric AS reg20,
      (row->>'chp_reg21')::numeric AS reg21, (row->>'chp_reg22')::numeric AS reg22
    FROM pos_data pd, jsonb_array_elements(pd.data->'data') AS row
    WHERE pd.client_id = $1::uuid AND pd.data->>'type' IN ('table_sync:ne_fichier', 'table_sync:ne_fichier_day')
  ) t
  ORDER BY chp_primary, received_at DESC
)`;

// tbl_les_reglement is the payment-type lookup (num_regl 1..22 -> label) that chp_reg1..22
// above are positionally keyed to — this is the source of truth for those labels, not the
// hardcoded names caisse_fichier happened to use for its own (differently-ordered) columns.
const CTE_REGLEMENT = latestRowsCTE('latest_reglement', 'tbl_les_reglement', 'num_regl', [
  `(row->>'num_regl')::int AS num_regl`,
  `row->>'chp_intitule' AS chp_intitule`,
]);

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
  // Built on ne_fichier/ne_fichier_day (see CTE_NE_FICHIER) rather than note_entete/note_detail:
  // each row there is already one settled ticket, so no line-item join or discount math is
  // needed — ticket_count is just a row count and revenue is chp_mont summed directly.
  const sql = `
    WITH ${CTE_NE_FICHIER}, ${CTE_USERS_FIXE}
    SELECT
      COALESCE(uf.nom_user, 'Employé ' || f.chp_serv) AS employee_name,
      COUNT(*) AS ticket_count,
      COALESCE(SUM(f.chp_mont), 0) AS revenue
    FROM latest_ne_fichier f
    LEFT JOIN latest_users_fixe uf ON uf.log_user = f.chp_serv
    WHERE f.chp_etat = 'S' AND f.chp_date BETWEEN $2::date AND $3::date
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

const NE_FICHIER_REG_COLUMNS = Array.from({ length: 22 }, (_, i) => `f.reg${i + 1}`).join(',');

export async function getPaymentMethodsReport(clientId: string, from?: string, to?: string) {
  const range = defaultRange(from, to);
  // Unpivots the 22 fixed reg1..reg22 columns into (amount, num_regl) pairs via
  // unnest(...) WITH ORDINALITY, then labels each by joining num_regl against the real
  // tbl_les_reglement lookup — see CTE_NE_FICHIER / CTE_REGLEMENT for why this replaced the
  // old caisse_fichier-based version (which had no row at all for a not-yet-closed day, and
  // whose hand-picked column names didn't actually line up with tbl_les_reglement).
  const sql = `
    WITH ${CTE_NE_FICHIER}, ${CTE_REGLEMENT}
    SELECT r.chp_intitule AS method, COALESCE(SUM(u.amount), 0) AS amount
    FROM latest_ne_fichier f
    CROSS JOIN LATERAL unnest(ARRAY[${NE_FICHIER_REG_COLUMNS}]) WITH ORDINALITY AS u(amount, num_regl)
    JOIN latest_reglement r ON r.num_regl = u.num_regl
    WHERE f.chp_etat = 'S' AND f.chp_date BETWEEN $2::date AND $3::date
    GROUP BY r.chp_intitule
    HAVING COALESCE(SUM(u.amount), 0) != 0
    ORDER BY amount DESC
  `;
  const rawRows = await prisma.$queryRawUnsafe<any[]>(sql, clientId, range.from, range.to);
  const rows = rawRows.map((r) => ({ method: r.method, amount: Number(r.amount) }));

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

// Employee time-clock punches (tbl_pointeuse) — separate from tbl_cloture above (that's the
// POS's own end-of-day accounting closure, this is per-employee clock-in/out). Only
// etat_pointage 2 ("Terminé") has been observed in synced data so far; a still-open punch
// (no date_heure_arret yet) is reported as "En cours" regardless of its etat_pointage value.
export async function getTimeclockReport(clientId: string, from?: string, to?: string) {
  const range = defaultRange(from, to);
  const sql = `
    WITH ${CTE_POINTEUSE}, ${CTE_USERS_FIXE}
    SELECT
      p.id_pointage,
      COALESCE(uf.nom_user, 'Employé ' || p.id_serveur) AS employee_name,
      p.chp_date,
      p.date_heure_demarre,
      p.date_heure_arret,
      p.etat_pointage
    FROM latest_pointeuse p
    LEFT JOIN latest_users_fixe uf ON uf.log_user = p.id_serveur
    WHERE p.chp_date BETWEEN $2::date AND $3::date
    ORDER BY p.date_heure_demarre DESC
  `;
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, clientId, range.from, range.to);
  return rows.map((r) => {
    const start: Date = r.date_heure_demarre;
    const end: Date | null = r.date_heure_arret;
    const durationMinutes = end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;
    return {
      id_pointage: r.id_pointage,
      employee_name: r.employee_name,
      chp_date: r.chp_date.toISOString().slice(0, 10),
      demarre: start.toISOString(),
      arrete: end ? end.toISOString() : null,
      duration_minutes: durationMinutes,
      etat: end ? 'Terminé' : 'En cours',
    };
  });
}

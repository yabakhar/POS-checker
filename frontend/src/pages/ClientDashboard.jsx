import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import api from '../api/axios';
import { useTheme } from '../context/ThemeContext';
import {
  MonitorIcon, LogoutIcon, RefreshIcon,
  ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ChevronDownIcon,
  SunIcon, MoonIcon, InboxIcon, SettingsIcon,
} from '../components/icons';

// Stat card data
const STAT_ACCENT = [
  { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.18)' },
  { color: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.18)' },
  { color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.18)' },
];

const tableLabel = (type) => (type || '').replace(/^table_sync:/, '') || 'Données';

const loadSelectedTables = () => {
  try { return JSON.parse(localStorage.getItem('selectedTables') || '[]'); }
  catch { return []; }
};

const formatCellValue = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d)) return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return String(v);
};

// Renders an array of row-objects as a real table instead of raw JSON;
// falls back to raw JSON when the shape isn't a plain object array.
function DataRowsTable({ rows, T }) {
  const isRenderable = Array.isArray(rows) && rows.length > 0
    && typeof rows[0] === 'object' && rows[0] !== null && !Array.isArray(rows[0]);

  if (!isRenderable) {
    return (
      <pre style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 8, padding: '12px 14px',
        fontSize: 12, color: T.muted, overflow: 'auto',
        lineHeight: 1.6, marginTop: 2,
      }}>
        {JSON.stringify(rows, null, 2)}
      </pre>
    );
  }

  const columns = Object.keys(rows[0]);

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: T.bg }}>
            {columns.map((c) => (
              <th key={c} style={{
                textAlign: 'left', padding: '7px 10px', fontWeight: 600,
                color: T.subtle, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap',
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? T.bg : 'transparent' }}>
              {columns.map((c) => (
                <td key={c} style={{
                  padding: '6px 10px', color: T.muted, borderBottom: `1px solid ${T.border}`,
                  whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {formatCellValue(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ClientDashboard() {
  const navigate = useNavigate();
  const { T, dark, toggle } = useTheme();
  const accentClient = T.accentClient;
  const username = localStorage.getItem('username');
  const [stats, setStats] = useState({ total_records: 0, today_records: 0, last_sync: null });
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const limit = 20;

  // Which tables to show — configured in Settings, just read here.
  const [selectedTables] = useState(loadSelectedTables);

  const [tables, setTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'chart'
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(true);

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const res = await api.get('/client/tables');
      setTables(res.data);
    } catch { /* interceptor handles 401 */ }
    finally { setTablesLoading(false); }
  }, []);

  useEffect(() => { loadTables(); }, [loadTables]);

  const loadData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit });
      if (selectedTables.length > 0) params.set('tables', selectedTables.join(','));
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', `${dateTo}T23:59:59.999`);

      const [statsRes, dataRes] = await Promise.all([
        api.get('/client/stats'),
        api.get(`/client/dashboard?${params.toString()}`),
      ]);
      setStats(statsRes.data);
      setRecords(dataRes.data.data);
      setTotal(dataRes.data.total);
    } catch { /* interceptor handles 401 */ }
    finally { setLoading(false); }
  }, [selectedTables, dateFrom, dateTo]);

  useEffect(() => { loadData(page); }, [page, loadData]);

  // Date changes reset to page 1 (loadData above re-runs via the loadData/page effect)
  useEffect(() => { setPage(1); }, [dateFrom, dateTo]);

  const loadTimeline = useCallback(async () => {
    setTimelineLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTables.length > 0) params.set('tables', selectedTables.join(','));
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', `${dateTo}T23:59:59.999`);
      const res = await api.get(`/client/timeline?${params.toString()}`);
      setTimeline(res.data);
    } catch { /* interceptor handles 401 */ }
    finally { setTimelineLoading(false); }
  }, [selectedTables, dateFrom, dateTo]);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  const chartTables = selectedTables.length > 0
    ? tables.filter((t) => selectedTables.includes(t.table_name))
    : [...tables].sort((a, b) => b.sync_count - a.sync_count).slice(0, 12);

  const logout = () => { localStorage.clear(); navigate('/login'); };

  const totalPages = Math.ceil(total / limit);

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const statsData = [
    { label: 'Total enregistrements', value: stats.total_records.toLocaleString(), sub: 'Toutes périodes' },
    { label: "Aujourd'hui", value: stats.today_records.toLocaleString(), sub: 'Données reçues ce jour' },
    { label: 'Dernière synchronisation', value: stats.last_sync ? formatDate(stats.last_sync) : '—', sub: stats.last_sync ? '' : 'Aucune donnée reçue', small: true },
  ];

  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      {/* ── HEADER ── */}
      <header style={{
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        padding: '0 28px', height: 58,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 32, height: 32,
            background: 'linear-gradient(135deg, #0EA5E9, #0369A1)',
            borderRadius: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <MonitorIcon />
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.2 }}>POS Checker</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: T.muted, marginRight: 6 }}>{username}</span>
          <button onClick={() => navigate('/settings')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: `1px solid ${T.border}`,
              color: T.muted, padding: '6px 12px', borderRadius: 7,
              fontSize: 13, transition: 'all 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = accentClient; e.currentTarget.style.color = accentClient; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
          >
            <SettingsIcon /> Paramètres
          </button>
          <button onClick={toggle}
            style={{
              background: 'transparent', border: `1px solid ${T.border}`,
              color: T.muted, borderRadius: 7,
              width: 34, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = accentClient; e.currentTarget.style.color = accentClient; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
            title={dark ? 'Mode clair' : 'Mode sombre'}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button onClick={logout}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: `1px solid ${T.border}`,
              color: T.muted, padding: '6px 12px', borderRadius: 7,
              fontSize: 13, transition: 'all 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.danger; e.currentTarget.style.color = T.danger; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
          >
            <LogoutIcon /> Déconnexion
          </button>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
        {/* Welcome */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3, marginBottom: 4 }}>
            Bonjour, {username}
          </h1>
          <p style={{ fontSize: 14, color: T.muted }}>Voici les données remontées par votre agent POS</p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          {statsData.map((s, i) => (
            <div key={i} style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 12, padding: '18px 20px',
              borderTop: `2px solid ${STAT_ACCENT[i].color}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10 }}>
                {s.label}
              </div>
              <div style={{
                fontSize: s.small ? 15 : 26, fontWeight: 700, letterSpacing: s.small ? -0.2 : -0.5,
                color: T.text, lineHeight: 1.2,
              }}>
                {s.value}
              </div>
              {s.sub && <div style={{ fontSize: 11, color: T.subtle, marginTop: 5 }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Date filter */}
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
          padding: '12px 16px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: T.subtle }}>Du</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: '5px 8px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, color: T.text }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: T.subtle }}>Au</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: '5px 8px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, color: T.text }} />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, padding: '5px 10px', borderRadius: 6, fontSize: 12 }}
            >
              Réinitialiser
            </button>
          )}
          {selectedTables.length > 0 && (
            <span style={{ fontSize: 12, color: T.subtle, marginLeft: 'auto' }}>
              {selectedTables.length} table{selectedTables.length > 1 ? 's' : ''} filtrée{selectedTables.length > 1 ? 's' : ''} (voir Paramètres)
            </span>
          )}
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Données POS reçues</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, padding: 2 }}>
                {[{ key: 'table', label: 'Tableau' }, { key: 'chart', label: 'Graphique' }].map((m) => (
                  <button key={m.key} onClick={() => setViewMode(m.key)}
                    style={{
                      padding: '5px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                      border: 'none', cursor: 'pointer', transition: 'all 150ms',
                      background: viewMode === m.key ? T.surface : 'transparent',
                      color: viewMode === m.key ? accentClient : T.muted,
                      boxShadow: viewMode === m.key ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <button onClick={() => { loadData(page); loadTables(); loadTimeline(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'transparent', border: `1px solid ${T.border}`,
                  color: T.muted, padding: '6px 12px', borderRadius: 7,
                  fontSize: 12, fontWeight: 500, transition: 'all 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.subtle; e.currentTarget.style.color = T.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
              >
                <RefreshIcon /> Actualiser
              </button>
            </div>
          </div>

          {viewMode === 'chart' ? (
            <div style={{ padding: 18 }}>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>Interactions par table</div>
                <div style={{ fontSize: 11, color: T.subtle, marginBottom: 12 }}>
                  {selectedTables.length > 0 ? 'Tables sélectionnées' : 'Top 12 des tables les plus actives'}
                </div>
                {tablesLoading ? (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: T.muted, fontSize: 13 }}>Chargement...</div>
                ) : chartTables.length === 0 ? (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: T.subtle, fontSize: 13 }}>Aucune donnée à afficher</div>
                ) : (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartTables} margin={{ top: 5, right: 10, left: 0, bottom: 70 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                        <XAxis dataKey="table_name" angle={-45} textAnchor="end" interval={0} height={90} tick={{ fontSize: 10, fill: T.muted }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: T.muted }} />
                        <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="sync_count" name="Interactions" fill={accentClient} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>Interactions par jour</div>
                <div style={{ fontSize: 11, color: T.subtle, marginBottom: 12 }}>Nombre de synchronisations reçues par jour</div>
                {timelineLoading ? (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: T.muted, fontSize: 13 }}>Chargement...</div>
                ) : timeline.length === 0 ? (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: T.subtle, fontSize: 13 }}>Aucune donnée à afficher</div>
                ) : (
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timeline} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.muted }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: T.muted }} />
                        <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} />
                        <Line type="monotone" dataKey="interactions" name="Interactions" stroke={accentClient} strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          ) : loading ? (
            <div style={{ padding: '64px 0', textAlign: 'center', color: T.muted, fontSize: 14 }}>Chargement...</div>
          ) : records.length === 0 ? (
            <div style={{ padding: '72px 0', textAlign: 'center' }}>
              <div style={{ color: T.subtle, marginBottom: 12, display: 'flex', justifyContent: 'center' }}><InboxIcon /></div>
              <div style={{ fontSize: 14, color: T.muted, marginBottom: 6 }}>Aucune donnée reçue pour le moment</div>
              <div style={{ fontSize: 12, color: T.subtle }}>L'agent enverra les données ici une fois configuré (voir Paramètres).</div>
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.bg }}>
                    {['#', 'Reçu le', 'Aperçu des données', ''].map((h, i) => (
                      <th key={i} style={{
                        textAlign: 'left', padding: '10px 16px',
                        fontSize: 11, fontWeight: 600, color: T.subtle,
                        textTransform: 'uppercase', letterSpacing: 0.6,
                        borderBottom: `1px solid ${T.border}`,
                        width: i === 0 ? 52 : i === 1 ? 160 : i === 3 ? 80 : 'auto',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => {
                    const name = tableLabel(r.data?.type);
                    const rowCount = Array.isArray(r.data?.data) ? r.data.data.length : null;
                    return (
                    <React.Fragment key={r.id}>
                      <tr className="trow">
                        <td style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 12, color: T.subtle }}>
                          {(page - 1) * limit + i + 1}
                        </td>
                        <td style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.muted, whiteSpace: 'nowrap' }}>
                          {formatDate(r.received_at)}
                        </td>
                        <td style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, maxWidth: 0, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 11, fontWeight: 600, color: accentClient,
                              background: T.accentBg, border: `1px solid ${T.border}`,
                              padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                            }}>
                              {name}
                            </span>
                            {rowCount !== null && (
                              <span style={{ fontSize: 12, color: T.subtle }}>
                                {rowCount} ligne{rowCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
                          <button
                            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              background: 'none', border: 'none',
                              color: accentClient, fontSize: 12, fontWeight: 500,
                              padding: '3px 0', transition: 'opacity 150ms',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                          >
                            {expanded === r.id ? <><ChevronUpIcon /> Masquer</> : <><ChevronDownIcon /> Voir</>}
                          </button>
                        </td>
                      </tr>
                      {expanded === r.id && (
                        <tr>
                          <td colSpan={4} style={{ padding: '0 16px 14px', background: T.bg, maxWidth: 0 }}>
                            <DataRowsTable rows={r.data?.data} T={T} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              <div style={{
                padding: '13px 18px',
                borderTop: `1px solid ${T.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, color: T.muted }}>
                  {total} enregistrement{total !== 1 ? 's' : ''} — page {page} / {totalPages}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { icon: <ChevronLeftIcon />, disabled: page === 1, onClick: () => setPage(page - 1), label: 'Précédent' },
                    { icon: <ChevronRightIcon />, disabled: page >= totalPages, onClick: () => setPage(page + 1), label: 'Suivant' },
                  ].map(({ icon, disabled, onClick, label }) => (
                    <button key={label} disabled={disabled} onClick={onClick}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'transparent',
                        border: `1px solid ${disabled ? T.border : T.subtle}`,
                        color: disabled ? T.subtle : T.muted,
                        padding: '6px 12px', borderRadius: 7,
                        fontSize: 13, fontWeight: 500,
                        cursor: disabled ? 'default' : 'pointer',
                        transition: 'all 150ms',
                      }}
                      onMouseEnter={(e) => !disabled && (e.currentTarget.style.color = T.text, e.currentTarget.style.borderColor = accentClient)}
                      onMouseLeave={(e) => !disabled && (e.currentTarget.style.color = T.muted, e.currentTarget.style.borderColor = T.subtle)}
                    >
                      {label === 'Précédent' && icon} {label} {label === 'Suivant' && icon}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useTheme } from '../context/ThemeContext';

// Icons
const MonitorIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z"/>
  </svg>
);
const LogoutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/>
  </svg>
);
const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 12.75l6 6 9-13.5"/>
  </svg>
);
const RefreshIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
  </svg>
);
const ChevronLeftIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.75 19.5L8.25 12l7.5-7.5"/>
  </svg>
);
const ChevronRightIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
  </svg>
);
const ChevronUpIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 15.75l7.5-7.5 7.5 7.5"/>
  </svg>
);
const ChevronDownIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
  </svg>
);
const KeyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/>
  </svg>
);
const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/>
  </svg>
);
const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"/>
  </svg>
);
const InboxIcon = () => (
  <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z"/>
  </svg>
);

// Stat card data
const STAT_ACCENT = [
  { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.18)' },
  { color: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.18)' },
  { color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.18)' },
];

export default function ClientDashboard() {
  const navigate = useNavigate();
  const { T, dark, toggle } = useTheme();
  const accentClient = T.accentClient;
  const username = localStorage.getItem('username');
  const apiKey = localStorage.getItem('api_key');
  const [stats, setStats] = useState({ total_records: 0, today_records: 0, last_sync: null });
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const limit = 20;

  const loadData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const [statsRes, dataRes] = await Promise.all([
        api.get('/client/stats'),
        api.get(`/client/dashboard?page=${p}&limit=${limit}`),
      ]);
      setStats(statsRes.data);
      setRecords(dataRes.data.data);
      setTotal(dataRes.data.total);
    } catch { /* interceptor handles 401 */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(page); }, [page, loadData]);

  const logout = () => { localStorage.clear(); navigate('/login'); };

  const copyKey = async () => {
    try { await navigator.clipboard.writeText(apiKey); }
    catch { const el = document.createElement('textarea'); el.value = apiKey; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); }
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

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

        {/* API Key */}
        {apiKey && (
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderTop: `2px solid ${accentClient}`,
            borderRadius: 12, padding: '14px 18px',
            marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ color: accentClient, flexShrink: 0, display: 'flex' }}><KeyIcon /></div>
              <span style={{ fontSize: 12, fontWeight: 600, color: accentClient, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>
                Clé API
              </span>
              <span style={{
                fontFamily: 'monospace', fontSize: 12, color: T.muted,
                background: T.surface2, padding: '3px 10px', borderRadius: 6,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              }}>
                {apiKey}
              </span>
            </div>
            <button onClick={copyKey}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: keyCopied ? T.successBg : T.accentBg,
                border: `1px solid ${keyCopied ? T.successBorder : T.border}`,
                color: keyCopied ? T.success : accentClient,
                padding: '6px 14px', borderRadius: 7,
                fontSize: 12, fontWeight: 600, flexShrink: 0,
                transition: 'all 150ms',
              }}
            >
              {keyCopied ? <><CheckIcon /> Copié</> : <><CopyIcon /> Copier</>}
            </button>
          </div>
        )}

        {/* Data table */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Données POS reçues</span>
            <button onClick={() => loadData(page)}
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

          {loading ? (
            <div style={{ padding: '64px 0', textAlign: 'center', color: T.muted, fontSize: 14 }}>Chargement...</div>
          ) : records.length === 0 ? (
            <div style={{ padding: '72px 0', textAlign: 'center' }}>
              <div style={{ color: T.subtle, marginBottom: 12, display: 'flex', justifyContent: 'center' }}><InboxIcon /></div>
              <div style={{ fontSize: 14, color: T.muted, marginBottom: 6 }}>Aucune donnée reçue pour le moment</div>
              <div style={{ fontSize: 12, color: T.subtle }}>L'agent enverra les données ici via la clé API ci-dessus.</div>
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
                  {records.map((r, i) => (
                    <React.Fragment key={r.id}>
                      <tr className="trow">
                        <td style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 12, color: T.subtle }}>
                          {(page - 1) * limit + i + 1}
                        </td>
                        <td style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.muted, whiteSpace: 'nowrap' }}>
                          {formatDate(r.received_at)}
                        </td>
                        <td style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, maxWidth: 0, overflow: 'hidden' }}>
                          <code style={{
                            fontSize: 12, color: T.muted,
                            display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {JSON.stringify(r.data).slice(0, 90)}{JSON.stringify(r.data).length > 90 ? '...' : ''}
                          </code>
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
                          <td colSpan={4} style={{ padding: '0 16px 14px', background: T.bg }}>
                            <pre style={{
                              background: T.surface, border: `1px solid ${T.border}`,
                              borderRadius: 8, padding: '12px 14px',
                              fontSize: 12, color: T.muted, overflow: 'auto',
                              lineHeight: 1.6, marginTop: 2,
                            }}>
                              {JSON.stringify(r.data, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
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

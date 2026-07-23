import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useTheme } from '../context/ThemeContext';
import {
  MonitorIcon, LogoutIcon, CopyIcon, CheckIcon, KeyIcon, SearchIcon,
  DownloadIcon, SunIcon, MoonIcon, DashboardIcon,
} from '../components/icons';

interface TableInfo {
  table_name: string;
  sync_count: number;
  total_rows: number;
  last_update: string | null;
}

const loadSelectedTables = (): string[] => {
  try { return JSON.parse(localStorage.getItem('selectedTables') || '[]'); }
  catch { return []; }
};

export default function ClientSettings() {
  const navigate = useNavigate();
  const { T, dark, toggle } = useTheme();
  const accentClient = T.accentClient;
  const username = localStorage.getItem('username');
  const apiKey = localStorage.getItem('api_key');
  const [keyCopied, setKeyCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [agentVersion, setAgentVersion] = useState('2015');

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tableSearch, setTableSearch] = useState('');
  const [tableSort, setTableSort] = useState('last_update'); // 'last_update' | 'sync_count' | 'name'
  const [selectedTables, setSelectedTables] = useState<string[]>(loadSelectedTables);

  useEffect(() => {
    localStorage.setItem('selectedTables', JSON.stringify(selectedTables));
  }, [selectedTables]);

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const res = await api.get('/client/tables');
      setTables(res.data);
    } catch { /* interceptor handles 401 */ }
    finally { setTablesLoading(false); }
  }, []);

  useEffect(() => { loadTables(); }, [loadTables]);

  const toggleTable = (name: string) => {
    setSelectedTables((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));
  };

  const visibleTables = tables
    .filter((t) => t.table_name.toLowerCase().includes(tableSearch.toLowerCase()))
    .sort((a, b) => {
      if (tableSort === 'name') return a.table_name.localeCompare(b.table_name);
      if (tableSort === 'sync_count') return b.sync_count - a.sync_count;
      return new Date(b.last_update ?? 0).getTime() - new Date(a.last_update ?? 0).getTime();
    });

  const logout = () => { localStorage.clear(); navigate('/login'); };

  const copyKey = async () => {
    if (!apiKey) return;
    try { await navigator.clipboard.writeText(apiKey); }
    catch { const el = document.createElement('textarea'); el.value = apiKey; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); }
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const downloadAgent = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/client/agent-package?version=${agentVersion}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `pos-agent-${agentVersion}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch { /* interceptor handles 401 */ }
    finally { setDownloading(false); }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

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
            background: T.accentClient,
            borderRadius: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <MonitorIcon />
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.2 }}>POS Checker</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: T.muted, marginRight: 6 }}>{username}</span>
          <button onClick={() => navigate('/dashboard')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: `1px solid ${T.border}`,
              color: T.muted, padding: '6px 12px', borderRadius: 7,
              fontSize: 13, transition: 'all 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = accentClient; e.currentTarget.style.color = accentClient; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
          >
            <DashboardIcon /> Tableau de bord
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
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3, marginBottom: 4 }}>
            Paramètres
          </h1>
          <p style={{ fontSize: 14, color: T.muted }}>Clé API, agent de synchronisation, tables suivies</p>
        </div>

        {/* API Key */}
        {apiKey && (
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderTop: `2px solid ${accentClient}`,
            borderRadius: 12, padding: '14px 18px',
            marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
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

        {/* Download agent */}
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderTop: `2px solid ${accentClient}`,
          borderRadius: 12, padding: '14px 18px',
          marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 2 }}>
              Télécharger l'agent de synchronisation
            </div>
            <div style={{ fontSize: 12, color: T.subtle }}>
              Package prêt à l'emploi (agent + installateur), déjà configuré avec votre clé API.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, padding: 2 }}>
              {['2015', '2025'].map((v) => (
                <button key={v} onClick={() => setAgentVersion(v)}
                  style={{
                    padding: '6px 14px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                    border: 'none', cursor: 'pointer', transition: 'all 150ms',
                    background: agentVersion === v ? T.surface : 'transparent',
                    color: agentVersion === v ? accentClient : T.muted,
                    boxShadow: agentVersion === v ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  Version {v}
                </button>
              ))}
            </div>
            <button onClick={downloadAgent} disabled={downloading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: accentClient, border: 'none', color: '#fff',
                padding: '8px 16px', borderRadius: 7,
                fontSize: 13, fontWeight: 600,
                cursor: downloading ? 'default' : 'pointer',
                opacity: downloading ? 0.7 : 1,
                transition: 'opacity 150ms',
              }}
            >
              <DownloadIcon /> {downloading ? 'Préparation...' : 'Télécharger'}
            </button>
          </div>
        </div>

        {/* Table selector */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 2 }}>Tables suivies</div>
            <div style={{ fontSize: 12, color: T.subtle, marginBottom: 12 }}>
              Choisissez les tables à afficher sur le tableau de bord. Aucune sélection = toutes les tables.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 220px' }}>
                <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: T.subtle }}><SearchIcon /></span>
                <input
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Rechercher une table..."
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '7px 10px 7px 28px',
                    background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7,
                    fontSize: 12, color: T.text, outline: 'none',
                  }}
                />
              </div>
              <select
                value={tableSort}
                onChange={(e) => setTableSort(e.target.value)}
                style={{
                  padding: '6px 8px',
                  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7,
                  fontSize: 12, color: T.muted, outline: 'none',
                }}
              >
                <option value="last_update">Trier : Dernière mise à jour</option>
                <option value="sync_count">Trier : Nombre d'interactions</option>
                <option value="name">Trier : Nom (A-Z)</option>
              </select>
              {selectedTables.length > 0 && (
                <button onClick={() => setSelectedTables([])}
                  style={{
                    background: 'transparent', border: `1px solid ${T.border}`,
                    color: T.muted, padding: '6px 14px', borderRadius: 7,
                    fontSize: 12, fontWeight: 500,
                  }}
                >
                  Effacer ({selectedTables.length})
                </button>
              )}
            </div>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {tablesLoading ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: T.muted, fontSize: 12 }}>Chargement...</div>
            ) : visibleTables.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: T.subtle, fontSize: 12 }}>
                Aucune table synchronisée pour le moment
              </div>
            ) : (
              visibleTables.map((t) => {
                const checked = selectedTables.includes(t.table_name);
                return (
                  <label key={t.table_name} onClick={() => toggleTable(t.table_name)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      padding: '10px 18px',
                      borderBottom: `1px solid ${T.border}`,
                      cursor: 'pointer',
                      background: checked ? T.accentBg : 'transparent',
                    }}
                  >
                    <input type="checkbox" checked={checked} readOnly style={{ marginTop: 2, accentColor: accentClient }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: checked ? accentClient : T.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {t.table_name}
                      </div>
                      <div style={{ fontSize: 11, color: T.subtle, marginTop: 2 }}>
                        {t.sync_count} interaction{Number(t.sync_count) !== 1 ? 's' : ''} · {formatDate(t.last_update)}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

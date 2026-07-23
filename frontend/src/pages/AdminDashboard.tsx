import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useTheme } from '../context/ThemeContext';
import { PASSWORD_RULES, isPasswordValid } from '../lib/password';

interface Client {
  id: string;
  username: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
}

// Icons
const ShieldIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
  </svg>
);
const UsersIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
  </svg>
);
const LogoutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 4.5v15m7.5-7.5h-15"/>
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
const KeyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
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
const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/>
    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
  </svg>
);
const EyeOffIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>
  </svg>
);

// Real-time checklist shown under a password field being *set* (create / reset) — never on
// login, since an existing password may predate the current rules.
function PasswordChecklist({ password }: { password: string }) {
  const { T } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: -8, marginBottom: 16 }}>
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <div key={rule.key} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: ok ? T.success : T.subtle,
            transition: 'color 150ms',
          }}>
            <span style={{
              width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: ok ? T.successBg : 'transparent',
              border: `1px solid ${ok ? T.successBorder : T.border}`,
            }}>
              {ok && <CheckIcon />}
            </span>
            {rule.label}
          </div>
        );
      })}
    </div>
  );
}

function PasswordInput({ style, value, onChange, onFocus, onBlur, placeholder, name }: {
  style: React.CSSProperties; value: string; onChange: (v: string) => void;
  onFocus: () => void; onBlur: () => void; placeholder: string; name: string;
}) {
  const { T } = useTheme();
  const [show, setShow] = useState(false);
  // margin pulled off the input and onto the wrapper: if left on the input, the relative
  // wrapper's auto height includes that invisible margin, and the eye button (centered via
  // top: 50%) ends up off-center from the visible input box.
  const { marginBottom, margin, ...inputStyle } = style;
  return (
    <div style={{ position: 'relative', marginBottom, margin }}>
      <input
        style={{ ...inputStyle, paddingRight: 42 }}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus} onBlur={onBlur}
        placeholder={placeholder}
        name={name}
        required
      />
      <button type="button" onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none',
          color: show ? T.accent : T.subtle,
          display: 'flex', alignItems: 'center', padding: 2, transition: 'color 150ms',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = T.muted)}
        onMouseLeave={(e) => (e.currentTarget.style.color = show ? T.accent : T.subtle)}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function CopyButton({ text, small }: { text: string; small?: boolean }) {
  const { T } = useTheme();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch { const el = document.createElement('textarea'); el.value = text; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  if (small) return (
    <button onClick={copy} title="Copier" style={{
      background: 'none', border: 'none',
      color: copied ? T.success : T.subtle,
      padding: '2px 4px', display: 'inline-flex', alignItems: 'center',
      transition: 'color 150ms',
    }}
      onMouseEnter={(e) => !copied && (e.currentTarget.style.color = T.muted)}
      onMouseLeave={(e) => !copied && (e.currentTarget.style.color = T.subtle)}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
  return (
    <button onClick={copy} style={{
      width: '100%', padding: '10px',
      background: copied ? T.successBg : T.accentBg,
      border: `1px solid ${copied ? T.successBorder : T.border}`,
      color: copied ? T.success : T.accent,
      borderRadius: 8, fontSize: 13, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      marginBottom: 16, transition: 'all 150ms',
    }}>
      {copied ? <><CheckIcon /> Copié !</> : <><CopyIcon /> Copier la clé API</>}
    </button>
  );
}

function ActionBtn({ color, onClick, children }: { color: string; onClick: () => void; children: React.ReactNode }) {
  const { T } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? `${color}18` : 'transparent',
        border: `1px solid ${hover ? color : T.border}`,
        color: hover ? color : T.muted,
        padding: '4px 10px', borderRadius: 6,
        fontSize: 12, fontWeight: 500,
        transition: 'all 150ms',
      }}
    >{children}</button>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { T, dark, toggle } = useTheme();
  const username = localStorage.getItem('username');
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'reset' | 'key' | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [form, setForm] = useState({ username: '', password: '' });
  const [newPassword, setNewPassword] = useState('');
  const [newKey, setNewKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    try { const { data } = await api.get('/admin/clients'); setClients(data); }
    catch { /* handled by interceptor */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  const logout = () => { localStorage.clear(); navigate('/admin/login'); };

  const openCreate = () => { setForm({ username: '', password: '' }); setError(''); setModal('create'); };
  const openReset = (client: Client) => { setSelectedClient(client); setNewPassword(''); setError(''); setModal('reset'); };
  const closeModal = () => { setModal(null); setSelectedClient(null); setNewKey(''); setError(''); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSubmitting(true);
    try {
      const { data } = await api.post('/admin/clients', form);
      setClients((prev) => [data, ...prev]);
      setNewKey(data.api_key);
      setModal('key');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur lors de la création.'); }
    finally { setSubmitting(false); }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSubmitting(true);
    try {
      await api.put(`/admin/clients/${selectedClient!.id}/reset-password`, { password: newPassword });
      closeModal();
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur.'); }
    finally { setSubmitting(false); }
  };

  const handleToggle = async (client: Client) => {
    try {
      const { data } = await api.put(`/admin/clients/${client.id}/toggle`);
      setClients((prev) => prev.map((c) => (c.id === data.id ? { ...c, is_active: data.is_active } : c)));
    } catch {}
  };

  const handleRegenKey = async (client: Client) => {
    if (!confirm(`Régénérer la clé API de "${client.username}" ? L'ancienne clé sera invalide.`)) return;
    try {
      const { data } = await api.put(`/admin/clients/${client.id}/regenerate-key`);
      setClients((prev) => prev.map((c) => (c.id === data.id ? { ...c, api_key: data.api_key } : c)));
      setNewKey(data.api_key);
      setModal('key');
    } catch {}
  };

  const inpStyle = (name: string): React.CSSProperties => ({
    width: '100%', padding: '10px 14px',
    background: T.inputBg,
    border: `1px solid ${focused === name ? T.accent : T.border}`,
    boxShadow: focused === name ? '0 0 0 3px rgba(23,169,141,0.12)' : 'none',
    borderRadius: 8, color: T.text, fontSize: 14, outline: 'none',
    marginBottom: 16, transition: 'border-color 150ms, box-shadow 150ms',
  });

  const avatarLetter = username?.charAt(0).toUpperCase() || 'A';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: 220, flexShrink: 0,
        background: T.surface,
        borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 16px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 34, height: 34,
              background: T.accent,
              borderRadius: 9, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}>
              <ShieldIcon size={15} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: -0.2 }}>POS Checker</div>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>Sysadmin</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '9px 12px', borderRadius: 8,
            background: T.accentBg, color: T.accent,
            fontSize: 13, fontWeight: 600,
          }}>
            <UsersIcon /> Clients
          </div>
        </nav>

        {/* Theme toggle + User + logout */}
        <div style={{ padding: '10px 8px', borderTop: `1px solid ${T.border}` }}>
          <button onClick={toggle}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '7px 10px', marginBottom: 4,
              background: 'transparent', border: `1px solid ${T.border}`,
              color: T.muted, borderRadius: 7, fontSize: 12, fontWeight: 500,
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
            {dark ? 'Mode clair' : 'Mode sombre'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: T.accentBg, border: `1px solid rgba(23,169,141,0.25)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: T.accent, flexShrink: 0,
            }}>
              {avatarLetter}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text }}>
                {username}
              </div>
              <div style={{ fontSize: 11, color: T.muted }}>Administrateur</div>
            </div>
            <button onClick={logout} title="Déconnexion"
              style={{ background: 'none', border: 'none', color: T.subtle, padding: 4, transition: 'color 150ms', display: 'flex' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.danger)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.subtle)}
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header style={{
          padding: '20px 28px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: T.surface,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>Gestion des clients</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>
              {clients.length} client{clients.length !== 1 ? 's' : ''} enregistré{clients.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button onClick={openCreate}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: T.accent, color: '#fff',
              border: 'none', padding: '9px 18px', borderRadius: 8,
              fontSize: 13, fontWeight: 600, transition: 'background 150ms, box-shadow 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#0F6B5C'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(15,107,92,0.35)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = T.accent; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <PlusIcon /> Créer un client
          </button>
        </header>

        {/* Table area */}
        <main style={{ flex: 1, padding: 28, overflow: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: T.muted, fontSize: 14 }}>Chargement...</div>
          ) : clients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: T.muted }}>
              <div style={{ fontSize: 13 }}>Aucun client. Créez-en un pour commencer.</div>
            </div>
          ) : (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.bg }}>
                    {['Username', 'Clé API', 'Statut', 'Créé le', 'Actions'].map((h) => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '11px 16px',
                        fontSize: 11, fontWeight: 600, color: T.subtle,
                        textTransform: 'uppercase', letterSpacing: 0.6,
                        borderBottom: `1px solid ${T.border}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id} className="trow">
                      <td style={{ padding: '13px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 14, fontWeight: 600 }}>
                        {c.username}
                      </td>
                      <td style={{ padding: '13px 16px', borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <span style={{
                            fontFamily: 'monospace', fontSize: 12, color: T.muted,
                            background: T.bg, padding: '3px 8px', borderRadius: 5,
                            maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            display: 'inline-block',
                          }} title={c.api_key}>{c.api_key}</span>
                          <CopyButton text={c.api_key} small />
                        </div>
                      </td>
                      <td style={{ padding: '13px 16px', borderBottom: `1px solid ${T.border}` }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                          background: c.is_active ? T.successBg : T.dangerBg,
                          color: c.is_active ? T.success : T.danger,
                          border: `1px solid ${c.is_active ? T.successBorder : T.dangerBorder}`,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                          {c.is_active ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td style={{ padding: '13px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.muted }}>
                        {new Date(c.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td style={{ padding: '13px 16px', borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <ActionBtn color={T.warning} onClick={() => openReset(c)}>Reset MDP</ActionBtn>
                          <ActionBtn color={c.is_active ? T.danger : T.success} onClick={() => handleToggle(c)}>
                            {c.is_active ? 'Désactiver' : 'Activer'}
                          </ActionBtn>
                          <ActionBtn color={T.accent} onClick={() => handleRegenKey(c)}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><KeyIcon /> Regen clé</span>
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* ── MODALS ── */}
      {(modal === 'create' || modal === 'reset' || modal === 'key') && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={closeModal}>
          <div style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 14, padding: 32, width: '100%', maxWidth: 460,
            boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          }} onClick={(e) => e.stopPropagation()}>

            {modal === 'create' && (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Créer un client</div>
                <div style={{ color: T.muted, fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
                  Un username, un mot de passe et une clé API seront générés automatiquement.
                </div>
                {error && <div style={{ background: T.dangerBg, border: `1px solid ${T.dangerBorder}`, color: '#FCA5A5', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}
                <form onSubmit={handleCreate}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6, letterSpacing: 0.3 }}>USERNAME</label>
                  <input style={inpStyle('cu')} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                    onFocus={() => setFocused('cu')} onBlur={() => setFocused(null)}
                    placeholder="client-name" minLength={3} required />
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6, letterSpacing: 0.3 }}>MOT DE PASSE</label>
                  <PasswordInput style={inpStyle('cp')} value={form.password} onChange={(v) => setForm({ ...form, password: v })}
                    onFocus={() => setFocused('cp')} onBlur={() => setFocused(null)}
                    placeholder="••••••••" name="new-password" />
                  <div style={{ marginTop: 10 }}><PasswordChecklist password={form.password} /></div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <button type="button" onClick={closeModal} style={{
                      flex: 1, padding: 10, background: 'transparent',
                      border: `1px solid ${T.border}`, color: T.muted,
                      borderRadius: 8, fontSize: 14, transition: 'border-color 150ms',
                    }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.subtle)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.border)}
                    >Annuler</button>
                    <button type="submit" disabled={submitting || !isPasswordValid(form.password)} style={{
                      flex: 1, padding: 10, background: T.accent, color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                      opacity: submitting || !isPasswordValid(form.password) ? 0.5 : 1, transition: 'background 150ms, opacity 150ms',
                    }}
                      onMouseEnter={(e) => !submitting && (e.currentTarget.style.background = '#0F6B5C')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = T.accent)}
                    >{submitting ? 'Création...' : 'Créer'}</button>
                  </div>
                </form>
              </>
            )}

            {modal === 'key' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: T.successBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.success }}>
                    <CheckIcon />
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Client créé</div>
                </div>
                <div style={{ color: T.muted, fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
                  Copiez cette clé API et donnez-la au client. Elle est utilisée par l'agent Windows.
                </div>
                <div style={{
                  background: T.bg, border: `1px solid ${T.border}`,
                  borderRadius: 8, padding: '12px 16px',
                  fontFamily: 'monospace', fontSize: 13, color: T.success,
                  wordBreak: 'break-all', marginBottom: 16, lineHeight: 1.6,
                }}>{newKey}</div>
                <CopyButton text={newKey} />
                <div style={{ fontSize: 12, color: T.subtle, marginBottom: 20 }}>
                  Vous pouvez retrouver cette clé dans le tableau à tout moment.
                </div>
                <button onClick={closeModal} style={{
                  width: '100%', padding: 10, background: T.surface2,
                  border: `1px solid ${T.border}`, color: T.text,
                  borderRadius: 8, fontSize: 14, fontWeight: 500,
                  transition: 'border-color 150ms',
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.subtle)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.border)}
                >Fermer</button>
              </>
            )}

            {modal === 'reset' && (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Reset mot de passe</div>
                <div style={{ color: T.muted, fontSize: 13, marginBottom: 24 }}>
                  Nouveau mot de passe pour <strong style={{ color: T.text }}>{selectedClient?.username}</strong>
                </div>
                {error && <div style={{ background: T.dangerBg, border: `1px solid ${T.dangerBorder}`, color: '#FCA5A5', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}
                <form onSubmit={handleReset}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6, letterSpacing: 0.3 }}>NOUVEAU MOT DE PASSE</label>
                  <PasswordInput style={inpStyle('np')} value={newPassword}
                    onChange={setNewPassword}
                    onFocus={() => setFocused('np')} onBlur={() => setFocused(null)}
                    placeholder="••••••••" name="new-password" />
                  <div style={{ marginTop: 10 }}><PasswordChecklist password={newPassword} /></div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <button type="button" onClick={closeModal} style={{
                      flex: 1, padding: 10, background: 'transparent',
                      border: `1px solid ${T.border}`, color: T.muted,
                      borderRadius: 8, fontSize: 14, transition: 'border-color 150ms',
                    }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.subtle)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.border)}
                    >Annuler</button>
                    <button type="submit" disabled={submitting || !isPasswordValid(newPassword)} style={{
                      flex: 1, padding: 10, background: T.warning, color: '#000',
                      border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                      opacity: submitting || !isPasswordValid(newPassword) ? 0.5 : 1, transition: 'background 150ms, opacity 150ms',
                    }}>{submitting ? 'Reset...' : 'Confirmer'}</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

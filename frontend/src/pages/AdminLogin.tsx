import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useTheme } from '../context/ThemeContext';

const ShieldIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
  </svg>
);
const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/>
    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
  </svg>
);
const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>
  </svg>
);
const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/>
  </svg>
);
const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"/>
  </svg>
);

export default function AdminLogin() {
  const navigate = useNavigate();
  const { T, dark, toggle } = useTheme();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (token && role === 'admin') navigate('/admin/dashboard', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.username.trim() || !form.password) {
      setError('Nom d\'utilisateur et mot de passe requis.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/admin/login', form);
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', 'admin');
      localStorage.setItem('username', data.username);
      navigate('/admin/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Identifiants incorrects.');
    } finally {
      setLoading(false);
    }
  };

  const inpStyle = (name: string): React.CSSProperties => ({
    width: '100%',
    padding: '11px 14px',
    background: T.inputBg,
    border: `1px solid ${focused === name ? T.accent : T.border}`,
    boxShadow: focused === name ? `0 0 0 3px ${T.accentBg}` : 'none',
    borderRadius: 8,
    color: T.text,
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 150ms, box-shadow 150ms',
  });

  const gradientBg = dark
    ? `radial-gradient(ellipse 80% 50% at 50% -5%, #0F2040 0%, ${T.bg} 65%)`
    : `radial-gradient(ellipse 80% 50% at 50% -5%, #DBEAFE 0%, ${T.bg} 65%)`;

  return (
    <div style={{ minHeight: '100vh', background: gradientBg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>

      {/* Theme toggle */}
      <button onClick={toggle}
        style={{
          position: 'fixed', top: 16, right: 16,
          background: T.surface, border: `1px solid ${T.border}`,
          color: T.muted, borderRadius: 8,
          width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 150ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
        title={dark ? 'Mode clair' : 'Mode sombre'}
      >
        {dark ? <SunIcon /> : <MoonIcon />}
      </button>

      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        padding: '40px 44px',
        width: '100%', maxWidth: 420,
        boxShadow: dark ? '0 24px 64px rgba(0,0,0,0.55)' : '0 8px 40px rgba(0,0,0,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 40, height: 40,
            background: 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
            borderRadius: 10, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <ShieldIcon />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.2, color: T.text }}>POS Checker</div>
            <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Sysadmin</div>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginBottom: 6, color: T.text }}>Connexion admin</h1>
        <p style={{ fontSize: 14, color: T.muted, marginBottom: 28, lineHeight: 1.5 }}>Accès réservé aux administrateurs système</p>

        {error && (
          <div style={{
            background: T.dangerBg, border: `1px solid ${T.dangerBorder}`,
            color: dark ? '#FCA5A5' : T.danger,
            padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20,
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6, letterSpacing: 0.3 }}>NOM D'UTILISATEUR</label>
            <input
              style={inpStyle('username')} type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              onFocus={() => setFocused('username')} onBlur={() => setFocused(null)}
              placeholder="admin" required
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6, letterSpacing: 0.3 }}>MOT DE PASSE</label>
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...inpStyle('password'), paddingRight: 42 }}
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                placeholder="••••••••" required
              />
              <button type="button" onClick={() => setShowPass((v) => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  color: showPass ? T.accent : T.subtle,
                  display: 'flex', alignItems: 'center', padding: 2, transition: 'color 150ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.muted)}
                onMouseLeave={(e) => (e.currentTarget.style.color = showPass ? T.accent : T.subtle)}
              >
                {showPass ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            style={{
              width: '100%', padding: '12px',
              background: T.accent, color: '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 600,
              opacity: loading ? 0.7 : 1,
              transition: 'background 150ms, box-shadow 150ms',
            }}
            onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = '#1D4ED8'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(37,99,235,0.35)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = T.accent; e.currentTarget.style.boxShadow = 'none'; }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <a href="/login"
          style={{ display: 'block', textAlign: 'center', marginTop: 24, fontSize: 13, color: T.muted, transition: 'color 150ms' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.accent)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.muted)}
        >
          ← Portail client
        </a>
      </div>
    </div>
  );
}

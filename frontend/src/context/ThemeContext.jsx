import React, { createContext, useContext, useState, useEffect } from 'react';

export const DARK = {
  bg: '#080C16',
  surface: '#0E1523',
  surface2: '#131F30',
  border: '#1A2E44',
  text: '#EFF6FF',
  muted: '#6B8CAE',
  subtle: '#3D566E',
  accent: '#3B82F6',
  accentClient: '#0EA5E9',
  accentBg: 'rgba(59,130,246,0.1)',
  success: '#10B981',
  successBg: 'rgba(16,185,129,0.1)',
  successBorder: 'rgba(16,185,129,0.2)',
  danger: '#EF4444',
  dangerBg: 'rgba(239,68,68,0.1)',
  dangerBorder: 'rgba(239,68,68,0.2)',
  warning: '#F59E0B',
  warningBg: 'rgba(245,158,11,0.1)',
  inputBg: '#111C30',
};

export const LIGHT = {
  bg: '#F1F5F9',
  surface: '#FFFFFF',
  surface2: '#F8FAFC',
  border: '#E2E8F0',
  text: '#0F172A',
  muted: '#64748B',
  subtle: '#94A3B8',
  accent: '#2563EB',
  accentClient: '#0284C7',
  accentBg: 'rgba(37,99,235,0.08)',
  success: '#059669',
  successBg: 'rgba(5,150,105,0.08)',
  successBorder: 'rgba(5,150,105,0.2)',
  danger: '#DC2626',
  dangerBg: 'rgba(220,38,38,0.08)',
  dangerBorder: 'rgba(220,38,38,0.2)',
  warning: '#D97706',
  warningBg: 'rgba(217,119,6,0.08)',
  inputBg: '#F8FAFC',
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    const T = dark ? DARK : LIGHT;
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    document.body.style.background = T.bg;
    document.body.style.color = T.text;
    document.documentElement.style.setProperty('--row-hover-bg', dark ? 'rgba(59,130,246,0.05)' : 'rgba(37,99,235,0.04)');
    document.documentElement.style.setProperty('--scrollbar-thumb', T.border);
    document.documentElement.style.setProperty('--scrollbar-thumb-hover', T.subtle);
    document.documentElement.style.setProperty('--date-icon-filter', dark ? 'invert(1)' : 'invert(0)');
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark((d) => !d), T: dark ? DARK : LIGHT }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

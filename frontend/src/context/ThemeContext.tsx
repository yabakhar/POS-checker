import React, { createContext, useContext, useState, useEffect } from 'react';

// Repainted to match the Tailwind/shadcn dashboard's tokens exactly (frontend/src/index.css
// :root / .dark) — same graphite/paper + deep-teal palette, just expressed as plain hex/rgba
// for the pages that still style themselves with inline styles instead of Tailwind classes.
// accent and accentClient used to differ (admin blue vs. client cyan); the new dashboard has
// no such split, so both now point at the same teal primary for a consistent look everywhere.
export const DARK = {
  bg: '#14171C',
  surface: '#1B1F26',
  surface2: '#232933',
  border: '#2A303B',
  text: '#F1F0EC',
  muted: '#9A9FA6',
  subtle: '#5D636D',
  accent: '#17A98D',
  accentClient: '#17A98D',
  accentBg: 'rgba(23,169,141,0.12)',
  success: '#199E70',
  successBg: 'rgba(25,158,112,0.12)',
  successBorder: 'rgba(25,158,112,0.25)',
  danger: '#E4573D',
  dangerBg: 'rgba(228,87,61,0.12)',
  dangerBorder: 'rgba(228,87,61,0.25)',
  warning: '#E4B65A',
  warningBg: 'rgba(228,182,90,0.12)',
  inputBg: '#1B1F26',
};

export const LIGHT = {
  bg: '#F6F5F2',
  surface: '#FFFFFF',
  surface2: '#EFEDE7',
  border: '#E4E1D9',
  text: '#14171C',
  muted: '#6B6F76',
  subtle: '#A3A7A0',
  accent: '#0F6B5C',
  accentClient: '#0F6B5C',
  accentBg: 'rgba(15,107,92,0.08)',
  success: '#1BAF7A',
  successBg: 'rgba(27,175,122,0.08)',
  successBorder: 'rgba(27,175,122,0.2)',
  danger: '#B3432B',
  dangerBg: 'rgba(179,67,43,0.08)',
  dangerBorder: 'rgba(179,67,43,0.2)',
  warning: '#8A6416',
  warningBg: 'rgba(138,100,22,0.08)',
  inputBg: '#FFFFFF',
};

type ThemeContextValue = {
  dark: boolean;
  toggle: () => void;
  T: typeof DARK;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    const T = dark ? DARK : LIGHT;
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', dark);
    document.body.style.background = T.bg;
    document.body.style.color = T.text;
    document.documentElement.style.setProperty('--row-hover-bg', dark ? 'rgba(23,169,141,0.05)' : 'rgba(15,107,92,0.04)');
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

export const useTheme = () => useContext(ThemeContext) as ThemeContextValue;

import * as React from 'react';

export type Theme = {
  color: {
    bg: string;
    surface: string;
    fg: string;
    mutedFg: string;
    border: string;
    muted: string;
    primary: string;
    primaryFg: string;
    primarySoft: string;
    danger: string;
    dangerFg: string;
    dangerSoft: string;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
  };
  shadow: {
    sm: string;
    md: string;
  };
};

export const defaultTheme: Theme = {
  color: {
    bg: '#f8fafc',
    surface: '#ffffff',
    fg: 'rgba(0,0,0,0.92)',
    mutedFg: 'rgba(0,0,0,0.65)',
    border: 'rgba(0,0,0,0.12)',
    muted: 'rgba(0,0,0,0.06)',
    primary: '#2563eb',
    primaryFg: '#ffffff',
    primarySoft: 'rgba(37,99,235,0.12)',
    danger: '#b42318',
    dangerFg: '#ffffff',
    dangerSoft: 'rgba(180,35,24,0.12)',
  },
  radius: {
    sm: 10,
    md: 12,
    lg: 16,
  },
  shadow: {
    sm: '0 1px 2px rgba(16,24,40,0.08)',
    md: '0 8px 24px rgba(16,24,40,0.14)',
  },
};

export function themeToVars(theme: Theme): Record<string, string> {
  return {
    '--nb-color-bg': theme.color.bg,
    '--nb-color-surface': theme.color.surface,
    '--nb-color-fg': theme.color.fg,
    '--nb-color-muted-fg': theme.color.mutedFg,
    '--nb-color-border': theme.color.border,
    '--nb-color-muted': theme.color.muted,
    '--nb-color-primary': theme.color.primary,
    '--nb-color-primary-fg': theme.color.primaryFg,
    '--nb-color-primary-soft': theme.color.primarySoft,
    '--nb-color-danger': theme.color.danger,
    '--nb-color-danger-fg': theme.color.dangerFg,
    '--nb-color-danger-soft': theme.color.dangerSoft,
    '--nb-radius-sm': `${theme.radius.sm}px`,
    '--nb-radius-md': `${theme.radius.md}px`,
    '--nb-radius-lg': `${theme.radius.lg}px`,
    '--nb-shadow-sm': theme.shadow.sm,
    '--nb-shadow-md': theme.shadow.md,
  };
}

export type ThemeProviderProps = React.HTMLAttributes<HTMLDivElement> & {
  theme?: Theme;
};

export function ThemeProvider({ theme = defaultTheme, style, ...props }: ThemeProviderProps) {
  const vars = themeToVars(theme);
  const { children, ...rest } = props;
  return React.createElement('div', { ...rest, style: { ...(vars as React.CSSProperties), ...style } }, children);
}

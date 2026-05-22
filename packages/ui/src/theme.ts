import * as React from 'react';

export type Theme = {
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl?: number;
  };
  shadow: {
    sm: string;
    md: string;
    focus?: string;
  };
  space?: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
  };
  motion?: {
    fast: string;
    normal: string;
    ease: string;
  };
};

export const defaultTheme: Theme = {
  radius: {
    sm: 6,
    md: 8,
    lg: 8,
    xl: 8,
  },
  shadow: {
    sm: '0 0 1px rgba(0,0,0,0.2)',
    md: '0 8px 24px rgba(16,24,40,0.14)',
    focus: '0 0 0 3px var(--nb-color-ring, rgba(37,99,235,0.28))',
  },
  space: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
  },
  motion: {
    fast: '120ms',
    normal: '180ms',
    ease: 'cubic-bezier(0.2, 0, 0, 1)',
  },
};

export function themeToVars(theme: Theme): Record<string, string> {
  return {
    '--nb-radius-sm': `${theme.radius.sm}px`,
    '--nb-radius-md': `${theme.radius.md}px`,
    '--nb-radius-lg': `${theme.radius.lg}px`,
    '--nb-radius-xl': `${theme.radius.xl ?? theme.radius.lg}px`,
    '--nb-shadow-sm': theme.shadow.sm,
    '--nb-shadow-md': theme.shadow.md,
    '--nb-shadow-focus': theme.shadow.focus ?? '0 0 0 3px var(--nb-color-ring, rgba(37,99,235,0.28))',
    '--nb-space-xs': `${theme.space?.xs ?? 6}px`,
    '--nb-space-sm': `${theme.space?.sm ?? 10}px`,
    '--nb-space-md': `${theme.space?.md ?? 14}px`,
    '--nb-space-lg': `${theme.space?.lg ?? 18}px`,
    '--nb-motion-fast': theme.motion?.fast ?? '120ms',
    '--nb-motion-normal': theme.motion?.normal ?? '180ms',
    '--nb-motion-ease': theme.motion?.ease ?? 'cubic-bezier(0.2, 0, 0, 1)',
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

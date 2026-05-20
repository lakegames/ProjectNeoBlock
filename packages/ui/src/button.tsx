import * as React from 'react';

export type ButtonTone = 'neutral' | 'primary' | 'danger';
export type ButtonVariant = 'solid' | 'soft' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & {
  tone?: ButtonTone;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '8px 12px', borderRadius: 10, fontSize: 14, lineHeight: '20px' },
  md: { padding: '10px 14px', borderRadius: 12, fontSize: 14, lineHeight: '20px' },
};

function getVariantStyle(tone: ButtonTone, variant: ButtonVariant): React.CSSProperties {
  const primary = 'var(--nb-color-primary, #2563eb)';
  const primaryFg = 'var(--nb-color-primary-fg, #ffffff)';
  const danger = 'var(--nb-color-danger, #b42318)';
  const dangerFg = 'var(--nb-color-danger-fg, #ffffff)';
  const surface = 'var(--nb-color-surface, #ffffff)';
  const fg = 'var(--nb-color-fg, rgba(0,0,0,0.92))';
  const border = 'var(--nb-color-border, rgba(0,0,0,0.12))';
  const muted = 'var(--nb-color-muted, rgba(0,0,0,0.06))';

  const toneBg = tone === 'primary' ? primary : tone === 'danger' ? danger : surface;
  const toneFg = tone === 'primary' ? primaryFg : tone === 'danger' ? dangerFg : fg;

  if (variant === 'solid') {
    return { background: toneBg, color: toneFg, border: tone === 'neutral' ? `1px solid ${border}` : '1px solid transparent' };
  }
  if (variant === 'soft') {
    const softBg = tone === 'primary' ? 'var(--nb-color-primary-soft, rgba(37,99,235,0.12))' : tone === 'danger' ? 'var(--nb-color-danger-soft, rgba(180,35,24,0.12))' : muted;
    const softFg = tone === 'primary' ? primary : tone === 'danger' ? danger : fg;
    return { background: softBg, color: softFg, border: `1px solid ${border}` };
  }
  const ghostFg = tone === 'primary' ? primary : tone === 'danger' ? danger : fg;
  return { background: 'transparent', color: ghostFg, border: `1px solid ${border}` };
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = 'neutral', variant = 'solid', size = 'md', style, disabled, ...props },
  ref,
) {
  const base: React.CSSProperties = {
    cursor: disabled ? 'not-allowed' : 'pointer',
    userSelect: 'none',
    fontWeight: 600,
    outline: 'none',
    transition: 'transform 120ms ease, opacity 120ms ease, background 120ms ease, border-color 120ms ease',
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <button
      {...props}
      ref={ref}
      disabled={disabled}
      style={{
        ...base,
        ...sizeStyles[size],
        ...getVariantStyle(tone, variant),
        ...style,
      }}
    />
  );
});

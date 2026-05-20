"use client";

import * as React from 'react';

export type InputSize = 'sm' | 'md';

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  size?: InputSize;
};

const sizeStyles: Record<InputSize, React.CSSProperties> = {
  sm: { padding: '8px 12px', borderRadius: 10, fontSize: 14, lineHeight: '20px' },
  md: { padding: '10px 12px', borderRadius: 12, fontSize: 14, lineHeight: '20px' },
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ size = 'md', style, disabled, ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      disabled={disabled}
      style={{
        ...sizeStyles[size],
        border: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
        background: 'var(--nb-color-surface, #fff)',
        color: 'var(--nb-color-fg, rgba(0,0,0,0.92))',
        outline: 'none',
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    />
  );
});

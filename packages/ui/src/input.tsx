"use client";

import * as React from 'react';

export type InputSize = 'sm' | 'md';

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  size?: InputSize;
};

const sizeStyles: Record<InputSize, React.CSSProperties> = {
  sm: { padding: '0 6px', borderRadius: 6, fontSize: 14, lineHeight: '20px' },
  md: { padding: '0 8px', borderRadius: 8, fontSize: 18, lineHeight: '24px' },
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ size = 'md', style, disabled, className, ...props }, ref) {
  const mergedClassName = ['nb-input', className].filter(Boolean).join(' ');
  return (
    <input
      {...props}
      ref={ref}
      disabled={disabled}
      className={mergedClassName}
      style={{
        ...sizeStyles[size],
        ...style,
      }}
    />
  );
});

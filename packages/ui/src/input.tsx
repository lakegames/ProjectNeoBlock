"use client";

import * as React from "react";

export type InputSize = "md" | "lg";

export type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> & {
  size?: InputSize;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ size = "md", style, disabled, className, ...props }, ref) {
    const mergedClassName = ["nb-input", className].filter(Boolean).join(" ");
    return (
      <input
        {...props}
        ref={ref}
        disabled={disabled}
        className={mergedClassName}
        data-size={size}
        style={style}
      />
    );
  },
);

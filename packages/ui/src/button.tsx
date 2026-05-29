import * as React from "react";

import type { IconProps } from "./icons";
import { Icon } from "./icons";

export type ButtonMode =
  | "Primary"
  | "Second"
  | "Default"
  | "Default-Custom"
  | "NoBackground"
  | "NoBackground-Custom";
export type ButtonSize = "sm" | "md";

export type ButtonIconProps = Omit<IconProps, "width" | "height"> & {
  width?: number;
  height?: number;
};

export type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "color"
> & {
  mode?: ButtonMode;
  size?: ButtonSize;
  loading?: boolean;
  loadingIcon?: React.ReactNode;
  iconLeft?: ButtonIconProps;
  iconRight?: ButtonIconProps;
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: "2px 4px", borderRadius: 8, fontSize: 16, lineHeight: "20px" },
  md: { padding: "4px 8px", borderRadius: 8, fontSize: 18, lineHeight: "24px" },
};

const iconSizes: Record<ButtonSize, number> = { sm: 16, md: 18 };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      mode = "Default",
      size = "md",
      style,
      disabled,
      loading,
      loadingIcon,
      iconLeft,
      iconRight,
      className,
      children,
      ...props
    },
    ref,
  ) {
    const mergedClassName = ["nb-button", className].filter(Boolean).join(" ");
    const isDisabled = !!disabled || !!loading;
    const loadingNode =
      loadingIcon ??
      React.createElement(
        "span",
        { className: "nb-spinner", "aria-hidden": true },
        React.createElement(
          "svg",
          {
            width: 16,
            height: 16,
            viewBox: "0 0 24 24",
            style: { animation: "nb-spin 700ms linear infinite" },
          },
          React.createElement("circle", {
            cx: 12,
            cy: 12,
            r: 9,
            fill: "none",
            stroke: "currentColor",
            strokeOpacity: 0.25,
            strokeWidth: 3,
          }),
          React.createElement("path", {
            d: "M21 12a9 9 0 0 0-9-9",
            fill: "none",
            stroke: "currentColor",
            strokeLinecap: "round",
            strokeWidth: 3,
          }),
        ),
      );

    const iconSize = iconSizes[size];
    const leftIconNode =
      !loading && iconLeft ? (
        <Icon
          {...iconLeft}
          width={iconLeft.width ?? iconSize}
          height={iconLeft.height ?? iconSize}
        />
      ) : null;
    const rightIconNode =
      !loading && iconRight ? (
        <Icon
          {...iconRight}
          width={iconRight.width ?? iconSize}
          height={iconRight.height ?? iconSize}
        />
      ) : null;

    return (
      <button
        {...props}
        ref={ref}
        disabled={isDisabled}
        className={mergedClassName}
        data-mode={mode}
        aria-busy={loading ? true : undefined}
        style={{
          ...sizeStyles[size],
          ...style,
        }}
      >
        {loading ? loadingNode : null}
        {leftIconNode}
        {children}
        {rightIconNode}
      </button>
    );
  },
);

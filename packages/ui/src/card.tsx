import * as React from "react";

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  radius?: number;
  shadow?: string;
  shadowHover?: string;
  border?: string;
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    interactive,
    radius,
    shadow,
    shadowHover,
    border,
    className,
    style,
    ...props
  },
  ref,
) {
  const mergedClassName = ["nb-card", className].filter(Boolean).join(" ");
  const mergedStyle: React.CSSProperties = {
    ...(radius !== undefined
      ? ({ ["--nb-card-radius" as any]: `${radius}px` } as React.CSSProperties)
      : null),
    ...(shadow
      ? ({ ["--nb-card-shadow" as any]: shadow } as React.CSSProperties)
      : null),
    ...(shadowHover
      ? ({
          ["--nb-card-shadow-hover" as any]: shadowHover,
        } as React.CSSProperties)
      : null),
    ...(border ? ({ border } as React.CSSProperties) : null),
    ...style,
  };
  return (
    <div
      {...props}
      ref={ref}
      className={mergedClassName}
      data-interactive={interactive ? "true" : undefined}
      style={mergedStyle}
    />
  );
});

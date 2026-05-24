import * as React from "react";

import { icons } from "./generated/registry";
import type {
  IconKey,
  IconMode,
  IconName,
  IconThickness,
  IconVariant,
} from "./generated/registry";

export type IconProps = Omit<React.SVGProps<SVGSVGElement>, "name"> & {
  id?: IconKey;
  name?: IconName;
  mode?: IconMode;
  thickness?: IconThickness;
  variant?: IconVariant;
};

export function Icon({
  id,
  name,
  mode,
  thickness,
  variant,
  ...props
}: IconProps) {
  const resolvedMode = mode ?? variant;
  const resolvedId =
    id ??
    (name && resolvedMode && thickness
      ? `${name}--${resolvedMode}--${thickness}`
      : name && resolvedMode
        ? `${name}--${resolvedMode}`
        : undefined);
  const Component =
    resolvedId && resolvedId in icons
      ? (
          icons as Record<
            string,
            React.ComponentType<React.SVGProps<SVGSVGElement>>
          >
        )[resolvedId]
      : null;

  if (!Component) return null;

  return (
    <Component
      aria-hidden={props["aria-label"] ? undefined : true}
      focusable="false"
      {...props}
    />
  );
}

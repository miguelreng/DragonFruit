/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType, SVGProps } from "react";
import type { IconWeight } from "@solar-icons/react";

type SolarSidebarIconComponent = ComponentType<SVGProps<SVGSVGElement> & { weight?: IconWeight }>;
type SolarSidebarIconProps = SVGProps<SVGSVGElement>;

const INACTIVE_WEIGHT: IconWeight = "Outline";
const ACTIVE_WEIGHT: IconWeight = "BoldDuotone";
const INACTIVE_SCALE = 1.05;

export const createSolarSidebarIcon = (Icon: SolarSidebarIconComponent, weight: IconWeight) => {
  const SolarSidebarIcon = ({ className, style, ...props }: SolarSidebarIconProps) => {
    const isInactive = weight === INACTIVE_WEIGHT;
    const mergedStyle = isInactive
      ? {
          ...style,
          transform: style?.transform ? `${style.transform} scale(${INACTIVE_SCALE})` : `scale(${INACTIVE_SCALE})`,
          transformOrigin: style?.transformOrigin ?? "center",
        }
      : style;

    return <Icon {...props} className={className} style={mergedStyle} weight={weight} />;
  };

  SolarSidebarIcon.displayName = `SolarSidebarIcon(${Icon.displayName ?? Icon.name ?? "Icon"}:${weight})`;

  return SolarSidebarIcon;
};

export const createSolarSidebarIconPair = (Icon: SolarSidebarIconComponent) => ({
  icon: createSolarSidebarIcon(Icon, INACTIVE_WEIGHT),
  activeIcon: createSolarSidebarIcon(Icon, ACTIVE_WEIGHT),
});

export const renderSolarSidebarIcon = (
  Icon: SolarSidebarIconComponent,
  isActive: boolean,
  className?: string
) => (
  <Icon
    className={className}
    style={
      isActive
        ? undefined
        : {
            transform: `scale(${INACTIVE_SCALE})`,
            transformOrigin: "center",
          }
    }
    weight={isActive ? ACTIVE_WEIGHT : INACTIVE_WEIGHT}
  />
);

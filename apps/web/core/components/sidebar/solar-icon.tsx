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
const ACTIVE_WEIGHT: IconWeight = "Bold";
const INACTIVE_STROKE_WIDTH = 0.9;

export const createSolarSidebarIcon = (Icon: SolarSidebarIconComponent, weight: IconWeight) => {
  const SolarSidebarIcon = ({ className, ...props }: SolarSidebarIconProps) => (
    <Icon
      {...props}
      className={className}
      paintOrder={weight === INACTIVE_WEIGHT ? "stroke fill" : props.paintOrder}
      strokeLinecap={weight === INACTIVE_WEIGHT ? "round" : props.strokeLinecap}
      strokeLinejoin={weight === INACTIVE_WEIGHT ? "round" : props.strokeLinejoin}
      strokeWidth={weight === INACTIVE_WEIGHT ? INACTIVE_STROKE_WIDTH : props.strokeWidth}
      weight={weight}
    />
  );

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
    paintOrder={isActive ? undefined : "stroke fill"}
    strokeLinecap={isActive ? undefined : "round"}
    strokeLinejoin={isActive ? undefined : "round"}
    strokeWidth={isActive ? undefined : INACTIVE_STROKE_WIDTH}
    weight={isActive ? ACTIVE_WEIGHT : INACTIVE_WEIGHT}
  />
);

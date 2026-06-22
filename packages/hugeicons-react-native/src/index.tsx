import * as React from "react";
import { type Icon, type IconProps, IconStyle } from "@solar-icons/react-native";

export type IconSvgElement = Icon;

export interface HugeiconsIconProps extends Omit<IconProps, "size" | "color"> {
  icon: IconSvgElement;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function HugeiconsIcon({ icon: Icon, size = 24, color = "currentColor", strokeWidth: _strokeWidth, ...rest }: HugeiconsIconProps) {
  return <Icon {...rest} size={size} color={color} />;
}

export { IconStyle };

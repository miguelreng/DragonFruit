import { View } from "react-native";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react-native";

import { colors } from "@/lib/theme";

type AppIconProps = {
  icon: IconSvgElement;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

/**
 * Thin wrapper over Hugeicons so the app has one visual rhythm for icon size,
 * stroke, and color defaults.
 *
 * The icon is boxed in a fixed-size View: react-native-svg sets the SVG's size
 * via element props, not Yoga style, so under the New Architecture a bare <Svg>
 * reports an indeterminate layout size. As a naked flex child that disturbs the
 * row it sits in (the symptom that collapsed the sidebar rows). A wrapper with
 * concrete width/height gives Yoga a deterministic box, so icon+label rows lay
 * out reliably everywhere.
 */
export function AppIcon({ icon, size = 20, color = colors.body, strokeWidth = 1.9 }: AppIconProps) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <HugeiconsIcon icon={icon} size={size} color={color} strokeWidth={strokeWidth} />
    </View>
  );
}

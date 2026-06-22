import { View } from "react-native";

import type { AppIconComponent } from "@/lib/icons";
import { colors } from "@/lib/theme";

type AppIconProps = {
  icon: AppIconComponent;
  size?: number;
  color?: string;
  /**
   * Retained for call-site compatibility. Solar icons encode stroke via the
   * icon weight (we use the thin "Linear" set), so this is intentionally ignored.
   */
  strokeWidth?: number;
};

/**
 * Thin wrapper over Solar icons so the app has one visual rhythm for icon size
 * and color defaults.
 *
 * The icon is boxed in a fixed-size View: react-native-svg sets the SVG's size
 * via element props, not Yoga style, so under the New Architecture a bare <Svg>
 * reports an indeterminate layout size. As a naked flex child that disturbs the
 * row it sits in (the symptom that collapsed the sidebar rows). A wrapper with
 * concrete width/height gives Yoga a deterministic box, so icon+label rows lay
 * out reliably everywhere.
 */
export function AppIcon({ icon: Icon, size = 20, color = colors.body }: AppIconProps) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Icon size={size} color={color} />
    </View>
  );
}

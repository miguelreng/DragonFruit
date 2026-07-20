import { useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { colors } from "@/lib/theme";

// Numeric ports of the web loader's matching SVG paths. Each path has the
// same M + 4×C command structure, so the points can interpolate smoothly.
const CIRCLE_A = [
  12, 8, 14.21, 8, 16, 9.79, 16, 12, 16, 14.21, 14.21, 16, 12, 16, 9.79, 16, 8, 14.21, 8, 12, 8, 9.79, 9.79, 8, 12, 8,
] as const;
const INFINITY = [
  12, 12, 14, 8.5, 19, 8.5, 19, 12, 19, 15.5, 14, 15.5, 12, 12, 10, 8.5, 5, 8.5, 5, 12, 5, 15.5, 10, 15.5, 12, 12,
] as const;
const CIRCLE_B = [
  12, 16, 14.21, 16, 16, 14.21, 16, 12, 16, 9.79, 14.21, 8, 12, 8, 9.79, 8, 8, 9.79, 8, 12, 8, 14.21, 9.79, 16, 12, 16,
] as const;

const AnimatedPath = Animated.createAnimatedComponent(Path);

function morphPath(progress: number): string {
  "worklet";
  const clamped = Math.max(0, Math.min(3.9999, progress));
  const segment = Math.floor(clamped);
  const local = clamped - segment;
  // Smoothstep closely matches the web loader's ease-in-out spline per leg.
  const eased = local * local * (3 - 2 * local);
  const from = segment === 0 ? CIRCLE_A : segment === 1 ? INFINITY : segment === 2 ? CIRCLE_B : INFINITY;
  const to = segment === 0 ? INFINITY : segment === 1 ? CIRCLE_B : segment === 2 ? INFINITY : CIRCLE_A;
  const value = (index: number) => from[index] + (to[index] - from[index]) * eased;

  return `M ${value(0)} ${value(1)} C ${value(2)} ${value(3)} ${value(4)} ${value(5)} ${value(6)} ${value(7)} C ${value(8)} ${value(9)} ${value(10)} ${value(11)} ${value(12)} ${value(13)} C ${value(14)} ${value(15)} ${value(16)} ${value(17)} ${value(18)} ${value(19)} C ${value(20)} ${value(21)} ${value(22)} ${value(23)} ${value(24)} ${value(25)} Z`;
}

export function MorphingInfinityLoader({
  size = 56,
  color = colors.brandText,
  durationMs = 1800,
  accessibilityLabel = "Loading",
}: {
  size?: number;
  color?: string;
  durationMs?: number;
  accessibilityLabel?: string;
}) {
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState === "active");
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    cancelAnimation(progress);
    if (reducedMotion || !active) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(withTiming(4, { duration: durationMs }), -1, false);
    return () => cancelAnimation(progress);
  }, [active, durationMs, progress, reducedMotion]);

  const animatedProps = useAnimatedProps(() => ({ d: morphPath(progress.value) }));

  return (
    <View
      style={[styles.frame, { width: size, height: size }]}
      accessible={accessibilityLabel.length > 0}
      accessibilityRole={accessibilityLabel.length > 0 ? "progressbar" : undefined}
      accessibilityLabel={accessibilityLabel || undefined}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <AnimatedPath
          animatedProps={animatedProps}
          d={morphPath(reducedMotion ? 1 : 0)}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center" },
});

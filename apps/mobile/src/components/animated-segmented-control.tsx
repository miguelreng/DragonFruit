import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppIcon } from "@/components/app-icon";
import type { AppIconComponent } from "@/lib/icons";
import { motion } from "@/lib/motion";
import { colors, font, radius, shadow, spacing } from "@/lib/theme";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: AppIconComponent;
};

type AnimatedSegmentedControlProps<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
  pill?: boolean;
  accessibilityLabel: string;
};

const TRACK_PADDING = 3;

/**
 * Native counterpart to the web Tabs indicator: the selected surface moves
 * under the labels with the same 200ms ease-in-out curve.
 */
export function AnimatedSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  pill = false,
  accessibilityLabel,
}: AnimatedSegmentedControlProps<T>) {
  const [trackWidth, setTrackWidth] = useState(0);
  const reducedMotion = useReducedMotion();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const position = useSharedValue(selectedIndex);

  useEffect(() => {
    position.value = reducedMotion
      ? selectedIndex
      : withTiming(selectedIndex, {
          duration: motion.tabs.duration,
          easing: Easing.bezier(...motion.tabs.easing),
        });
  }, [position, reducedMotion, selectedIndex]);

  const segmentWidth = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / options.length : 0;
  const indicatorStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: position.value * segmentWidth }],
  }));

  const onLayout = (event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      style={[styles.track, compact && styles.trackCompact, pill && styles.trackPill]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {trackWidth > 0 ? (
        <Animated.View
          style={[styles.indicator, compact && styles.indicatorCompact, pill && styles.indicatorPill, indicatorStyle]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={({ pressed }) => [styles.segment, compact && styles.segmentCompact, pressed && styles.pressed]}
          >
            {option.icon ? (
              <AppIcon
                icon={option.icon}
                size={compact ? 15 : 18}
                color={selected ? colors.ink : colors.textPlaceholder}
                strokeWidth={1.9}
              />
            ) : null}
            <Text style={[styles.label, compact && styles.labelCompact, selected && styles.labelSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: "relative",
    flexDirection: "row",
    height: 44,
    padding: TRACK_PADDING,
    borderRadius: radius.md,
    backgroundColor: colors.layer1Active,
  },
  trackCompact: { height: 36, borderRadius: radius.sm },
  trackPill: { borderRadius: radius.pill },
  indicator: {
    position: "absolute",
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  indicatorCompact: { borderRadius: 6 },
  indicatorPill: { borderRadius: radius.pill },
  segment: {
    zIndex: 1,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.sm,
  },
  segmentCompact: { gap: spacing.xs },
  pressed: { opacity: 0.68 },
  label: {
    color: colors.textPlaceholder,
    fontFamily: "Figtree_500Medium",
    fontSize: font.size.sm,
  },
  labelCompact: { fontSize: font.size.xs },
  labelSelected: { color: colors.ink, fontFamily: "Figtree_600SemiBold" },
});

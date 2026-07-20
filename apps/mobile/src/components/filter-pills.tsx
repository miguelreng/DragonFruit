import { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { PressableScale } from "@/components/pressable-scale";
import { motion } from "@/lib/motion";
import { colors, font, radius, spacing } from "@/lib/theme";

export type FilterOption = { id: string; label: string };

function FilterPill({
  active,
  id,
  label,
  onPress,
}: {
  active: boolean;
  id: string | null;
  label: string;
  onPress: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = reducedMotion
      ? active
        ? 1
        : 0
      : withTiming(active ? 1 : 0, { duration: motion.duration.control });
  }, [active, progress, reducedMotion]);

  const activeBackgroundStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.94 + progress.value * 0.06 }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.textSecondary, colors.white]),
  }));

  return (
    <PressableScale
      key={id ?? "__all__"}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <View style={styles.pill}>
        <Animated.View pointerEvents="none" style={[styles.pillActiveBackground, activeBackgroundStyle]} />
        <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
      </View>
    </PressableScale>
  );
}

/**
 * A horizontal, scrollable row of filter pills: a leading "All" pill plus one
 * per option (project). The selected pill is filled with the accent; the rest
 * are subtle. Shared by Docs and My tasks to filter by project.
 */
export function FilterPills({
  options,
  value,
  onChange,
  allLabel = "All",
}: {
  options: FilterOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  allLabel?: string;
}) {
  const renderPill = (id: string | null, label: string) => {
    const active = value === id;
    return <FilterPill key={id ?? "__all__"} id={id} active={active} label={label} onPress={() => onChange(id)} />;
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {renderPill(null, allLabel)}
      {options.map((option) => renderPill(option.id, option.label))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A horizontal ScrollView in a flex column will grow to fill vertical space
  // unless pinned — keep it to its content height.
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  pill: {
    overflow: "hidden",
    maxWidth: 180,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  pillActiveBackground: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.pill,
    backgroundColor: colors.accentPrimary,
  },
  label: { zIndex: 1, fontSize: font.size.sm, fontFamily: "Figtree_500Medium" },
});

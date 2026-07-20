import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppIcon } from "@/components/app-icon";
import { Avatar } from "@/components/avatar";
import { selectionHaptic } from "@/lib/haptics";
import type { AppIconComponent } from "@/lib/icons";
import { colors, radius, spacing } from "@/lib/theme";

export type IslandTabOption<T extends string> = {
  value: T;
  label: string;
  icon: AppIconComponent;
  activeIcon?: AppIconComponent;
  /** When set, the tab renders this avatar instead of its icon (the account tab). */
  avatar?: { name: string; imageUrl?: string | null };
  /**
   * Marks a launcher (the Atlas assistant) rather than a toggle segment: its
   * icon always renders filled in the brand color so it reads as a distinct
   * entry point, never showing the selected-segment state.
   */
  emphasis?: boolean;
};

type IslandTabBarProps<T extends string> = {
  options: readonly IslandTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

type IslandTabProps = {
  option: IslandTabOption<string>;
  selected: boolean;
  onPress: () => void;
};

function IslandTab({ option, selected, onPress }: IslandTabProps) {
  const reducedMotion = useReducedMotion();
  const focus = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    focus.value = reducedMotion
      ? selected
        ? 1
        : 0
      : withTiming(selected ? 1 : 0, {
          duration: 300,
          easing: Easing.out(Easing.ease),
        });
  }, [focus, reducedMotion, selected]);

  const focusedBackgroundStyle = useAnimatedStyle(() => ({
    opacity: focus.value,
    transform: [{ scale: 0.8 + focus.value * 0.2 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={option.label}
      style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
    >
      <Animated.View pointerEvents="none" style={[styles.focusedBackground, focusedBackgroundStyle]} />
      {option.avatar ? (
        <View style={[styles.avatarRing, selected && styles.avatarRingActive]}>
          <Avatar name={option.avatar.name} imageUrl={option.avatar.imageUrl} size={24} circle />
        </View>
      ) : (
        <AppIcon
          icon={(option.emphasis || selected) && option.activeIcon ? option.activeIcon : option.icon}
          size={24}
          color={option.emphasis ? colors.brand : selected ? colors.accentPrimaryActive : colors.textTertiary}
          strokeWidth={1.9}
        />
      )}
    </Pressable>
  );
}

/** Compact, icon-only floating navigation adapted from the Linear-style reference bar. */
export function IslandTabBar<T extends string>({ options, value, onChange, accessibilityLabel }: IslandTabBarProps<T>) {
  const insets = useSafeAreaInsets();
  const glass = isLiquidGlassAvailable();

  const tabs = options.map((option) => (
    <IslandTab
      key={option.value}
      option={option}
      selected={option.value === value}
      onPress={() => {
        if (option.value === value) return;
        selectionHaptic();
        onChange(option.value);
      }}
    />
  ));

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: Math.max(insets.bottom, spacing.sm) }]}>
      {glass ? (
        <GlassView
          style={[styles.track, styles.trackGlass]}
          glassEffectStyle="regular"
          accessibilityRole="tablist"
          accessibilityLabel={accessibilityLabel}
        >
          {tabs}
        </GlassView>
      ) : (
        <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
          {tabs}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 20,
    alignItems: "center",
  },
  track: {
    position: "relative",
    flexDirection: "row",
    width: "100%",
    maxWidth: 360,
    height: 54,
    overflow: "hidden",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(255, 255, 255, 0.97)",
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  // With Liquid Glass the material itself is the surface, so drop the solid fill
  // and hard border and let the frosted glass show the content scrolling behind.
  trackGlass: {
    backgroundColor: "transparent",
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  tab: {
    flex: 1,
    minHeight: 44,
    margin: 5,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  tabPressed: { opacity: 0.68 },
  focusedBackground: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSubtleActive,
  },
  avatarRing: {
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: "transparent",
  },
  avatarRingActive: { borderColor: colors.accentPrimaryActive },
});

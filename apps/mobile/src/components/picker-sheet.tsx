import { useCallback, useEffect, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useAnimatedValue,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";
import { CheckmarkCircle02Icon } from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { PressableScale } from "@/components/pressable-scale";
import { motion } from "@/lib/motion";
import { colors, font, radius, spacing } from "@/lib/theme";

export type PickerOption = { id: string; label: string; color?: string };

const SCREEN_HEIGHT = Dimensions.get("window").height;

/** Bottom-sheet single-select picker (used for changing work-item state). */
export function PickerSheet({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  // Keep the sheet mounted through its exit animation, then unmount.
  const [rendered, setRendered] = useState(visible);
  const translateY = useAnimatedValue(SCREEN_HEIGHT);
  const backdrop = useAnimatedValue(0);

  const animateClose = useCallback(
    (after?: () => void) => {
      if (reducedMotion) {
        backdrop.setValue(0);
        translateY.setValue(SCREEN_HEIGHT);
        after?.();
        return;
      }
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 0,
          duration: motion.duration.control,
          easing: motion.easing.scrimOut,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: motion.duration.panelClose,
          easing: motion.easing.panelOut,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) after?.();
      });
    },
    [backdrop, reducedMotion, translateY]
  );

  useEffect(() => {
    if (!visible || rendered) return undefined;

    const frame = requestAnimationFrame(() => setRendered(true));
    return () => cancelAnimationFrame(frame);
  }, [rendered, visible]);

  useEffect(() => {
    if (!rendered) return;

    if (visible) {
      translateY.setValue(reducedMotion ? 0 : SCREEN_HEIGHT);
      backdrop.setValue(reducedMotion ? 1 : 0);
      if (reducedMotion) return;
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: motion.duration.panelClose,
          easing: motion.easing.scrimIn,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          ...motion.sheet.spring,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (rendered) {
      animateClose(() => setRendered(false));
    }
  }, [animateClose, backdrop, reducedMotion, rendered, translateY, visible]);

  // Parent callbacks update `visible`; the effect above owns the exit motion.
  // Calling them immediately also keeps selection feedback responsive and
  // avoids starting the close animation twice.
  const handleSelect = (id: string) => onSelect(id);

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill} accessibilityViewIsModal>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + spacing.md,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <ScrollView bounces={false}>
            {options.map((option) => (
              <PressableScale
                key={option.id}
                onPress={() => handleSelect(option.id)}
                style={({ pressed }) => pressed && styles.pressedDim}
              >
                <View style={styles.optionRow}>
                  {option.color ? <View style={[styles.optionDot, { backgroundColor: option.color }]} /> : null}
                  <Text style={styles.optionText}>{option.label}</Text>
                  {option.id === selectedId ? (
                    <AppIcon icon={CheckmarkCircle02Icon} size={18} color={colors.brandText} strokeWidth={1.9} />
                  ) : null}
                </View>
              </PressableScale>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "70%",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
    paddingTop: spacing.xs,
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  grabberWrap: {
    marginBottom: spacing.xs,
    alignItems: "center",
    paddingTop: 2,
  },
  grabber: {
    height: 4,
    width: 40,
    borderRadius: 999,
    backgroundColor: "rgba(0, 0, 0, 0.15)",
  },
  title: {
    paddingHorizontal: 20,
    paddingVertical: spacing.sm,
    fontSize: font.size.xs,
    color: colors.muted,
    fontFamily: "Figtree_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: 20,
    paddingVertical: spacing.md,
  },
  optionDot: { height: 12, width: 12, borderRadius: 999 },
  optionText: {
    flex: 1,
    fontSize: font.size.md,
    color: colors.ink,
    fontFamily: "Figtree_500Medium",
  },
  pressedDim: { opacity: 0.6 },
});

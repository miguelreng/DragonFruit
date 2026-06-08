import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useAnimatedValue,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckmarkCircle02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";

import { AppIcon } from "@/components/app-icon";
import { Avatar } from "@/components/avatar";
import type { Workspace } from "@/lib/api";
import { motion } from "@/lib/motion";
import { colors, font, radius, spacing } from "@/lib/theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;
// Drag past this (or flick faster than the velocity threshold) to dismiss.
const DRAG_CLOSE_DISTANCE = motion.sheet.closeDistance;
const DRAG_CLOSE_VELOCITY = motion.sheet.closeVelocity;

/**
 * Native-feeling bottom sheet for switching workspaces: a backdrop that fades
 * in, a sheet that springs up from the bottom, drag-to-dismiss on the handle,
 * and each workspace shown with its logo plus a check on the active one.
 *
 * Built on RN's Animated + PanResponder (no Reanimated) to stay robust on the
 * project's RN 0.85 / New-Arch setup.
 */
export function WorkspaceSwitcher({
  visible,
  workspaces,
  currentSlug,
  onSelect,
  onClose,
  onCreate,
}: {
  visible: boolean;
  workspaces: Workspace[];
  currentSlug?: string | null;
  onSelect: (slug: string) => void;
  onClose: () => void;
  onCreate?: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Keep the sheet mounted through its exit animation, then unmount.
  const [rendered, setRendered] = useState(visible);
  const translateY = useAnimatedValue(SCREEN_HEIGHT);
  const backdrop = useAnimatedValue(0);

  const animateClose = useCallback(
    (after?: () => void) => {
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
    [backdrop, translateY]
  );

  useEffect(() => {
    if (!visible || rendered) return undefined;

    const frame = requestAnimationFrame(() => setRendered(true));
    return () => cancelAnimationFrame(frame);
  }, [rendered, visible]);

  useEffect(() => {
    if (!rendered) return;

    if (visible) {
      translateY.setValue(SCREEN_HEIGHT);
      backdrop.setValue(0);
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: motion.duration.panelClose,
          easing: motion.easing.scrimIn,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, { toValue: 0, ...motion.sheet.spring, useNativeDriver: true }),
      ]).start();
    } else if (rendered) {
      animateClose(() => setRendered(false));
    }
  }, [animateClose, backdrop, rendered, translateY, visible]);

  // Drag-to-dismiss: follow the finger downward, snap closed past the threshold
  // (or on a fast flick), otherwise spring back to rest.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          if (g.dy > 0) translateY.setValue(g.dy);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy > DRAG_CLOSE_DISTANCE || g.vy > DRAG_CLOSE_VELOCITY) {
            animateClose(onClose);
          } else {
            Animated.spring(translateY, { toValue: 0, ...motion.sheet.settleSpring, useNativeDriver: true }).start();
          }
        },
      }),
    [animateClose, onClose, translateY]
  );

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => animateClose(onClose)} statusBarTranslucent>
      <View style={styles.fill}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={styles.fill} onPress={() => animateClose(onClose)} accessibilityLabel="Close" />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY }] }]}
        >
          {/* Drag handle — the whole header area is the drag target. */}
          <View {...pan.panHandlers} style={styles.handleArea}>
            <View style={styles.grabber} />
            <Text style={styles.title}>Switch workspace</Text>
          </View>

          <ScrollView bounces={false} style={styles.list} contentContainerStyle={styles.listContent}>
            {workspaces.map((w) => {
              const active = w.slug === currentSlug;
              return (
                <Pressable
                  key={w.slug}
                  onPress={() => {
                    onSelect(w.slug);
                    animateClose(onClose);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={w.name}
                  style={({ pressed }) => [styles.rowOuter, pressed && styles.rowPressed]}
                >
                  <View style={[styles.row, active && styles.rowActive]}>
                    <Avatar name={w.name} size={36} imageUrl={w.logo_url} />
                    <View style={styles.rowText}>
                      <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                        {w.name}
                      </Text>
                      {w.total_members ? (
                        <Text style={styles.meta} numberOfLines={1}>
                          {w.total_members} {w.total_members === 1 ? "member" : "members"}
                        </Text>
                      ) : null}
                    </View>
                    {active ? (
                      <AppIcon icon={CheckmarkCircle02Icon} size={22} color={colors.brandText} strokeWidth={2} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}

            {onCreate ? (
              <Pressable
                onPress={() => {
                  onCreate();
                  animateClose(onClose);
                }}
                accessibilityRole="button"
                accessibilityLabel="Create workspace"
                style={({ pressed }) => [styles.rowOuter, pressed && styles.rowPressed]}
              >
                <View style={styles.row}>
                  <View style={styles.createIcon}>
                    <AppIcon icon={PlusSignIcon} size={20} color={colors.muted} strokeWidth={2} />
                  </View>
                  <Text style={[styles.name, styles.createLabel]}>Create workspace</Text>
                </View>
              </Pressable>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "82%",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
    paddingTop: spacing.xs,
    // Soft top shadow so the sheet reads as a raised surface.
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  handleArea: { alignItems: "center", paddingTop: spacing.xs, paddingBottom: spacing.xs },
  grabber: { height: 5, width: 40, borderRadius: 999, backgroundColor: "rgba(0, 0, 0, 0.16)" },
  title: {
    alignSelf: "stretch",
    paddingHorizontal: 20,
    paddingTop: spacing.md,
    fontSize: font.size.xs,
    color: colors.muted,
    fontFamily: "Figtree_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  list: { alignSelf: "stretch" },
  listContent: { paddingHorizontal: spacing.sm, paddingTop: spacing.xs, gap: 2 },
  rowOuter: { borderRadius: radius.lg },
  rowPressed: { backgroundColor: colors.layerTransparentHover },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  rowActive: { backgroundColor: colors.layer1Hover },
  rowText: { flex: 1 },
  name: { fontSize: font.size.md, color: colors.ink, fontFamily: "Figtree_500Medium" },
  nameActive: { fontFamily: "Figtree_600SemiBold" },
  meta: { fontSize: font.size.xs, color: colors.faint, fontFamily: "Figtree_400Regular", marginTop: 1 },
  createIcon: {
    height: 36,
    width: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.layer1Hover,
  },
  createLabel: { color: colors.muted, fontFamily: "Figtree_600SemiBold" },
});

import type React from "react";
import { router, useNavigation } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DrawerActions } from "@react-navigation/native";
import { ArrowLeft01Icon, SidebarLeftIcon } from "@hugeicons/core-free-icons";

import { AppIcon } from "@/components/app-icon";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Header for workspace screens. Top-level views sit at the root of the stack
 * (the sidebar `replace`s between them), so they get a menu button that opens
 * the sidebar; screens pushed on top (details, new task) get a back arrow. We
 * read the stack index off the navigation object — `getState()` is scoped to
 * this stack and never throws, unlike `useNavigationState` which can fault when
 * the screen renders outside an active navigator (e.g. during a drawer reveal).
 */
export function ScreenHeader({
  title,
  right,
  onClose,
}: {
  title: string;
  right?: React.ReactNode;
  onClose?: () => void;
}) {
  const navigation = useNavigation();
  // A supplied `onClose` (e.g. the Atlas peek dismissing itself) takes the
  // leading slot with a back arrow; otherwise pushed screens go back and
  // top-level screens toggle the sidebar.
  const isPushed = (navigation.getState()?.index ?? 0) > 0;
  const showBack = onClose != null || isPushed;
  const onLeading = () => {
    if (onClose) onClose();
    else if (isPushed) router.back();
    else navigation.dispatch(DrawerActions.toggleDrawer());
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
      <View style={styles.row}>
        <Pressable
          onPress={onLeading}
          hitSlop={8}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressedDim]}
          accessibilityRole="button"
          accessibilityLabel={showBack ? "Go back" : "Open menu"}
        >
          <AppIcon icon={showBack ? ArrowLeft01Icon : SidebarLeftIcon} size={18} color={colors.ink} strokeWidth={1.9} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {right ? <View style={styles.rightWrap}>{right}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.canvas },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  // Subtle gray chip — the light-surface variant of the home top-bar chips, so
  // the header action reads as the same button across the app.
  backBtn: {
    height: 32,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.layer1Hover,
  },
  pressedDim: { opacity: 0.6 },
  titleWrap: { flex: 1 },
  rightWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { fontSize: font.size.lg, fontFamily: "Figtree_600SemiBold", color: colors.ink },
});

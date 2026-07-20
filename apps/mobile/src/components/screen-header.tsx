import type React from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft01Icon } from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { PressableScale } from "@/components/pressable-scale";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Header for secondary workspace screens. The focused mobile shell no longer
 * has a drawer, so every secondary route leads back to its caller or to the
 * workspace hub when opened directly from a deep link.
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
  const onLeading = () => {
    if (onClose) onClose();
    else if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
      <View style={styles.row}>
        <PressableScale
          onPress={onLeading}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressedDim}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <View style={styles.backBtn}>
            <AppIcon icon={ArrowLeft01Icon} size={18} color={colors.ink} strokeWidth={1.9} />
          </View>
        </PressableScale>
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
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pressedDim: { opacity: 0.6 },
  titleWrap: { flex: 1 },
  rightWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { fontSize: font.size.lg, fontFamily: "Figtree_600SemiBold", color: colors.ink },
});

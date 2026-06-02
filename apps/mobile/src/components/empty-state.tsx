import { StyleSheet, Text, View } from "react-native";
import type { IconSvgElement } from "@hugeicons/react-native";

import { AppIcon } from "@/components/app-icon";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Centered empty/error placeholder: a soft brand icon badge, a title, and a
 * supporting line. Shared by list screens so "nothing here" reads the same
 * everywhere instead of a lone line of muted text.
 */
export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: IconSvgElement;
  title: string;
  body?: string | null;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconBadge}>
        <AppIcon icon={icon} size={28} color={colors.brand} strokeWidth={1.8} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, paddingTop: 64 },
  iconBadge: {
    height: 64,
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    marginBottom: spacing.md,
  },
  title: { fontSize: font.size.md, fontFamily: "Figtree_600SemiBold", color: colors.ink, textAlign: "center" },
  body: {
    marginTop: spacing.xs,
    fontSize: font.size.sm,
    lineHeight: 20,
    color: colors.muted,
    fontFamily: "Figtree_400Regular",
    textAlign: "center",
  },
});

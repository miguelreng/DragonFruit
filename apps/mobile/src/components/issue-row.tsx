import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight01Icon, Calendar03Icon } from "@hugeicons/core-free-icons";

import { AppIcon } from "@/components/app-icon";
import type { IssueListItem } from "@/lib/api";
import { formatDueDate, PRIORITY_COLOR, PRIORITY_LABEL } from "@/lib/format";
import { colors, font, radius, shadow, spacing } from "@/lib/theme";

/**
 * A single work-item row, shared by the "My tasks" and project lists so the two
 * stay visually identical. Surfaces the priority (colored dot), reference, and —
 * when set — a due-date pill that turns red once overdue.
 */
export function IssueRow({
  issue,
  reference,
  onPress,
}: {
  issue: IssueListItem;
  /** Display reference, e.g. "PROJ-123" or "#12". */
  reference: string;
  onPress: () => void;
}) {
  const priority = issue.priority ?? "none";
  const hasPriority = priority !== "none";
  const due = formatDueDate(issue.target_date);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={issue.name}>
      {({ pressed }) => (
        <View style={[styles.card, pressed && styles.cardPressed]}>
          <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[priority] ?? PRIORITY_COLOR.none }]} />

          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {issue.name}
            </Text>

            <View style={styles.metaRow}>
              <Text style={styles.ref}>{reference}</Text>
              {hasPriority ? (
                <>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.priorityLabel}>{PRIORITY_LABEL[priority]}</Text>
                </>
              ) : null}
              {due ? (
                <View style={[styles.duePill, due.overdue && styles.duePillOverdue]}>
                  <AppIcon
                    icon={Calendar03Icon}
                    size={11}
                    color={due.overdue ? colors.danger : colors.muted}
                    strokeWidth={2}
                  />
                  <Text style={[styles.dueText, due.overdue && styles.dueTextOverdue]}>{due.label}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <AppIcon icon={ArrowRight01Icon} size={18} color={colors.faint} strokeWidth={1.9} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadow.card,
  },
  cardPressed: { backgroundColor: colors.layer1Hover, borderColor: colors.borderStrong },
  priorityDot: { height: 10, width: 10, borderRadius: 999 },
  body: { flex: 1, gap: 4 },
  title: { fontSize: font.size.md, color: colors.ink, fontFamily: "Figtree_600SemiBold" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  ref: { fontSize: font.size.xs, color: colors.muted, fontFamily: "Figtree_500Medium" },
  dot: { fontSize: font.size.xs, color: colors.faint, fontFamily: "Figtree_400Regular" },
  priorityLabel: { fontSize: font.size.xs, color: colors.muted, fontFamily: "Figtree_400Regular" },
  duePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.layer1,
  },
  duePillOverdue: { backgroundColor: colors.dangerSoft },
  dueText: { fontSize: font.size.xs, color: colors.muted, fontFamily: "Figtree_500Medium" },
  dueTextOverdue: { color: colors.danger },
});

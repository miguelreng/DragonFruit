import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { AppIcon } from "@/components/app-icon";
import { colors, font, radius, spacing } from "@/lib/theme";

export type PickerOption = { id: string; label: string; color?: string };

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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stop taps on the sheet itself from dismissing. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <ScrollView>
            {options.map((option) => (
              <Pressable key={option.id} onPress={() => onSelect(option.id)} style={({ pressed }) => pressed && styles.pressedDim}>
                <View style={styles.optionRow}>
                  {option.color ? (
                    <View style={[styles.optionDot, { backgroundColor: option.color }]} />
                  ) : null}
                  <Text style={styles.optionText}>{option.label}</Text>
                  {option.id === selectedId ? (
                    <AppIcon icon={CheckmarkCircle02Icon} size={18} color={colors.brandText} strokeWidth={1.9} />
                  ) : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  sheet: {
    maxHeight: "70%",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
  },
  grabberWrap: { marginBottom: spacing.xs, alignItems: "center", paddingTop: 2 },
  grabber: { height: 4, width: 40, borderRadius: 999, backgroundColor: "rgba(0, 0, 0, 0.15)" },
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
  optionText: { flex: 1, fontSize: font.size.md, color: colors.ink, fontFamily: "Figtree_500Medium" },
  pressedDim: { opacity: 0.6 },
});

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Delete02Icon, PlusSignIcon } from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { ScreenHeader } from "@/components/screen-header";
import { ScrollFade } from "@/components/scroll-fade";
import {
  createSticky,
  deleteSticky,
  getStickies,
  isAuthError,
  updateSticky,
  type Sticky,
} from "@/lib/api";
import { escapeHtml, stripHtml } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, font, radius, shadow, spacing } from "@/lib/theme";

/**
 * Sticky note palette — matches the web app's STICKY_COLORS_LIST keys and the
 * light-mode --editor-colors-*-background hex values (apps/web/styles/globals.css).
 * The API stores the key (e.g. "pink"); we map it to a fill + matching ink.
 */
const STICKY_COLORS = [
  { key: "gray", fill: "#d6d6d8" },
  { key: "peach", fill: "#ffd5d7" },
  { key: "pink", fill: "#fdd4e3" },
  { key: "orange", fill: "#ffe3cd" },
  { key: "green", fill: "#c3f0de" },
  { key: "light-blue", fill: "#c5eff9" },
  { key: "dark-blue", fill: "#c9dafb" },
  { key: "purple", fill: "#e3d8fd" },
] as const;

const DEFAULT_COLOR = STICKY_COLORS[2].key; // pink — the brand-adjacent default

/** Resolve a stored background_color (a palette key, or a raw hex on legacy data) to a fill. */
function fillFor(key?: string | null): string {
  if (!key) return STICKY_COLORS[0].fill;
  const match = STICKY_COLORS.find((c) => c.key === key);
  if (match) return match.fill;
  return key.startsWith("#") ? key : STICKY_COLORS[0].fill;
}

function textOf(s: Sticky): string {
  const body = s.description_html ? stripHtml(s.description_html) : "";
  return body || s.name || "";
}

export default function StickiesScreen() {
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();
  const { signOut } = useSession();

  const [items, setItems] = useState<Sticky[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Sticky | null>(null);
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState<string>(DEFAULT_COLOR);
  const [composerOpen, setComposerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await getStickies(workspaceSlug));
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't load stickies.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Split notes into two balanced columns for an authentic masonry sticky board.
  const [leftColumn, rightColumn] = useMemo(() => {
    const left: Sticky[] = [];
    const right: Sticky[] = [];
    items.forEach((sticky, i) => (i % 2 === 0 ? left : right).push(sticky));
    return [left, right];
  }, [items]);

  const openNew = () => {
    setEditing(null);
    setDraft("");
    // Rotate the default color so a fresh board isn't all one shade.
    setDraftColor(STICKY_COLORS[items.length % STICKY_COLORS.length].key);
    setComposerOpen(true);
  };
  const openEdit = (sticky: Sticky) => {
    setEditing(sticky);
    setDraft(textOf(sticky));
    setDraftColor(
      STICKY_COLORS.find((c) => c.key === sticky.background_color)?.key ?? DEFAULT_COLOR
    );
    setComposerOpen(true);
  };
  const closeComposer = () => {
    if (saving) return;
    setComposerOpen(false);
  };

  const save = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    const payload = {
      name: text.slice(0, 60),
      description_html: `<p>${escapeHtml(text)}</p>`,
      background_color: draftColor,
    };
    try {
      if (editing) {
        const updated = await updateSticky(workspaceSlug, editing.id, payload);
        setItems((prev) => prev.map((s) => (s.id === editing.id ? { ...s, ...updated, ...payload } : s)));
      } else {
        const created = await createSticky(workspaceSlug, payload);
        setItems((prev) => [{ ...created, ...payload }, ...prev]);
      }
      setComposerOpen(false);
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't save the sticky.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || saving) return;
    const id = editing.id;
    setSaving(true);
    setItems((prev) => prev.filter((s) => s.id !== id));
    setComposerOpen(false);
    setSaving(false);
    try {
      await deleteSticky(workspaceSlug, id);
    } catch {
      void load(); // restore the true list if the delete didn't take
    }
  };

  const renderNote = (item: Sticky) => (
    <Pressable
      key={item.id}
      onPress={() => openEdit(item)}
      accessibilityRole="button"
      accessibilityLabel="Edit sticky"
      style={({ pressed }) => [
        styles.note,
        { backgroundColor: fillFor(item.background_color) },
        pressed && styles.notePressed,
      ]}
    >
      <Text style={styles.noteText} numberOfLines={12}>
        {textOf(item) || "Empty note"}
      </Text>
    </Pressable>
  );

  const draftFill = fillFor(draftColor);

  return (
    <View style={styles.safe}>
      <ScreenHeader title="Stickies" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : items.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
        >
          <Text style={styles.empty}>{error ?? "No stickies yet. Tap + to jot one down."}</Text>
        </ScrollView>
      ) : (
        <ScrollFade bottomHeight={64}>
        <ScrollView
          contentContainerStyle={styles.board}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
          <View style={styles.columns}>
            <View style={styles.column}>{leftColumn.map(renderNote)}</View>
            <View style={styles.column}>{rightColumn.map(renderNote)}</View>
          </View>
        </ScrollView>
        </ScrollFade>
      )}

      <Pressable
        onPress={openNew}
        accessibilityRole="button"
        accessibilityLabel="New sticky"
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <AppIcon icon={PlusSignIcon} size={24} color={colors.white} strokeWidth={2} />
      </Pressable>

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={closeComposer}>
        <Pressable style={styles.backdrop} onPress={closeComposer}>
          <Pressable style={styles.sheetOuter} onPress={() => {}}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <SafeAreaView edges={["bottom"]} style={styles.sheet}>
                <View style={styles.grabberWrap}>
                  <View style={styles.grabber} />
                </View>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>{editing ? "Edit sticky" : "New sticky"}</Text>
                  {editing ? (
                    <Pressable onPress={() => void remove()} hitSlop={8} accessibilityLabel="Delete sticky">
                      <AppIcon icon={Delete02Icon} size={20} color={colors.danger} strokeWidth={1.9} />
                    </Pressable>
                  ) : null}
                </View>

                {/* Colored note preview — the input lives inside the sticky itself. */}
                <View style={[styles.composerNote, { backgroundColor: draftFill }]}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Write a note…"
                    placeholderTextColor="rgba(29, 31, 32, 0.4)"
                    style={styles.input}
                    multiline
                    autoFocus
                  />
                </View>

                {/* Color palette */}
                <View style={styles.palette}>
                  {STICKY_COLORS.map((c) => {
                    const selected = c.key === draftColor;
                    return (
                      <Pressable
                        key={c.key}
                        onPress={() => setDraftColor(c.key)}
                        accessibilityRole="button"
                        accessibilityLabel={`${c.key} note color`}
                        style={[styles.swatch, { backgroundColor: c.fill }, selected && styles.swatchSelected]}
                      />
                    );
                  })}
                </View>

                <Pressable
                  onPress={() => void save()}
                  disabled={saving || draft.trim().length === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Save sticky"
                  style={({ pressed }) => [
                    styles.saveBtn,
                    pressed && styles.saveBtnPressed,
                    (saving || draft.trim().length === 0) && styles.saveBtnDisabled,
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.saveText}>{editing ? "Save" : "Add sticky"}</Text>
                  )}
                </Pressable>
              </SafeAreaView>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const COLUMN_GAP = spacing.md;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  emptyWrap: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 80 },
  empty: { textAlign: "center", fontSize: font.size.sm, color: colors.muted, fontFamily: "Figtree_400Regular" },

  board: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 96 },
  errorBanner: {
    marginBottom: spacing.sm,
    fontSize: font.size.sm,
    color: colors.danger,
    fontFamily: "Figtree_400Regular",
    textAlign: "center",
  },
  columns: { flexDirection: "row", gap: COLUMN_GAP },
  column: { flex: 1, gap: COLUMN_GAP },

  note: {
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 96,
    ...shadow.card,
  },
  notePressed: { opacity: 0.85 },
  noteText: { fontSize: font.size.sm, lineHeight: 20, color: colors.ink, fontFamily: "Figtree_400Regular" },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    height: 56,
    width: 56,
    borderRadius: 28,
    backgroundColor: colors.accentPrimary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.button,
  },
  fabPressed: { backgroundColor: colors.accentPrimaryHover },

  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  sheetOuter: { width: "100%" },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  grabberWrap: { alignItems: "center", paddingVertical: spacing.xs },
  grabber: { height: 4, width: 40, borderRadius: 999, backgroundColor: "rgba(0, 0, 0, 0.15)" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  sheetTitle: { fontSize: font.size.md, color: colors.ink, fontFamily: "Figtree_600SemiBold" },

  composerNote: {
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  input: {
    minHeight: 120,
    maxHeight: 220,
    fontSize: font.size.md,
    lineHeight: 22,
    color: colors.ink,
    fontFamily: "Figtree_400Regular",
    textAlignVertical: "top",
  },

  palette: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  swatch: {
    height: 30,
    width: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.06)",
  },
  swatchSelected: { borderWidth: 2, borderColor: colors.ink },

  saveBtn: {
    marginTop: spacing.md,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accentPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnPressed: { backgroundColor: colors.accentPrimaryHover },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { fontSize: font.size.md, color: colors.white, fontFamily: "Figtree_600SemiBold" },
});

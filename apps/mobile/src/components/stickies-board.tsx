import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";

import { AppIcon } from "@/components/app-icon";
import { PressableScale } from "@/components/pressable-scale";
import { ScrollFade } from "@/components/scroll-fade";
import {
  EMPTY_STICKY_FORMAT_STATE,
  StickyRichEditor,
  type StickyFormatCommand,
  type StickyFormatState,
  type StickyRichEditorHandle,
} from "@/components/sticky-rich-editor";
import { createSticky, deleteSticky, getStickies, isAuthError, updateSticky, type Sticky } from "@/lib/api";
import { escapeHtml, stripHtml } from "@/lib/format";
import { commitHaptic, selectionHaptic } from "@/lib/haptics";
import {
  BoldIcon,
  BulletListIcon,
  Cancel01Icon,
  CodeIcon,
  Delete02Icon,
  ItalicIcon,
  NumberedListIcon,
} from "@/lib/icons";
import { useSession } from "@/lib/session";
import { colors, font, radius, shadow, spacing } from "@/lib/theme";

const STICKY_COLORS = [
  { key: "gray", fill: "#e2e0dc", fold: "#c8c5bf" },
  { key: "peach", fill: "#ffc9bd", fold: "#efa899" },
  { key: "pink", fill: "#f7bed8", fold: "#e79abf" },
  { key: "orange", fill: "#ffd092", fold: "#edb064" },
  { key: "green", fill: "#c8e8ad", fold: "#a7cf87" },
  { key: "light-blue", fill: "#bde5ea", fold: "#8fcbd3" },
  { key: "dark-blue", fill: "#bdd3f3", fold: "#91b4e4" },
  { key: "purple", fill: "#d9c5ee", fold: "#bba0d9" },
] as const;

const DEFAULT_COLOR = STICKY_COLORS[2].key;
const GRID_GAP = spacing.md;
// Keep sticky cards aligned with the docs grid cards.
const STICKY_CARD_HEIGHT = 156;
const AUTOSAVE_DELAY_MS = 700;

const FORMAT_ACTIONS: readonly {
  command: StickyFormatCommand;
  icon: typeof BoldIcon;
  label: string;
}[] = [
  { command: "bold", icon: BoldIcon, label: "Bold" },
  { command: "italic", icon: ItalicIcon, label: "Italic" },
  { command: "bulletList", icon: BulletListIcon, label: "Bulleted list" },
  { command: "numberedList", icon: NumberedListIcon, label: "Numbered list" },
  { command: "code", icon: CodeIcon, label: "Code block" },
];

type SaveState = "saved" | "unsaved" | "saving" | "error";

function fillFor(key?: string | null): string {
  if (!key) return STICKY_COLORS[0].fill;
  const match = STICKY_COLORS.find((color) => color.key === key);
  if (match) return match.fill;
  return key.startsWith("#") ? key : STICKY_COLORS[0].fill;
}

function foldFor(key?: string | null): string {
  const match = STICKY_COLORS.find((color) => color.key === key);
  return match?.fold ?? "rgba(29, 31, 32, 0.14)";
}

function textOf(sticky: Sticky): string {
  const body = sticky.description_html ? stripHtml(sticky.description_html) : "";
  return body || sticky.name || "";
}

/** Preserve stored HTML in the editor; legacy name-only stickies get one paragraph. */
function editorHtmlOf(sticky: Sticky): string {
  return sticky.description_html?.trim() || `<p>${escapeHtml(sticky.name || "")}</p>`;
}

function htmlName(html: string): string {
  return stripHtml(html).replace(/\s+/g, " ").trim().slice(0, 60) || "Untitled";
}

function contentOf(sticky: Sticky): { title: string; body: string } {
  const text = textOf(sticky).trim();
  const title = sticky.name?.trim() || text || "Empty note";
  const body = text.startsWith(title) ? text.slice(title.length).trim() : text;
  return { title, body };
}

function updatedLabel(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDelta = Math.round((startOfToday - startOfDate) / 86_400_000);
  if (dayDelta === 0) return "Today";
  if (dayDelta === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PaperFold({ color, large = false }: { color?: string | null; large?: boolean }) {
  const size = large ? 38 : 26;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.paperFold,
        {
          borderTopWidth: size,
          borderLeftWidth: size,
          borderTopColor: colors.canvas,
          borderLeftColor: foldFor(color),
        },
      ]}
    />
  );
}

type EditorPageProps = {
  sticky: Sticky;
  width: number;
  html: string;
  color: string;
  editorRef: (editor: StickyRichEditorHandle | null) => void;
  onChangeHtml: (html: string) => void;
  onFormatStateChange: (state: StickyFormatState) => void;
};

function EditorPage({ sticky, width, html, color, editorRef, onChangeHtml, onFormatStateChange }: EditorPageProps) {
  return (
    <View style={[styles.editorPage, { width }]}>
      <View style={styles.editorSticky}>
        <View style={[styles.editorPaper, { backgroundColor: fillFor(color) }]}>
          <PaperFold color={color} large />
          <StickyRichEditor
            ref={editorRef}
            initialHtml={html}
            onChangeHtml={onChangeHtml}
            onFormatStateChange={onFormatStateChange}
            accessibilityLabel={`Edit sticky ${sticky.name || "note"}`}
          />
        </View>
      </View>
    </View>
  );
}

export function StickiesBoard({ workspaceSlug }: { workspaceSlug: string }) {
  const { signOut } = useSession();
  const { width } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const pagerRef = useRef<FlatList<Sticky>>(null);
  const editorRefs = useRef<Record<string, StickyRichEditorHandle | null>>({});
  const newEditorRef = useRef<StickyRichEditorHandle>(null);
  const draftsRef = useRef<Record<string, string>>({});
  const draftColorsRef = useRef<Record<string, string>>({});
  const autosaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveChainsRef = useRef<Record<string, Promise<boolean>>>({});
  const [items, setItems] = useState<Sticky[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editorIndex, setEditorIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftColors, setDraftColors] = useState<Record<string, string>>({});
  const [newDraft, setNewDraft] = useState("");
  const [newColor, setNewColor] = useState<string>(DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [formatState, setFormatState] = useState<StickyFormatState>(EMPTY_STICKY_FORMAT_STATE);
  const [boardWidth, setBoardWidth] = useState(width);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await getStickies(workspaceSlug));
    } catch (caught) {
      if (isAuthError(caught)) {
        await signOut();
        return;
      }
      setError("Couldn't load your stickies.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [signOut, workspaceSlug]);

  useEffect(() => {
    let cancelled = false;
    void getStickies(workspaceSlug)
      .then((stickies) => {
        if (!cancelled) setItems(stickies);
      })
      .catch(async (caught: unknown) => {
        if (cancelled) return;
        if (isAuthError(caught)) {
          await signOut();
          return;
        }
        setError("Couldn't load your stickies.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signOut, workspaceSlug]);

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  // The hub's horizontal rail can report a width larger than the viewport
  // during a tab transition. Clamp the card math to the phone width so the
  // second column remains visible instead of being clipped off-screen.
  const gridWidth = Math.min(boardWidth, width);
  const cardWidth = useMemo(() => Math.max(0, (gridWidth - spacing.lg * 2 - GRID_GAP) / 2), [gridWidth]);
  const current = creating ? null : items[editorIndex];
  const currentHtml = current ? (drafts[current.id] ?? editorHtmlOf(current)) : newDraft;
  const currentColor = current ? (draftColors[current.id] ?? current.background_color ?? DEFAULT_COLOR) : newColor;

  const persistSticky = useCallback(
    async (sticky: Sticky, html: string, color: string): Promise<boolean> => {
      const timer = autosaveTimersRef.current[sticky.id];
      if (timer) clearTimeout(timer);
      delete autosaveTimersRef.current[sticky.id];

      const payload = {
        name: htmlName(html),
        description_html: html,
        background_color: color,
      };

      const previousSave = saveChainsRef.current[sticky.id] ?? Promise.resolve(true);
      const save = previousSave
        .catch(() => false)
        .then(async () => {
          setSaveStates((previous) => ({ ...previous, [sticky.id]: "saving" }));
          try {
            const updated = await updateSticky(workspaceSlug, sticky.id, payload);
            setItems((previous) =>
              previous.map((item) => (item.id === sticky.id ? { ...item, ...updated, ...payload } : item))
            );
            const hasNewerChanges =
              draftsRef.current[sticky.id] !== html || draftColorsRef.current[sticky.id] !== color;
            setSaveStates((previous) => ({ ...previous, [sticky.id]: hasNewerChanges ? "unsaved" : "saved" }));
            return true;
          } catch (caught) {
            if (isAuthError(caught)) {
              await signOut();
              return false;
            }
            setSaveStates((previous) => ({ ...previous, [sticky.id]: "error" }));
            setError("Couldn't save that sticky. Your draft is still here.");
            return false;
          }
        });
      saveChainsRef.current[sticky.id] = save;
      const result = await save;
      if (saveChainsRef.current[sticky.id] === save) delete saveChainsRef.current[sticky.id];
      return result;
    },
    [signOut, workspaceSlug]
  );

  const queueAutosave = useCallback(
    (sticky: Sticky, html: string, color: string) => {
      draftsRef.current[sticky.id] = html;
      draftColorsRef.current[sticky.id] = color;
      const pending = autosaveTimersRef.current[sticky.id];
      if (pending) clearTimeout(pending);
      setSaveStates((previous) => ({ ...previous, [sticky.id]: "unsaved" }));
      autosaveTimersRef.current[sticky.id] = setTimeout(() => {
        void persistSticky(sticky, draftsRef.current[sticky.id] ?? html, draftColorsRef.current[sticky.id] ?? color);
      }, AUTOSAVE_DELAY_MS);
    },
    [persistSticky]
  );

  useEffect(
    () => () => {
      Object.values(autosaveTimersRef.current).forEach(clearTimeout);
      autosaveTimersRef.current = {};
    },
    []
  );

  const prepareDrafts = () => {
    const nextDrafts = Object.fromEntries(items.map((item) => [item.id, editorHtmlOf(item)]));
    const nextColors = Object.fromEntries(items.map((item) => [item.id, item.background_color ?? DEFAULT_COLOR]));
    draftsRef.current = nextDrafts;
    draftColorsRef.current = nextColors;
    setDrafts(nextDrafts);
    setDraftColors(nextColors);
    setSaveStates(Object.fromEntries(items.map((item) => [item.id, "saved" as const])));
  };

  const openSticky = (index: number) => {
    selectionHaptic();
    Keyboard.dismiss();
    Object.values(editorRefs.current).forEach((editor) => editor?.blur());
    prepareDrafts();
    setCreating(false);
    setEditorIndex(index);
    setFormatState(EMPTY_STICKY_FORMAT_STATE);
    setEditorOpen(true);
  };

  const openNew = () => {
    selectionHaptic();
    setCreating(true);
    setNewDraft("");
    setNewColor(STICKY_COLORS[items.length % STICKY_COLORS.length].key);
    setFormatState(EMPTY_STICKY_FORMAT_STATE);
    setEditorOpen(true);
  };

  const dismissEditor = () => {
    selectionHaptic();
    setEditorOpen(false);
  };

  const closeEditor = () => {
    if (saving) return;
    if (creating) {
      if (!stripHtml(newDraft).trim()) {
        dismissEditor();
        return;
      }
      Alert.alert("Discard this sticky?", "This new note hasn't been added yet.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: dismissEditor },
      ]);
      return;
    }

    const dirty = items.filter((item) => {
      const state = saveStates[item.id];
      return state === "unsaved" || state === "saving" || state === "error";
    });
    if (dirty.length === 0) {
      dismissEditor();
      return;
    }

    void (async () => {
      setSaving(true);
      const results = await Promise.all(
        dirty.map((item) =>
          persistSticky(
            item,
            draftsRef.current[item.id] ?? editorHtmlOf(item),
            draftColorsRef.current[item.id] ?? item.background_color ?? DEFAULT_COLOR
          )
        )
      );
      setSaving(false);
      if (results.every(Boolean)) dismissEditor();
    })();
  };

  const onEditorShow = () => {
    if (!creating && items.length > 0) {
      requestAnimationFrame(() => pagerRef.current?.scrollToIndex({ index: editorIndex, animated: false }));
    }
  };

  const setCurrentHtml = (html: string) => {
    if (current) {
      setDrafts((previous) => ({ ...previous, [current.id]: html }));
      queueAutosave(current, html, draftColorsRef.current[current.id] ?? currentColor);
    } else setNewDraft(html);
  };

  const setCurrentColor = (color: string) => {
    selectionHaptic();
    if (current) {
      setDraftColors((previous) => ({ ...previous, [current.id]: color }));
      queueAutosave(current, draftsRef.current[current.id] ?? currentHtml, color);
    } else setNewColor(color);
  };

  const runFormat = (command: StickyFormatCommand) => {
    const editor = creating ? newEditorRef.current : current ? editorRefs.current[current.id] : null;
    if (!editor) return;
    selectionHaptic();
    editor.runCommand(command);
  };

  const save = async () => {
    const hasContent = stripHtml(currentHtml).trim().length > 0;
    if ((!current && !hasContent) || saving) return;
    setSaving(true);
    setError(null);

    try {
      if (current) {
        await persistSticky(current, currentHtml, currentColor);
      } else {
        const payload = {
          name: htmlName(currentHtml),
          description_html: currentHtml,
          background_color: currentColor,
        };
        const created = await createSticky(workspaceSlug, payload);
        commitHaptic();
        setItems((previous) => [{ ...created, ...payload }, ...previous]);
        setEditorOpen(false);
      }
    } catch (caught) {
      if (isAuthError(caught)) {
        await signOut();
        return;
      }
      setError("Couldn't save that sticky. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!current || saving) return;
    Alert.alert("Delete sticky?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            const pending = autosaveTimersRef.current[current.id];
            if (pending) clearTimeout(pending);
            delete autosaveTimersRef.current[current.id];
            try {
              await saveChainsRef.current[current.id];
              await deleteSticky(workspaceSlug, current.id);
              commitHaptic();
              const remaining = items.filter((item) => item.id !== current.id);
              setItems(remaining);
              if (remaining.length === 0) {
                setEditorOpen(false);
              } else {
                const nextIndex = Math.min(editorIndex, remaining.length - 1);
                setEditorIndex(nextIndex);
                requestAnimationFrame(() => pagerRef.current?.scrollToIndex({ index: nextIndex, animated: false }));
              }
            } catch (caught) {
              if (isAuthError(caught)) {
                await signOut();
                return;
              }
              setError("Couldn't delete that sticky.");
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  };

  const onPageSettled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    Keyboard.dismiss();
    if (current) editorRefs.current[current.id]?.blur();
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (Number.isFinite(next) && next >= 0 && next < items.length) {
      if (next !== editorIndex) selectionHaptic();
      setEditorIndex(next);
      setFormatState(EMPTY_STICKY_FORMAT_STATE);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { width }]}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth > 0 && nextWidth !== boardWidth) setBoardWidth(Math.min(nextWidth, width));
      }}
    >
      <View style={styles.boardHeader}>
        <Text style={styles.boardTitle}>Stickies</Text>
        <PressableScale onPress={openNew} accessibilityRole="button" accessibilityLabel="Create sticky" hitSlop={4}>
          {({ pressed }) => (
            <View style={[styles.addButton, pressed && styles.addButtonPressed]}>
              <Text style={styles.addButtonLabel}>Create sticky</Text>
            </View>
          )}
        </PressableScale>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <ScrollFade topHeight={20} bottomHeight={80}>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[styles.grid, items.length === 0 && styles.emptyGrid]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accentPrimary} />
          }
          renderItem={({ item, index }) => {
            const content = contentOf(item);
            const updated = updatedLabel(item.updated_at);
            return (
              <View style={{ width: cardWidth, height: STICKY_CARD_HEIGHT }}>
                <PressableScale
                  onPress={() => openSticky(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open sticky: ${textOf(item).slice(0, 50) || "Empty note"}`}
                  style={({ pressed }) => [
                    styles.note,
                    {
                      height: STICKY_CARD_HEIGHT,
                      minHeight: STICKY_CARD_HEIGHT,
                      maxHeight: STICKY_CARD_HEIGHT,
                    },
                    pressed && styles.notePressed,
                  ]}
                >
                  <View style={[styles.notePaper, { backgroundColor: fillFor(item.background_color) }]}>
                    <PaperFold color={item.background_color} />
                    <Text style={styles.noteTitle} numberOfLines={2}>
                      {content.title}
                    </Text>
                    {content.body ? (
                      <Text style={styles.noteBody} numberOfLines={3}>
                        {content.body}
                      </Text>
                    ) : null}
                    <View style={styles.noteFooter}>
                      <Text style={styles.noteMeta}>{updated ?? "Note"}</Text>
                      <Text style={styles.noteNumber}>{String(index + 1).padStart(2, "0")}</Text>
                    </View>
                  </View>
                </PressableScale>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No stickies yet</Text>
              <Text style={styles.emptyCopy}>Tap + to pin your first thought.</Text>
            </View>
          }
        />
      </ScrollFade>

      <Modal
        visible={editorOpen}
        presentationStyle="fullScreen"
        animationType={reducedMotion ? "none" : "slide"}
        onShow={onEditorShow}
        onRequestClose={closeEditor}
      >
        <SafeAreaView
          style={[styles.modalSafe, { paddingTop: Math.max(safeAreaInsets.top, spacing.md) }]}
          edges={["bottom", "left", "right"]}
        >
          <KeyboardAvoidingView
            style={styles.modalFlex}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={safeAreaInsets.top}
          >
            <View style={styles.editorHeader}>
              <Pressable
                onPress={closeEditor}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close sticky editor"
                style={({ pressed }) => [
                  styles.headerIconButton,
                  styles.headerBackButton,
                  pressed && styles.headerPressed,
                ]}
              >
                <AppIcon icon={Cancel01Icon} size={23} color={colors.ink} strokeWidth={1.8} />
              </Pressable>
              <View style={styles.editorHeading}>
                <Text style={styles.editorTitle} numberOfLines={1}>
                  {creating ? "New sticky" : current?.name?.trim() || "Sticky"}
                </Text>
                {!creating && items.length > 1 ? (
                  <Text style={styles.editorCount}>
                    {editorIndex + 1} of {items.length} · swipe to switch
                  </Text>
                ) : null}
              </View>
              {current ? (
                <Pressable
                  onPress={remove}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Delete sticky"
                  style={({ pressed }) => [styles.headerIconButton, pressed && styles.headerPressed]}
                >
                  <AppIcon icon={Delete02Icon} size={22} color={colors.danger} strokeWidth={1.8} />
                </Pressable>
              ) : (
                <View style={styles.headerIconButton} />
              )}
            </View>

            {creating ? (
              <View style={styles.editorPage}>
                <View style={styles.editorSticky}>
                  <View style={[styles.editorPaper, { backgroundColor: fillFor(newColor) }]}>
                    <PaperFold color={newColor} large />
                    <StickyRichEditor
                      ref={newEditorRef}
                      initialHtml={newDraft}
                      autoFocus
                      onChangeHtml={setCurrentHtml}
                      onFormatStateChange={setFormatState}
                      accessibilityLabel="New sticky text"
                    />
                  </View>
                </View>
              </View>
            ) : (
              <FlatList
                ref={pagerRef}
                data={items}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                directionalLockEnabled
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}
                initialNumToRender={3}
                windowSize={3}
                removeClippedSubviews={false}
                initialScrollIndex={editorIndex}
                getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
                onMomentumScrollEnd={onPageSettled}
                onScrollBeginDrag={() => {
                  Keyboard.dismiss();
                  if (current) editorRefs.current[current.id]?.blur();
                }}
                renderItem={({ item }) => (
                  <EditorPage
                    sticky={item}
                    width={width}
                    html={drafts[item.id] ?? editorHtmlOf(item)}
                    color={draftColors[item.id] ?? item.background_color ?? DEFAULT_COLOR}
                    editorRef={(editor) => {
                      editorRefs.current[item.id] = editor;
                    }}
                    onChangeHtml={(html) => {
                      setDrafts((previous) => ({ ...previous, [item.id]: html }));
                      queueAutosave(
                        item,
                        html,
                        draftColorsRef.current[item.id] ?? item.background_color ?? DEFAULT_COLOR
                      );
                    }}
                    onFormatStateChange={(state) => {
                      if (item.id === current?.id) setFormatState(state);
                    }}
                  />
                )}
              />
            )}

            <View style={styles.editorControls}>
              <View style={styles.toolbarRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="always"
                  style={styles.toolbarScroll}
                  contentContainerStyle={styles.toolbarContent}
                  accessibilityRole="toolbar"
                  accessibilityLabel="Sticky formatting and color"
                >
                  {FORMAT_ACTIONS.map((action) => {
                    const active = formatState[action.command];
                    return (
                      <PressableScale
                        key={action.command}
                        onPress={() => runFormat(action.command)}
                        accessibilityRole="button"
                        accessibilityLabel={action.label}
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [
                          styles.formatButton,
                          active && styles.formatButtonActive,
                          pressed && styles.formatButtonPressed,
                        ]}
                      >
                        <AppIcon icon={action.icon} size={19} color={colors.brandText} strokeWidth={1.9} />
                      </PressableScale>
                    );
                  })}
                  <View style={styles.toolbarDivider} />
                  {STICKY_COLORS.map((color) => {
                    const selected = color.key === currentColor;
                    return (
                      <PressableScale
                        key={color.key}
                        onPress={() => setCurrentColor(color.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={`${color.key} sticky color`}
                        style={[styles.swatchHitArea, selected && styles.swatchHitAreaSelected]}
                      >
                        <View style={[styles.swatch, { backgroundColor: color.fill }]} />
                      </PressableScale>
                    );
                  })}
                </ScrollView>
                <PressableScale
                  onPress={() => void save()}
                  disabled={saving || (!current && stripHtml(currentHtml).trim().length === 0)}
                  accessibilityRole="button"
                  accessibilityLabel={creating ? "Add sticky" : "Save sticky now"}
                  style={({ pressed }) => [
                    styles.saveButton,
                    pressed && styles.saveButtonPressed,
                    (saving || (!current && stripHtml(currentHtml).trim().length === 0)) && styles.saveButtonDisabled,
                  ]}
                >
                  {saving || (current && saveStates[current.id] === "saving") ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.saveText} numberOfLines={1}>
                      {creating
                        ? "Add"
                        : current && saveStates[current.id] === "saved"
                          ? "Saved"
                          : current && saveStates[current.id] === "error"
                            ? "Retry"
                            : "Save"}
                    </Text>
                  )}
                </PressableScale>
              </View>
              {error ? <Text style={styles.editorError}>{error}</Text> : null}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  boardHeader: {
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  boardTitle: {
    color: colors.ink,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.xxl,
    letterSpacing: -0.45,
  },
  addButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: colors.accentPrimary,
    ...shadow.button,
  },
  addButtonLabel: {
    color: colors.white,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.sm,
  },
  addButtonPressed: { backgroundColor: colors.accentPrimaryHover },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.danger,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.sm,
  },
  grid: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: GRID_GAP },
  emptyGrid: { flexGrow: 1 },
  gridRow: { gap: GRID_GAP },
  note: {
    height: STICKY_CARD_HEIGHT,
    minHeight: STICKY_CARD_HEIGHT,
    maxHeight: STICKY_CARD_HEIGHT,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  notePaper: {
    height: STICKY_CARD_HEIGHT,
    minHeight: STICKY_CARD_HEIGHT,
    maxHeight: STICKY_CARD_HEIGHT,
    alignSelf: "stretch",
    borderRadius: radius.lg,
    overflow: "hidden",
    padding: spacing.lg,
  },
  notePressed: { opacity: 0.86 },
  noteTitle: {
    maxWidth: "86%",
    color: colors.ink,
    fontFamily: "Figtree_500Medium",
    fontSize: font.size.md,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  noteBody: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.xs,
    lineHeight: 17,
  },
  noteFooter: {
    marginTop: "auto",
    paddingTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noteMeta: {
    color: "rgba(29, 31, 32, 0.58)",
    fontFamily: "Figtree_500Medium",
    fontSize: 10,
    letterSpacing: 0.25,
  },
  noteNumber: {
    color: "rgba(29, 31, 32, 0.42)",
    fontFamily: "Figtree_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  paperFold: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 2,
    width: 0,
    height: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderStyle: "solid",
    // A soft shadow cast down-left onto the note, so the peeled corner reads as a
    // lifted flap (its shadow follows the fold's triangular shape).
    shadowColor: colors.ink,
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: -3, height: 3 },
  },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 80 },
  emptyTitle: { color: colors.ink, fontFamily: "Figtree_600SemiBold", fontSize: font.size.md },
  emptyCopy: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.sm,
  },
  modalSafe: { flex: 1, backgroundColor: colors.canvas },
  modalFlex: { flex: 1 },
  editorHeader: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerIconButton: { height: 44, width: 44, alignItems: "center", justifyContent: "center" },
  headerBackButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
  },
  headerPressed: { opacity: 0.52 },
  editorHeading: { flex: 1, alignItems: "center" },
  editorTitle: { color: colors.ink, fontFamily: "Figtree_600SemiBold", fontSize: font.size.base },
  editorCount: {
    marginTop: 1,
    color: colors.textTertiary,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.xs,
  },
  editorPage: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: 20,
  },
  editorSticky: {
    flex: 1,
    minHeight: 220,
    marginVertical: spacing.sm,
    borderRadius: radius.xl,
    zIndex: 2,
    ...shadow.button,
  },
  editorPaper: {
    flex: 1,
    overflow: "hidden",
    borderRadius: radius.xl,
  },
  editorControls: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    ...shadow.card,
  },
  toolbarRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  toolbarScroll: { flex: 1 },
  toolbarContent: {
    alignItems: "center",
    gap: spacing.sm,
  },
  formatButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: "rgba(170, 2, 118, 0.08)",
  },
  formatButtonActive: { backgroundColor: colors.brandSoft, borderColor: colors.accentPrimary },
  formatButtonPressed: { opacity: 0.72 },
  toolbarDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.borderStrong },
  swatchHitArea: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchHitAreaSelected: { borderColor: colors.accentPrimary },
  swatch: {
    height: 28,
    width: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.08)",
  },
  editorError: {
    marginTop: spacing.xs,
    color: colors.danger,
    textAlign: "center",
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.sm,
  },
  saveButton: {
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPrimary,
  },
  saveButtonPressed: { backgroundColor: colors.accentPrimaryHover },
  saveButtonDisabled: { opacity: 0.4 },
  saveText: { color: colors.white, fontFamily: "Figtree_600SemiBold", fontSize: font.size.sm },
});

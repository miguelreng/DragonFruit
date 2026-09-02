/**
 * Confirm step of scan-to-doc: the transcription is in hand, nothing is saved
 * yet. The user checks the title, picks where it lands, and prunes the labels
 * the model read off the page.
 *
 * Label state is computed against the *currently selected* project, not the one
 * the marker resolved to — labels are per-project, so switching the project
 * changes which chips already exist and which will be created.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useAnimatedValue,
  View,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/app-icon";
import { PickerSheet, type PickerOption } from "@/components/picker-sheet";
import { PressableScale } from "@/components/pressable-scale";
import type { Label, Project, ScannedNoteTranscription } from "@/lib/api";
import { selectionHaptic } from "@/lib/haptics";
import { ArrowRight01Icon, Cancel01Icon } from "@/lib/icons";
import { motion } from "@/lib/motion";
import { colors, font, radius, spacing } from "@/lib/theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;

/**
 * Plain-text preview of the transcription. A WebView would render it faithfully
 * but costs a whole browser instance for a sheet you glance at — the real doc is
 * one tap away for fidelity.
 */
function htmlToPreviewText(html: string): string {
  return html
    // A list item is `<li><p>text</p></li>`; collapse the pair so each bullet
    // doesn't come out double-spaced.
    .replace(/<\/p>\s*<\/li>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*data-checked="true"[^>]*>/gi, "☑ ")
    .replace(/<li[^>]*data-checked="false"[^>]*>/gi, "☐ ")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ScanConfirmResult = { projectId: string; title: string; labels: string[] };

export function ScanConfirmSheet({
  visible,
  draft,
  projects,
  labels,
  lastProjectId,
  submitting,
  error,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  draft: ScannedNoteTranscription;
  projects: Project[];
  labels: Label[];
  lastProjectId: string | null;
  submitting: boolean;
  error: string | null;
  onConfirm: (result: ScanConfirmResult) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [rendered, setRendered] = useState(visible);
  const translateY = useAnimatedValue(SCREEN_HEIGHT);
  const backdrop = useAnimatedValue(0);

  // The sheet is remounted per draft, so prop-derived initial state is safe.
  const [title, setTitle] = useState(draft.title);
  const [labelNames, setLabelNames] = useState<string[]>(draft.detected_labels);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedProjectId, setPickedProjectId] = useState<string | null>(null);

  // Detected project wins, then wherever the last scan went, then whatever's
  // first — but never a project that isn't in the list. Derived rather than
  // stored so a late-arriving project list still lands on a sane default;
  // an explicit pick overrides it.
  const defaultProjectId = useMemo(
    () =>
      [draft.detected_project?.id, lastProjectId, projects[0]?.id].find(
        (candidate) => candidate && projects.some((project) => project.id === candidate)
      ) ?? "",
    [draft.detected_project?.id, lastProjectId, projects]
  );
  const projectId = pickedProjectId ?? defaultProjectId;

  const projectOptions: PickerOption[] = useMemo(
    () => projects.map((project) => ({ id: project.id, label: project.name })),
    [projects]
  );
  const selectedProject = projects.find((project) => project.id === projectId) ?? null;

  const existingLabelNames = useMemo(() => {
    const names = new Set<string>();
    for (const label of labels) {
      if (label.project_id === projectId) names.add(label.name.toLowerCase());
    }
    return names;
  }, [labels, projectId]);

  const preview = useMemo(() => htmlToPreviewText(draft.description_html), [draft.description_html]);

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
        Animated.spring(translateY, { toValue: 0, ...motion.sheet.spring, useNativeDriver: true }),
      ]).start();
    } else {
      animateClose(() => setRendered(false));
    }
  }, [animateClose, backdrop, reducedMotion, rendered, translateY, visible]);

  if (!rendered) return null;

  const markerMissed = Boolean(draft.project_marker) && !draft.detected_project;
  const canConfirm = Boolean(projectId) && !submitting;

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable
          style={styles.fill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.grabberWrap}>
          <View style={styles.grabber} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Untitled scan"
            placeholderTextColor={colors.textPlaceholder}
            style={styles.titleInput}
            accessibilityLabel="Doc title"
          />

          <Text style={styles.sectionLabel}>Project</Text>
          <PressableScale
            onPress={() => {
              selectionHaptic();
              setPickerOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Choose a project"
          >
            <View style={styles.selectRow}>
              <Text style={selectedProject ? styles.selectValue : styles.selectPlaceholder}>
                {selectedProject?.name ?? "Pick a project"}
              </Text>
              <AppIcon icon={ArrowRight01Icon} size={16} color={colors.textTertiary} />
            </View>
          </PressableScale>
          {markerMissed ? (
            <Text style={styles.hint}>
              Couldn&apos;t find a project called &ldquo;{draft.project_marker}&rdquo; — pick one.
            </Text>
          ) : null}

          {labelNames.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Labels</Text>
              <View style={styles.chipRow}>
                {labelNames.map((name) => {
                  const isNew = !existingLabelNames.has(name.toLowerCase());
                  return (
                    <PressableScale
                      key={name}
                      onPress={() => {
                        selectionHaptic();
                        setLabelNames((current) => current.filter((entry) => entry !== name));
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove label ${name}`}
                    >
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>{name}</Text>
                        {isNew ? <Text style={styles.chipNew}>new</Text> : null}
                        <AppIcon icon={Cancel01Icon} size={14} color={colors.textTertiary} />
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={styles.sectionLabel}>Transcription</Text>
          <View style={styles.previewBox}>
            <Text style={styles.previewText}>{preview}</Text>
          </View>
          {draft.warnings.length > 0 ? (
            <Text style={styles.hint}>{draft.warnings.join(" ")}</Text>
          ) : null}
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <PressableScale onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
            <View style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </View>
          </PressableScale>
          <PressableScale
            onPress={() => canConfirm && onConfirm({ projectId, title: title.trim(), labels: labelNames })}
            disabled={!canConfirm}
            accessibilityRole="button"
            accessibilityLabel="Create doc"
          >
            <View style={[styles.primaryBtn, !canConfirm && styles.primaryBtnDisabled]}>
              <Text style={styles.primaryBtnText}>{submitting ? "Creating…" : "Create doc"}</Text>
            </View>
          </PressableScale>
        </View>
      </Animated.View>

      <PickerSheet
        visible={pickerOpen}
        title="Project"
        options={projectOptions}
        selectedId={projectId}
        onSelect={(id) => {
          setPickedProjectId(id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
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
    maxHeight: "88%",
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
  grabberWrap: { marginBottom: spacing.xs, alignItems: "center", paddingTop: 2 },
  grabber: { height: 4, width: 40, borderRadius: 999, backgroundColor: "rgba(0, 0, 0, 0.15)" },
  body: { paddingHorizontal: 20, paddingBottom: spacing.md, gap: spacing.xs },
  sectionLabel: {
    marginTop: spacing.md,
    fontSize: font.size.xs,
    color: colors.muted,
    fontFamily: "Figtree_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  titleInput: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    fontSize: font.size.md,
    fontFamily: "Figtree_600SemiBold",
    color: colors.ink,
  },
  selectRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
  },
  selectValue: {
    flex: 1,
    fontSize: font.size.md,
    fontFamily: "Figtree_500Medium",
    color: colors.ink,
  },
  selectPlaceholder: {
    flex: 1,
    fontSize: font.size.md,
    fontFamily: "Figtree_500Medium",
    color: colors.textPlaceholder,
  },
  hint: {
    marginTop: spacing.xs,
    fontSize: font.size.sm,
    color: colors.textTertiary,
    fontFamily: font.family,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  chipText: { fontSize: font.size.sm, fontFamily: "Figtree_500Medium", color: colors.ink },
  chipNew: {
    fontSize: font.size.xs,
    fontFamily: "Figtree_500Medium",
    color: colors.brandText,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  previewBox: {
    maxHeight: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  previewText: { fontSize: font.size.sm, lineHeight: 21, color: colors.body, fontFamily: font.family },
  error: {
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    fontSize: font.size.sm,
    color: colors.danger,
    fontFamily: "Figtree_500Medium",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: 20,
    paddingTop: spacing.md,
  },
  secondaryBtn: {
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: { fontSize: font.size.md, fontFamily: "Figtree_500Medium", color: colors.ink },
  primaryBtn: {
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: font.size.md, fontFamily: "Figtree_600SemiBold", color: colors.white },
});

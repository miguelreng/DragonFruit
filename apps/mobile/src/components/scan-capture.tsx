/**
 * Scan a notebook page into a doc.
 *
 * Photograph one or more consecutive pages, a vision model on the server
 * transcribes them into a single doc body, and the confirm sheet lets the user
 * check where it lands before anything is written. Markers written on the paper
 * — `/project-name` and `#label` — are read out by the model and surfaced as
 * the sheet's defaults.
 *
 * Failure never costs the user their work: the tray survives a failed
 * transcription and the transcription survives a failed create, so a retry is
 * always the cheap operation rather than "shoot it all again".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Linking, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/app-icon";
import { MorphingInfinityLoader } from "@/components/morphing-infinity-loader";
import { PressableScale } from "@/components/pressable-scale";
import { ScanConfirmSheet, type ScanConfirmResult } from "@/components/scan-confirm-sheet";
import {
  ApiError,
  apiErrorMessage,
  createScannedNoteDoc,
  getProjects,
  getWorkspaceLabels,
  isAuthError,
  transcribeScannedNote,
  type Label,
  type Project,
  type ScannedNoteTranscription,
} from "@/lib/api";
import { commitHaptic, selectionHaptic } from "@/lib/haptics";
import { CameraIcon, Cancel01Icon, GalleryIcon } from "@/lib/icons";
import { prepareScanImages, ScanTooLargeError, SCAN_MAX_PAGES, type ScanPage } from "@/lib/scan-image";
import { getLastScanProjectId, setLastScanProjectId } from "@/lib/secure-store";
import { useSession } from "@/lib/session";
import { colors, font, radius, spacing } from "@/lib/theme";

type Phase = "tray" | "transcribing" | "confirm";

/** Idempotency key for the create call — stable across retries, unique across
 *  app launches (Hermes has no reliable crypto.randomUUID). */
function newClientRequestId(): string {
  return `scan-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function ScanCapture({
  workspaceSlug,
  onClose,
  onCreated,
}: {
  workspaceSlug: string;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();

  const [phase, setPhase] = useState<Phase>("tray");
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [draft, setDraft] = useState<ScannedNoteTranscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [retryable, setRetryable] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [lastProjectId, setLastProjectId] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const busyRef = useRef(false);
  // One id per mount, and the parent mounts us once per scan — so a retry
  // updates the doc it already made while a *new* scan never can.
  const requestIdRef = useRef(newClientRequestId());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [projectList, labelList, storedProjectId] = await Promise.all([
          getProjects(workspaceSlug),
          getWorkspaceLabels(workspaceSlug).catch(() => [] as Label[]),
          getLastScanProjectId(workspaceSlug),
        ]);
        if (cancelled) return;
        setProjects(projectList);
        setLabels(labelList);
        setLastProjectId(storedProjectId);
      } catch (err) {
        if (cancelled) return;
        if (isAuthError(err)) {
          await signOut();
          return;
        }
        setProjects([]);
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signOut, workspaceSlug]);

  const addAssets = useCallback((assets: ImagePicker.ImagePickerAsset[]) => {
    setError(null);
    setPages((current) =>
      [
        ...current,
        ...assets.map((asset) => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        })),
      ].slice(0, SCAN_MAX_PAGES)
    );
  }, []);

  const shootPage = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPermissionBlocked(!permission.canAskAgain);
      setError("DragonFruit needs camera access to scan a page.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsEditing: false,
      // The manipulator makes the only base64 we send; see lib/scan-image.ts.
      base64: false,
    });
    if (!result.canceled) addAssets(result.assets);
  }, [addAssets]);

  const choosePhotos = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPermissionBlocked(!permission.canAskAgain);
      setError("DragonFruit needs photo access to pick a page.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: SCAN_MAX_PAGES - pages.length,
      base64: false,
    });
    if (!result.canceled) addAssets(result.assets);
  }, [addAssets, pages.length]);

  const transcribe = useCallback(async () => {
    if (busyRef.current || pages.length === 0) return;
    busyRef.current = true;
    setPhase("transcribing");
    setError(null);
    setRetryable(true);
    try {
      const images = await prepareScanImages(pages);
      const result = await transcribeScannedNote(workspaceSlug, images);
      setDraft(result);
      setPhase("confirm");
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setPhase("tray");
      if (err instanceof ScanTooLargeError) {
        setError(err.message);
      } else if (err instanceof ApiError && err.status === 409) {
        // No model configured — retrying changes nothing until an admin acts.
        setError(`${err.message} Ask a workspace admin to set this up.`);
        setRetryable(false);
      } else if (err instanceof ApiError && err.status === 413) {
        // Django and the proxy reject an oversize body before the view runs, so
        // there's no JSON error to read here.
        setError("Those photos are too large. Remove a page and try again.");
      } else {
        setError(apiErrorMessage(err, "Couldn't read those pages. Try better light or a straighter angle."));
      }
    } finally {
      busyRef.current = false;
    }
  }, [pages, signOut, workspaceSlug]);

  const create = useCallback(
    async ({ projectId, title, labels: labelNames }: ScanConfirmResult) => {
      if (busyRef.current || !draft) return;
      busyRef.current = true;
      setSubmitting(true);
      setError(null);
      try {
        const doc = await createScannedNoteDoc(workspaceSlug, {
          projectId,
          title,
          descriptionHtml: draft.description_html,
          labels: labelNames,
          clientRequestId: requestIdRef.current,
        });
        await setLastScanProjectId(workspaceSlug, projectId);
        commitHaptic();
        onCreated?.();
        onClose();
        // Navigate on the next tick. Pushing in the same one races the modal's
        // teardown, and a push that lands while the modal is still presented
        // renders the doc behind it.
        setTimeout(() => {
          router.push({
            pathname: "/[workspaceSlug]/doc/[pageId]",
            params: {
              workspaceSlug,
              pageId: doc.id,
              // The doc screen's fetch is project-scoped and bails without this.
              projectId: doc.project_id,
              name: doc.name,
              pageType: "doc",
            },
          });
        }, 0);
      } catch (err) {
        if (isAuthError(err)) {
          await signOut();
          return;
        }
        // Stay on the sheet — the transcription is intact and the user can pick
        // a different project rather than re-shoot the pages.
        setError(apiErrorMessage(err, "Couldn't save this doc."));
      } finally {
        busyRef.current = false;
        setSubmitting(false);
      }
    },
    [draft, onClose, onCreated, signOut, workspaceSlug]
  );

  const atCap = pages.length >= SCAN_MAX_PAGES;
  const noProjects = !loadingProjects && projects.length === 0;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.content, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Scan to doc</Text>
            <PressableScale onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <View style={styles.closeBtn}>
                <AppIcon icon={Cancel01Icon} size={20} color={colors.ink} />
              </View>
            </PressableScale>
          </View>

          {phase === "transcribing" ? (
            <View style={styles.center} accessibilityLiveRegion="polite">
              <MorphingInfinityLoader size={64} />
              <Text style={styles.progressText}>
                {pages.length === 1 ? "Reading 1 page…" : `Reading ${pages.length} pages…`}
              </Text>
              <Text style={styles.progressHint}>Handwriting takes a moment. Keep the app open.</Text>
            </View>
          ) : noProjects ? (
            <View style={styles.center}>
              <Text style={styles.progressText}>No projects yet</Text>
              <Text style={styles.progressHint}>
                A scan has to land somewhere — ask an admin to add you to a project.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.lede}>
                Photograph the page. Write <Text style={styles.mono}>/project</Text> or{" "}
                <Text style={styles.mono}>#label</Text> on the paper and it files itself.
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tray}
              >
                {pages.map((page, index) => (
                  <View key={`${page.uri}-${index}`} style={styles.thumbWrap}>
                    <Image source={{ uri: page.uri }} style={styles.thumb} contentFit="cover" />
                    <View style={styles.thumbIndex}>
                      <Text style={styles.thumbIndexText}>{index + 1}</Text>
                    </View>
                    <PressableScale
                      onPress={() => {
                        selectionHaptic();
                        setPages((current) => current.filter((_, i) => i !== index));
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove page ${index + 1}`}
                    >
                      <View style={styles.thumbRemove}>
                        <AppIcon icon={Cancel01Icon} size={14} color={colors.white} />
                      </View>
                    </PressableScale>
                  </View>
                ))}

                {!atCap ? (
                  <PressableScale
                    onPress={() => void shootPage()}
                    accessibilityRole="button"
                    accessibilityLabel="Add a page with the camera"
                  >
                    <View style={styles.addTile}>
                      <AppIcon icon={CameraIcon} size={26} color={colors.brandText} strokeWidth={1.8} />
                      <Text style={styles.addTileText}>Add page</Text>
                    </View>
                  </PressableScale>
                ) : null}
              </ScrollView>

              {atCap ? (
                <Text style={styles.hint}>That&apos;s the {SCAN_MAX_PAGES}-page limit for one doc.</Text>
              ) : null}

              {error ? (
                <View style={styles.errorBox} accessibilityLiveRegion="polite">
                  <Text style={styles.errorText}>{error}</Text>
                  {permissionBlocked ? (
                    <PressableScale
                      onPress={() => void Linking.openSettings()}
                      accessibilityRole="button"
                      accessibilityLabel="Open Settings"
                    >
                      <Text style={styles.errorAction}>Open Settings</Text>
                    </PressableScale>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.actions}>
                {!atCap ? (
                  <PressableScale
                    onPress={() => void choosePhotos()}
                    accessibilityRole="button"
                    accessibilityLabel="Choose photos from the library"
                  >
                    <View style={styles.secondaryBtn}>
                      <AppIcon icon={GalleryIcon} size={18} color={colors.ink} />
                      <Text style={styles.secondaryBtnText}>Choose photos</Text>
                    </View>
                  </PressableScale>
                ) : null}
                <PressableScale
                  onPress={() => void transcribe()}
                  disabled={pages.length === 0 || !retryable}
                  accessibilityRole="button"
                  accessibilityLabel="Transcribe the pages"
                >
                  <View
                    style={[
                      styles.primaryBtn,
                      (pages.length === 0 || !retryable) && styles.primaryBtnDisabled,
                    ]}
                  >
                    <Text style={styles.primaryBtnText}>
                      {error && retryable && pages.length > 0 ? "Try again" : "Transcribe"}
                    </Text>
                  </View>
                </PressableScale>
              </View>
            </>
          )}

        </View>

        {draft ? (
          <ScanConfirmSheet
            key={draft.description_html}
            visible={phase === "confirm"}
            draft={draft}
            projects={projects}
            labels={labels}
            lastProjectId={lastProjectId}
            submitting={submitting}
            error={phase === "confirm" ? error : null}
            onConfirm={(result) => void create(result)}
            onClose={() => {
              // Back to the tray with the photos intact — a second transcribe
              // is the user's call, not something we force on them.
              setPhase("tray");
              setError(null);
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  // The confirm sheet overlays the whole modal, so the page padding lives on an
  // inner view rather than the root it has to escape.
  content: { flex: 1, paddingHorizontal: spacing.lg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
  },
  title: {
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.xxl,
    color: colors.ink,
    letterSpacing: -0.45,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  lede: {
    fontSize: font.size.sm,
    lineHeight: 20,
    color: colors.textSecondary,
    fontFamily: font.family,
    marginBottom: spacing.md,
  },
  mono: { fontFamily: "Figtree_600SemiBold", color: colors.brandText },
  tray: { gap: spacing.md, paddingVertical: spacing.xs, alignItems: "center" },
  thumbWrap: { width: 132, height: 176 },
  thumb: {
    width: 132,
    height: 176,
    borderRadius: radius.md,
    backgroundColor: colors.layer1,
  },
  thumbIndex: {
    position: "absolute",
    left: spacing.sm,
    bottom: spacing.sm,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbIndexText: { fontSize: font.size.xs, fontFamily: "Figtree_600SemiBold", color: colors.white },
  thumbRemove: {
    position: "absolute",
    right: -6,
    top: -6,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  addTile: {
    width: 132,
    height: 176,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  addTileText: { fontSize: font.size.sm, fontFamily: "Figtree_500Medium", color: colors.ink },
  hint: {
    marginTop: spacing.sm,
    fontSize: font.size.sm,
    color: colors.textTertiary,
    fontFamily: font.family,
  },
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    gap: spacing.xs,
  },
  errorText: { fontSize: font.size.sm, color: colors.danger, fontFamily: "Figtree_500Medium" },
  errorAction: {
    fontSize: font.size.sm,
    color: colors.brandText,
    fontFamily: "Figtree_600SemiBold",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: "auto",
    paddingVertical: spacing.lg,
  },
  secondaryBtn: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  progressText: { fontSize: font.size.lg, fontFamily: "Figtree_600SemiBold", color: colors.ink },
  progressHint: {
    fontSize: font.size.sm,
    color: colors.textTertiary,
    fontFamily: font.family,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
});

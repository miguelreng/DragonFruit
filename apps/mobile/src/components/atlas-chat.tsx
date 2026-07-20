import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useAnimatedValue,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useReducedMotion } from "react-native-reanimated";
import Markdown, { type RenderRules } from "react-native-markdown-display";
import {
  ArrowDown01Icon,
  AttachmentIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  ChecklistIcon,
  File01Icon,
  FileTextIcon,
  Folder01Icon,
  GlobeIcon,
  Image02Icon,
  MicrophoneActiveIcon,
  NewTwitterIcon,
  Pdf01Icon,
  Search01Icon,
  SentFilledIcon,
  SparklesIcon,
  StickyNote02Icon,
  StopIcon,
} from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { DragonMark } from "@/components/dragon-mark";
import { MorphingInfinityLoader } from "@/components/morphing-infinity-loader";
import { PickerSheet } from "@/components/picker-sheet";
import { PressableScale } from "@/components/pressable-scale";
import { ScreenHeader } from "@/components/screen-header";
import {
  createAgentSession,
  getAgents,
  getAgentSession,
  getMyIssues,
  getPages,
  getProjects,
  getProjectIssues,
  getStickies,
  isAuthError,
  listAgentSessions,
  sendAgentMessage,
  updateAgentSessionContext,
  type AgentMessage,
  type AgentMessageAttachment,
  type AgentMessageAttachmentPayload,
  type AgentSession,
  type IssueListItem,
  type PageListItem,
  type Project,
  type Sticky,
} from "@/lib/api";
import type { AppIconComponent } from "@/lib/icons";
import { commitHaptic, selectionHaptic } from "@/lib/haptics";
import { stripHtml, timeAgo } from "@/lib/format";
import {
  buildAtlasMentionsContext,
  getAtlasMentionMatch,
  getAtlasMentionToken,
  type AtlasMentionReference,
} from "@/lib/atlas-mentions";
import { motion } from "@/lib/motion";
import { openWeb } from "@/lib/open-web";
import { useSession } from "@/lib/session";
import { resolveSpeechRecognitionLocale } from "@/lib/speech-locale";
import { useApiList } from "@/lib/use-api-list";
import { colors, font, radius, shadow, spacing } from "@/lib/theme";
import { acquireVoiceOwner, isVoiceOwner, releaseVoiceOwner, type VoiceOwnerId } from "@/lib/voice-recognition-owner";

let tempCounter = 0;
const tempId = () => `temp-${++tempCounter}`;

// Scope selector: the sentinel id for "no project filter" and its label.
const WHOLE_WORKSPACE_ID = "__workspace__";
const WHOLE_WORKSPACE_LABEL = "Whole workspace";

// Canvas (#f4f5f5) as solid + fully clear, so the fades blend into the
// background without the black tint a bare "transparent" stop causes.
const FADE_SOLID = colors.canvas;
const FADE_CLEAR = "rgba(244, 245, 245, 0)";

// Composer field height, driven by onContentSizeChange. It rests taller than
// one line for a roomier compose surface, grows with content, then scrolls.
const INPUT_MIN_HEIGHT = 56;
const INPUT_MAX_HEIGHT = 132;
const COMPOSER_TEXT_SIZE = font.size.md;
const COMPOSER_LINE_HEIGHT = 22;
const VOICE_OWNER_ID: VoiceOwnerId = "atlas-chat";
const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 2_500_000;
const SUPPORTED_ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/csv",
  "application/csv",
  "text/plain",
] as const;

type ResolvedContext = {
  projectId?: string;
  projectName?: string;
  pageId?: string;
  pageName?: string;
  updatedAt?: string;
  surface?: string;
};

function resolveSessionContext(session: AgentSession | null | undefined): ResolvedContext | null {
  if (!session || (!session.context_project && !session.context_page)) return null;
  return {
    projectId: session.context_project ?? undefined,
    projectName: session.context_project_name ?? undefined,
    pageId: session.context_page ?? undefined,
    pageName: session.context_page_name ?? undefined,
    updatedAt: session.context_updated_at ?? undefined,
    surface: session.context_updated_by_surface ?? undefined,
  };
}

type HistoryRow = {
  id: string;
  title: string;
  subtitle: string;
  contextLabel: string | null;
  isActive: boolean;
};

const SCREEN_HEIGHT = Dimensions.get("window").height;

type VoiceNoteStatus = "idle" | "recording" | "stopping" | "cancelling" | "ready";

type SendOptions = {
  content?: string;
  inputMode?: "text" | "voice";
  durationSeconds?: number;
};

type PendingAttachment = {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
};

function mimeTypeForFile(name: string, reportedMimeType?: string): string | null {
  const mimeType = (reportedMimeType || "").toLowerCase();
  if ((SUPPORTED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mimeType)) return mimeType;
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "pdf") return "application/pdf";
  if (extension === "csv") return "text/csv";
  if (extension === "txt" || extension === "md") return "text/plain";
  return null;
}

function attachmentKind(mimeType: string): "image" | "pdf" | "text" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/") || mimeType === "application/csv") return "text";
  return "other";
}

function attachmentIcon(kind: string | undefined): AppIconComponent {
  if (kind === "image") return Image02Icon;
  if (kind === "pdf") return Pdf01Icon;
  if (kind === "text") return FileTextIcon;
  return File01Icon;
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes < 1024) return `${bytes ?? 0} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

type AtlasDocLink = {
  title: string;
  url: string;
  projectId: string;
  pageId: string;
};

/** Find the page links returned by Atlas tools so they can become native cards. */
function findAtlasDocLink(content: string): AtlasDocLink | null {
  const markdownLink = content.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (!markdownLink) return null;
  const [, title, url] = markdownLink;
  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {
    // Keep the original URL when an assistant response contains malformed
    // percent-encoding; a bad link should never break message rendering.
  }
  const pageMatch = decodedUrl.match(/\/projects\/([^/?#]+)\/pages\/([^/?#]+)/);
  if (!pageMatch) return null;
  return { title: title.trim(), url, projectId: pageMatch[1], pageId: pageMatch[2] };
}

// Starter shortcuts for the empty state, mirroring the web Atlas sidebar's
// workspace-scoped suggestions. Tapping one prefills the composer.
const EMPTY_STATE_SUGGESTIONS = [
  { icon: Search01Icon, label: "What's happening in my workspace?" },
  { icon: ChecklistIcon, label: "Help me plan my week" },
  { icon: FileTextIcon, label: "Draft a doc for me" },
  { icon: SparklesIcon, label: "Brainstorm ideas" },
];

/**
 * Compact bottom-sheet listing personal Atlas sessions for exact conversation
 * selection — mirrors PickerSheet's chrome (grabber, spring-in, reduced-motion
 * short-circuit) but rows need a title + relative-time + context subtitle.
 */
function ChatHistorySheet({
  visible,
  loading,
  rows,
  onSelect,
  onClose,
}: {
  visible: boolean;
  loading: boolean;
  rows: HistoryRow[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [rendered, setRendered] = useState(visible);
  const translateY = useAnimatedValue(SCREEN_HEIGHT);
  const backdrop = useAnimatedValue(0);

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
        Animated.spring(translateY, {
          toValue: 0,
          ...motion.sheet.spring,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      animateClose(() => setRendered(false));
    }
  }, [animateClose, backdrop, reducedMotion, rendered, translateY, visible]);

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={sheetStyles.fill} accessibilityViewIsModal>
        <Animated.View style={[sheetStyles.backdrop, { opacity: backdrop }]}>
          <Pressable style={sheetStyles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>

        <Animated.View
          style={[sheetStyles.sheet, { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY }] }]}
        >
          <View style={sheetStyles.grabberWrap}>
            <View style={sheetStyles.grabber} />
          </View>
          <Text style={sheetStyles.title}>Chat history</Text>
          {loading ? (
            <View style={sheetStyles.loadingRow}>
              <ActivityIndicator size="small" color={colors.textTertiary} />
            </View>
          ) : rows.length === 0 ? (
            <Text style={sheetStyles.emptyText}>No past conversations yet.</Text>
          ) : (
            <ScrollView bounces={false}>
              {rows.map((row) => (
                <PressableScale
                  key={row.id}
                  onPress={() => onSelect(row.id)}
                  style={({ pressed }) => pressed && sheetStyles.pressedDim}
                >
                  <View style={sheetStyles.row}>
                    <View style={sheetStyles.rowCopy}>
                      <Text style={sheetStyles.rowTitle} numberOfLines={1}>
                        {row.title}
                      </Text>
                      <Text style={sheetStyles.rowSubtitle} numberOfLines={1}>
                        {row.contextLabel ? `${row.contextLabel} · ${row.subtitle}` : row.subtitle}
                      </Text>
                    </View>
                    {row.isActive ? (
                      <AppIcon icon={CheckmarkCircle02Icon} size={18} color={colors.brandText} strokeWidth={1.9} />
                    ) : null}
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "70%",
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
  title: {
    paddingHorizontal: 20,
    paddingVertical: spacing.sm,
    fontSize: font.size.xs,
    color: colors.muted,
    fontFamily: "Figtree_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadingRow: { paddingVertical: spacing.xl, alignItems: "center" },
  emptyText: {
    paddingHorizontal: 20,
    paddingVertical: spacing.lg,
    fontSize: font.size.sm,
    color: colors.textTertiary,
    fontFamily: "Figtree_400Regular",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: 20,
    paddingVertical: spacing.md,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: font.size.md, color: colors.ink, fontFamily: "Figtree_500Medium" },
  rowSubtitle: { fontSize: font.size.xs, color: colors.textTertiary, fontFamily: "Figtree_400Regular" },
  pressedDim: { opacity: 0.6 },
});

/**
 * The Ask Atlas chat surface — session bootstrap, message list, and composer.
 * Full-screen: reached from the tab-bar launcher (pushed over the hub) and the
 * sidebar destination (`atlas.tsx`). `ScreenHeader` shows a back arrow (or the
 * supplied `onClose`) on the left and a "New chat" action on the right.
 */
export function AtlasChat({ onClose }: { onClose?: () => void } = {}) {
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();
  const { signOut, user } = useSession();
  const insets = useSafeAreaInsets();
  const [keyboardUp, setKeyboardUp] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [atlasUnavailable, setAtlasUnavailable] = useState(false);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [switchingSession, setSwitchingSession] = useState(false);
  const [contextPageId, setContextPageId] = useState<string | undefined>(undefined);
  const [contextPageName, setContextPageName] = useState<string | undefined>(undefined);
  const [pendingWebContext, setPendingWebContext] = useState<AgentSession | null>(null);
  // Which project Atlas grounds its answers/tools in — undefined = the whole
  // workspace (mirrors the web Atlas scope selector). Passed on each send.
  const [scopeProjectId, setScopeProjectId] = useState<string | undefined>(undefined);
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
  const [mentionReferences, setMentionReferences] = useState<AtlasMentionReference[]>([]);
  const [mentionedReferences, setMentionedReferences] = useState<AtlasMentionReference[]>([]);
  const { data: projects } = useApiList<Project>(() => getProjects(workspaceSlug), [workspaceSlug]);
  const scopeLabel = scopeProjectId
    ? (projects.find((p) => p.id === scopeProjectId)?.name ?? "Project")
    : WHOLE_WORKSPACE_LABEL;
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceNoteStatus>("idle");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [pickingAttachments, setPickingAttachments] = useState(false);
  const voiceTranscriptRef = useRef("");
  const voiceFinalSegmentsRef = useRef<string[]>([]);
  const voiceShouldPrepareRef = useRef(false);
  const voiceCancelRef = useRef(false);
  const voiceStopFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceSlug) return undefined;

    const loadMentionReferences = async () => {
      const [pages, stickies, issueLists] = await Promise.all([
        getPages(workspaceSlug).catch(() => [] as PageListItem[]),
        getStickies(workspaceSlug).catch(() => [] as Sticky[]),
        projects.length > 0
          ? Promise.all(projects.map((project) => getProjectIssues(workspaceSlug, project.id).catch(() => [])))
          : user?.id
            ? getMyIssues(workspaceSlug, user.id)
                .then((issues) => [issues])
                .catch(() => [[] as IssueListItem[]])
            : Promise.resolve([] as IssueListItem[][]),
      ]);
      if (cancelled) return;

      const references: AtlasMentionReference[] = [
        ...pages
          .filter((page) => page.archived_at === null && page.page_type !== "whiteboard" && !!page.name?.trim())
          .map((page) => ({
            id: page.id,
            insertText: getAtlasMentionToken(page.name || "doc", "doc"),
            title: page.name || "Untitled doc",
            type: "doc" as const,
            subtitle: page.page_type === "folder" ? "Folder" : "Doc",
            projectId: page.project_ids?.[0],
            content: page.description_snippet,
          })),
        ...stickies
          .filter((sticky) => !!sticky.id && !!sticky.name?.trim())
          .map((sticky) => ({
            id: sticky.id,
            insertText: getAtlasMentionToken(sticky.name || "sticky", "sticky"),
            title: sticky.name || "Untitled sticky",
            type: "sticky" as const,
            subtitle: "Sticky",
            content: stripHtml(sticky.description_html ?? ""),
          })),
        ...issueLists.flat().map((issue) => ({
          id: issue.id,
          insertText: getAtlasMentionToken(issue.name || "task", "task"),
          title: issue.name || "Untitled task",
          type: "task" as const,
          subtitle: "Task",
          projectId: issue.project_id,
          content: [
            issue.priority !== "none" ? `Priority: ${issue.priority}` : "",
            issue.target_date ? `Due: ${issue.target_date}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        })),
      ];
      setMentionReferences(
        references.filter(
          (reference, index, list) =>
            list.findIndex((candidate) => candidate.type === reference.type && candidate.id === reference.id) === index
        )
      );
    };

    void loadMentionReferences();
    return () => {
      cancelled = true;
    };
  }, [projects, user?.id, workspaceSlug]);

  const applyLoadedSession = useCallback((session: AgentSession, nextMessages: AgentMessage[]) => {
    const context = resolveSessionContext(session);
    setSessionId(session.id);
    setMessages(nextMessages);
    setMentionedReferences([]);
    if (context && context.surface === "web") {
      setPendingWebContext(session);
      setScopeProjectId(undefined);
      setContextPageId(undefined);
      setContextPageName(undefined);
    } else {
      setPendingWebContext(null);
      setScopeProjectId(context?.projectId);
      setContextPageId(context?.pageId);
      setContextPageName(context?.pageName);
    }
  }, []);

  // Resolve a personal chat session: reuse the most recent, else spin one up
  // against the workspace's first agent (Atlas).
  const init = useCallback(async () => {
    try {
      setError(null);
      setAtlasUnavailable(false);
      const agents = await getAgents(workspaceSlug);
      const atlas = agents.find((agent) => agent.is_enabled !== false);
      const explicitlyUnconfigured =
        atlas?.has_effective_llm_config === false && !(atlas.provider_model && atlas.has_api_key);
      if (!atlas || explicitlyUnconfigured) {
        setAtlasUnavailable(true);
        setSessionId(null);
        setMessages([]);
        return;
      }
      let nextSessions = await listAgentSessions(workspaceSlug);
      let id = nextSessions[0]?.id ?? null;
      if (!id) {
        const created = await createAgentSession(workspaceSlug, atlas.id);
        nextSessions = [created];
        id = created.id;
      }
      setSessions(nextSessions);
      const detail = await getAgentSession(workspaceSlug, id);
      applyLoadedSession(detail.session, detail.messages ?? []);
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't start a chat with Atlas.");
    } finally {
      setLoading(false);
    }
  }, [applyLoadedSession, workspaceSlug, signOut]);

  useEffect(() => {
    void init();
  }, [init]);

  // Drop the home-indicator inset below the composer while the keyboard is up —
  // the keyboard already covers that space, so the inset would only add a gap.
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, () => setKeyboardUp(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (voiceStatus !== "recording") return undefined;
    const timer = setInterval(() => setVoiceSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [voiceStatus]);

  useSpeechRecognitionEvent("start", () => {
    if (!isVoiceOwner(VOICE_OWNER_ID)) return;
    setVoiceStatus("recording");
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (!isVoiceOwner(VOICE_OWNER_ID)) return;
    const next = event.results[0]?.transcript.trim() ?? "";
    if (!next) return;

    if (event.isFinal) {
      const segments = voiceFinalSegmentsRef.current;
      if (segments.at(-1) !== next) segments.push(next);
      voiceTranscriptRef.current = segments.join(" ").trim();
    } else {
      voiceTranscriptRef.current = [...voiceFinalSegmentsRef.current, next].join(" ").trim();
    }
    setVoiceTranscript(voiceTranscriptRef.current);
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (!isVoiceOwner(VOICE_OWNER_ID)) return;
    if (voiceStopFallbackRef.current) clearTimeout(voiceStopFallbackRef.current);
    voiceStopFallbackRef.current = null;
    releaseVoiceOwner(VOICE_OWNER_ID);
    voiceShouldPrepareRef.current = false;

    if (event.error === "aborted" || voiceCancelRef.current) {
      voiceCancelRef.current = false;
      setVoiceStatus("idle");
      return;
    }

    setVoiceStatus("idle");
    setVoiceError(
      event.error === "not-allowed"
        ? "Allow microphone and speech recognition access in Settings to record."
        : event.error === "no-speech" || event.error === "speech-timeout"
          ? "I didn't hear any speech. Try recording again."
          : "Voice recording stopped unexpectedly. Please try again."
    );
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isVoiceOwner(VOICE_OWNER_ID)) return;
    if (voiceStopFallbackRef.current) clearTimeout(voiceStopFallbackRef.current);
    voiceStopFallbackRef.current = null;
    releaseVoiceOwner(VOICE_OWNER_ID);

    if (voiceCancelRef.current) {
      voiceCancelRef.current = false;
      voiceShouldPrepareRef.current = false;
      setVoiceStatus("idle");
      setVoiceTranscript("");
      voiceTranscriptRef.current = "";
      return;
    }

    if (!voiceShouldPrepareRef.current) return;
    voiceShouldPrepareRef.current = false;
    if (voiceTranscriptRef.current.trim()) {
      setVoiceStatus("ready");
      setVoiceError(null);
      setInputHeight(INPUT_MIN_HEIGHT);
    } else {
      setVoiceStatus("idle");
      setVoiceError("I didn't catch anything. Try recording again.");
    }
  });

  useEffect(
    () => () => {
      voiceShouldPrepareRef.current = false;
      voiceCancelRef.current = true;
      if (voiceStopFallbackRef.current) clearTimeout(voiceStopFallbackRef.current);
      voiceStopFallbackRef.current = null;
      if (isVoiceOwner(VOICE_OWNER_ID)) {
        ExpoSpeechRecognitionModule.abort();
        releaseVoiceOwner(VOICE_OWNER_ID);
      }
    },
    []
  );

  const resetVoice = () => {
    if (voiceStopFallbackRef.current) clearTimeout(voiceStopFallbackRef.current);
    voiceStopFallbackRef.current = null;
    voiceShouldPrepareRef.current = false;
    voiceCancelRef.current = false;
    voiceTranscriptRef.current = "";
    voiceFinalSegmentsRef.current = [];
    setVoiceStatus("idle");
    setVoiceTranscript("");
    setVoiceSeconds(0);
    setVoiceError(null);
    setInputHeight(INPUT_MIN_HEIGHT);
  };

  const startVoice = async () => {
    if (voiceStatus !== "idle" || input.trim() || pendingAttachments.length > 0 || sending || resetting || !sessionId)
      return;

    Keyboard.dismiss();
    if (voiceStopFallbackRef.current) clearTimeout(voiceStopFallbackRef.current);
    voiceStopFallbackRef.current = null;
    setVoiceError(null);
    setAttachmentError(null);
    setVoiceTranscript("");
    voiceTranscriptRef.current = "";
    voiceFinalSegmentsRef.current = [];
    setVoiceSeconds(0);

    if (!acquireVoiceOwner(VOICE_OWNER_ID)) {
      setVoiceError("A voice recording is already active elsewhere. Finish or cancel it first.");
      return;
    }

    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        releaseVoiceOwner(VOICE_OWNER_ID);
        setVoiceError("Speech recognition isn't available on this device.");
        return;
      }

      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        releaseVoiceOwner(VOICE_OWNER_ID);
        setVoiceError("Allow microphone and speech recognition access in Settings to record.");
        return;
      }

      voiceCancelRef.current = false;
      voiceShouldPrepareRef.current = true;
      setVoiceStatus("recording");
      // Fire before iOS dictation starts; the Taptic Engine is unavailable while
      // speech recognition is actively using the microphone.
      commitHaptic();
      ExpoSpeechRecognitionModule.start({
        // The raw device locale (e.g. "es-PE") is usually not in iOS's exact
        // supported list and would fail with `language-not-supported`.
        lang: await resolveSpeechRecognitionLocale(),
        interimResults: true,
        continuous: Platform.OS !== "android" || Number(Platform.Version) >= 33,
        addsPunctuation: true,
        iosTaskHint: "dictation",
        contextualStrings: ["DragonFruit", "Atlas", "document", "spreadsheet", "sticky", "meeting notes"],
      });
    } catch {
      voiceShouldPrepareRef.current = false;
      releaseVoiceOwner(VOICE_OWNER_ID);
      setVoiceStatus("idle");
      setVoiceError("Voice recording couldn't start. Please try again.");
    }
  };

  const stopVoice = () => {
    if (voiceStatus !== "recording" || !isVoiceOwner(VOICE_OWNER_ID)) return;
    voiceShouldPrepareRef.current = true;
    setVoiceStatus("stopping");
    ExpoSpeechRecognitionModule.stop();
    // Continuous iOS dictation occasionally delays the native `end` event.
    // Finalize from the latest transcript so the send control never hangs.
    voiceStopFallbackRef.current = setTimeout(() => {
      if (isVoiceOwner(VOICE_OWNER_ID)) {
        ExpoSpeechRecognitionModule.abort();
        releaseVoiceOwner(VOICE_OWNER_ID);
      }
      voiceShouldPrepareRef.current = false;
      if (voiceTranscriptRef.current.trim()) {
        setVoiceStatus("ready");
        setVoiceError(null);
        setInputHeight(INPUT_MIN_HEIGHT);
      } else {
        setVoiceStatus("idle");
        setVoiceError("I didn't catch anything. Try recording again.");
      }
      voiceStopFallbackRef.current = null;
    }, 2500);
  };

  const cancelVoice = () => {
    if (voiceStopFallbackRef.current) clearTimeout(voiceStopFallbackRef.current);
    voiceStopFallbackRef.current = null;
    if (voiceStatus === "ready" || voiceStatus === "idle") {
      resetVoice();
      return;
    }
    if (!isVoiceOwner(VOICE_OWNER_ID)) {
      resetVoice();
      return;
    }
    voiceCancelRef.current = true;
    voiceShouldPrepareRef.current = false;
    setVoiceStatus("cancelling");
    ExpoSpeechRecognitionModule.abort();
  };

  const pickAttachments = async () => {
    if (pickingAttachments || sending || voiceStatus !== "idle") return;
    const remainingSlots = MAX_ATTACHMENTS - pendingAttachments.length;
    if (remainingSlots <= 0) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }

    setPickingAttachments(true);
    setVoiceError(null);
    setAttachmentError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...SUPPORTED_ATTACHMENT_MIME_TYPES],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const accepted: PendingAttachment[] = [];
      const unsupported: string[] = [];
      const oversized: string[] = [];
      const unreadable: string[] = [];
      const existingKeys = new Set(pendingAttachments.map((file) => `${file.name}:${file.size}`));

      for (const [index, asset] of result.assets.entries()) {
        const mimeType = mimeTypeForFile(asset.name, asset.mimeType);
        if (!mimeType) {
          unsupported.push(asset.name);
          continue;
        }

        let size = asset.size;
        if (size === undefined) {
          try {
            const info = await FileSystem.getInfoAsync(asset.uri);
            size = info.exists && !info.isDirectory ? info.size : undefined;
          } catch {
            unreadable.push(asset.name);
            continue;
          }
        }
        if (size === undefined) {
          unreadable.push(asset.name);
          continue;
        }
        if (size > MAX_ATTACHMENT_BYTES) {
          oversized.push(asset.name);
          continue;
        }

        const duplicateKey = `${asset.name}:${size}`;
        if (existingKeys.has(duplicateKey)) continue;
        existingKeys.add(duplicateKey);
        accepted.push({
          id: `attachment-${Date.now()}-${index}`,
          name: asset.name,
          uri: asset.uri,
          mimeType,
          size,
        });
      }

      const filesToAdd = accepted.slice(0, remainingSlots);
      setPendingAttachments((current) => [...current, ...filesToAdd]);

      const errors: string[] = [];
      if (accepted.length > remainingSlots) errors.push(`Only the first ${remainingSlots} file(s) were added.`);
      if (oversized.length > 0) errors.push(`${oversized.join(", ")} exceeded the 2.5 MB limit.`);
      if (unsupported.length > 0)
        errors.push(`${unsupported.join(", ")} isn't a supported image, PDF, CSV, or text file.`);
      if (unreadable.length > 0) errors.push(`${unreadable.join(", ")} couldn't be read.`);
      setAttachmentError(errors.join(" ") || null);
    } catch {
      setAttachmentError("The file picker couldn't open. Please try again.");
    } finally {
      setPickingAttachments(false);
    }
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments((current) => current.filter((file) => file.id !== id));
    setAttachmentError(null);
  };

  const persistMobileContext = async (projectId?: string, pageId?: string) => {
    if (!sessionId) return;
    try {
      const updated = await updateAgentSessionContext(workspaceSlug, sessionId, {
        projectId,
        pageId,
        surface: "mobile",
      });
      setSessions((current) => current.map((session) => (session.id === updated.id ? updated : session)));
    } catch (caught) {
      if (isAuthError(caught)) {
        await signOut();
        return;
      }
      setError("Couldn't sync the Atlas context. Please try again.");
    }
  };

  const selectProjectContext = (projectId?: string) => {
    selectionHaptic();
    setScopeProjectId(projectId);
    setContextPageId(undefined);
    setContextPageName(undefined);
    setPendingWebContext(null);
    setScopePickerOpen(false);
    void persistMobileContext(projectId, undefined);
  };

  const removeDocumentContext = () => {
    selectionHaptic();
    setContextPageId(undefined);
    setContextPageName(undefined);
    void persistMobileContext(scopeProjectId, undefined);
  };

  const applyWebContext = () => {
    const context = resolveSessionContext(pendingWebContext);
    if (!context) return;
    selectionHaptic();
    setScopeProjectId(context.projectId);
    setContextPageId(context.pageId);
    setContextPageName(context.pageName);
    setPendingWebContext(null);
    void persistMobileContext(context.projectId, context.pageId);
  };

  const dismissWebContext = () => {
    selectionHaptic();
    setPendingWebContext(null);
    setScopeProjectId(undefined);
    setContextPageId(undefined);
    setContextPageName(undefined);
    void persistMobileContext(undefined, undefined);
  };

  const switchConversation = async (nextSessionId: string) => {
    selectionHaptic();
    setHistoryOpen(false);
    if (nextSessionId === sessionId || switchingSession) return;
    setSwitchingSession(true);
    setError(null);
    try {
      const detail = await getAgentSession(workspaceSlug, nextSessionId);
      applyLoadedSession(detail.session, detail.messages ?? []);
    } catch (caught) {
      if (isAuthError(caught)) {
        await signOut();
        return;
      }
      setError("Couldn't open that Atlas conversation.");
    } finally {
      setSwitchingSession(false);
    }
  };

  // Start a fresh session, leaving the previous one in history. Clears the
  // thread optimistically and creates a new session against the same agent.
  const newChat = async () => {
    if (resetting || sending) return;
    if (isVoiceOwner(VOICE_OWNER_ID)) ExpoSpeechRecognitionModule.abort();
    releaseVoiceOwner(VOICE_OWNER_ID);
    resetVoice();
    setResetting(true);
    setError(null);
    setMessages([]);
    setInput("");
    setMentionedReferences([]);
    setPendingAttachments([]);
    setAttachmentError(null);
    setInputHeight(INPUT_MIN_HEIGHT);
    try {
      setAtlasUnavailable(false);
      const agents = await getAgents(workspaceSlug);
      const atlas = agents.find((agent) => agent.is_enabled !== false);
      const explicitlyUnconfigured =
        atlas?.has_effective_llm_config === false && !(atlas.provider_model && atlas.has_api_key);
      if (!atlas || explicitlyUnconfigured) {
        setAtlasUnavailable(true);
        setSessionId(null);
        return;
      }
      const created = await createAgentSession(workspaceSlug, atlas.id);
      setSessions((current) => [created, ...current.filter((session) => session.id !== created.id)]);
      applyLoadedSession(created, []);
      setScopeProjectId(undefined);
      setContextPageId(undefined);
      setContextPageName(undefined);
      setPendingWebContext(null);
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't start a new chat.");
    } finally {
      setResetting(false);
    }
  };

  const send = async (options: SendOptions = {}) => {
    const text = (options.content ?? input).trim();
    const isVoice = options.inputMode === "voice";
    const queuedAttachments = isVoice ? [] : pendingAttachments;
    if ((!text && queuedAttachments.length === 0) || sending || resetting || !sessionId || pendingWebContext) return;
    const mentionContext = isVoice
      ? ""
      : buildAtlasMentionsContext(mentionedReferences.filter((reference) => text.includes(reference.insertText)));
    const durationSeconds = Math.max(0, Math.round(options.durationSeconds ?? 0));
    setSending(true);
    setAttachmentError(null);

    let attachmentPayloads: AgentMessageAttachmentPayload[] = [];
    try {
      attachmentPayloads = await Promise.all(
        queuedAttachments.map(async (file) => ({
          name: file.name,
          mime_type: file.mimeType,
          content_base64: await FileSystem.readAsStringAsync(file.uri, {
            encoding: FileSystem.EncodingType.Base64,
          }),
        }))
      );
    } catch {
      setAttachmentError("One or more files couldn't be read. Remove them and try attaching again.");
      setSending(false);
      return;
    }

    if (!isVoice) {
      setInput("");
      setMentionedReferences([]);
      setPendingAttachments([]);
      setInputHeight(INPUT_MIN_HEIGHT);
    }

    const optimisticAttachments: AgentMessageAttachment[] = isVoice
      ? [{ kind: "voice", duration_seconds: durationSeconds }]
      : queuedAttachments.map((file) => ({
          kind: attachmentKind(file.mimeType),
          name: file.name,
          mime_type: file.mimeType,
          size: file.size,
        }));
    const optimistic: AgentMessage = {
      id: tempId(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
      ...(optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {}),
    };
    commitHaptic();
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await sendAgentMessage(workspaceSlug, sessionId, text, scopeProjectId, {
        ...(isVoice ? { inputMode: "voice" as const, voiceDurationSeconds: durationSeconds } : {}),
        ...(attachmentPayloads.length > 0 ? { attachments: attachmentPayloads } : {}),
        ...(mentionContext ? { contextNote: mentionContext } : {}),
      });
      // Match the standalone voice-action flow: an API-level assistant error
      // or empty response must keep the voice transcript retryable instead of
      // resetting it as if the note was sent successfully.
      if (res.assistant_message.error_message || !res.assistant_message.content.trim()) {
        throw new Error(res.assistant_message.error_message || "Atlas returned an empty response");
      }
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), res.user_message, res.assistant_message]);
      if (isVoice) resetVoice();
      void listAgentSessions(workspaceSlug)
        .then(setSessions)
        .catch(() => undefined);
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      if (isVoice) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setVoiceStatus("ready");
        setVoiceError("Voice note couldn't be sent. Your recording is ready to retry.");
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: tempId(),
          role: "assistant",
          content: "I couldn't reach the assistant just now. Please try again.",
          created_at: new Date().toISOString(),
          error_message: "send failed",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const sendVoice = () => {
    void send({ content: voiceTranscriptRef.current, inputMode: "voice", durationSeconds: voiceSeconds });
  };

  const voiceRecording = voiceStatus === "recording";
  const voiceBusy = voiceStatus === "stopping" || voiceStatus === "cancelling";
  const voiceReady = voiceStatus === "ready";
  const hasSendableContent = !!input.trim() || pendingAttachments.length > 0;
  const micDisabled = hasSendableContent || sending || resetting || !sessionId || !!pendingWebContext;
  const mentionMatch = useMemo(() => getAtlasMentionMatch(input), [input]);
  const mentionResults = useMemo(() => {
    if (!mentionMatch) return [];
    const query = mentionMatch.query.toLocaleLowerCase();
    return mentionReferences
      .filter(
        (reference) =>
          !query ||
          reference.title.toLocaleLowerCase().includes(query) ||
          reference.insertText.toLocaleLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [mentionMatch, mentionReferences]);
  const selectMention = useCallback(
    (reference: AtlasMentionReference) => {
      if (!mentionMatch) return;
      selectionHaptic();
      setInput(
        (current) => `${current.slice(0, mentionMatch.from)}${reference.insertText} ${current.slice(mentionMatch.to)}`
      );
      setMentionedReferences((current) =>
        current.some((item) => item.type === reference.type && item.id === reference.id)
          ? current
          : [...current, reference]
      );
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [mentionMatch]
  );
  const historyRows = useMemo<HistoryRow[]>(
    () =>
      sessions.map((session) => ({
        id: session.id,
        title: session.display_title || session.title || "New chat",
        subtitle: session.last_activity_at ? timeAgo(session.last_activity_at) : "Recently",
        contextLabel: session.context_page_name || session.context_project_name || null,
        isActive: session.id === sessionId,
      })),
    [sessionId, sessions]
  );

  const renderAssistantMessage = useCallback(
    (content: string) => {
      const docLink = findAtlasDocLink(content);
      if (!docLink) {
        return (
          <Markdown style={markdownStyles} rules={selectableMarkdownRules}>
            {content}
          </Markdown>
        );
      }

      const readableContent = content.replace(`[${docLink.title}](${docLink.url})`, docLink.title).trim();
      return (
        <>
          {readableContent ? (
            <Markdown style={markdownStyles} rules={selectableMarkdownRules}>
              {readableContent}
            </Markdown>
          ) : null}
          <PressableScale
            onPress={() =>
              router.push({
                pathname: "/[workspaceSlug]/doc/[pageId]",
                params: {
                  workspaceSlug,
                  pageId: docLink.pageId,
                  projectId: docLink.projectId,
                  pageType: "doc",
                  name: docLink.title,
                },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Open document ${docLink.title}`}
            style={({ pressed }) => [styles.atlasDocCard, pressed && styles.atlasDocCardPressed]}
          >
            <View style={styles.atlasDocIcon}>
              <AppIcon icon={File01Icon} size={20} color={colors.textSecondary} strokeWidth={1.8} />
            </View>
            <View style={styles.atlasDocCopy}>
              <Text style={styles.atlasDocTitle} numberOfLines={2}>
                {docLink.title}
              </Text>
              <Text style={styles.atlasDocMeta}>Doc · Open document</Text>
            </View>
          </PressableScale>
        </>
      );
    },
    [workspaceSlug]
  );
  const pendingContext = resolveSessionContext(pendingWebContext);
  const pendingContextLabel = pendingContext?.pageName || pendingContext?.projectName || "workspace context";

  return (
    <View style={styles.safe}>
      <ScreenHeader
        title="Atlas"
        onClose={onClose}
        right={
          messages.length > 0 || sessionId ? (
            <>
              <PressableScale
                onPress={() => {
                  selectionHaptic();
                  setHistoryOpen(true);
                }}
                disabled={sessions.length === 0}
                accessibilityRole="button"
                accessibilityLabel="Open Atlas chat history"
                hitSlop={4}
                style={({ pressed }) => pressed && styles.pressedDim}
              >
                <View style={styles.headerIconBtn}>
                  <AppIcon icon={NewTwitterIcon} size={17} color={colors.textSecondary} strokeWidth={1.9} />
                </View>
              </PressableScale>
              <PressableScale
                onPress={() => void newChat()}
                disabled={resetting}
                accessibilityRole="button"
                accessibilityLabel="New chat"
                hitSlop={4}
              >
                {({ pressed }) => (
                  <View style={[styles.headerBtn, resetting && styles.headerBtnDisabled, pressed && styles.pressedDim]}>
                    <Text style={styles.headerBtnLabel}>New chat</Text>
                  </View>
                )}
              </PressableScale>
            </>
          ) : null
        }
      />

      {loading ? (
        <View style={styles.center}>
          <MorphingInfinityLoader accessibilityLabel="Loading Atlas" />
        </View>
      ) : atlasUnavailable ? (
        <View style={styles.unavailableState}>
          <DragonMark width={36} color={colors.ink} />
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Atlas isn&apos;t configured</Text>
            <Text style={styles.heroSubtitle}>
              Configure Atlas for this workspace in the web app, then come back here to start chatting.
            </Text>
          </View>
          <PressableScale
            onPress={() => openWeb(`/${workspaceSlug}/settings/ai`)}
            accessibilityRole="button"
            accessibilityLabel="Open Atlas settings in the web app"
            style={({ pressed }) => [styles.setupButton, pressed && styles.setupButtonPressed]}
          >
            <View style={styles.setupButtonInner}>
              <AppIcon icon={GlobeIcon} size={17} color={colors.brandText} strokeWidth={1.9} />
              <Text style={styles.setupButtonText}>Open Atlas settings</Text>
            </View>
          </PressableScale>
        </View>
      ) : error && messages.length === 0 ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={insets.top}
        >
          <View style={styles.scrollArea}>
            {messages.length === 0 ? (
              // Empty state: dragon mark, title, and tappable workspace
              // suggestions — mirrors the web Atlas sidebar's empty state.
              <View style={styles.hero}>
                <DragonMark width={40} color={colors.ink} />
                <View style={styles.heroCopy}>
                  <Text style={styles.heroTitle}>How can Atlas help?</Text>
                  <Text style={styles.heroSubtitle}>
                    Ask a question, brainstorm, or paste in something you want rewritten. Tasks and pages are not
                    auto-attached.
                  </Text>
                </View>
                <View style={styles.heroSuggestions}>
                  {EMPTY_STATE_SUGGESTIONS.map((suggestion) => (
                    <PressableScale
                      key={suggestion.label}
                      onPress={() => {
                        setInput(suggestion.label);
                        inputRef.current?.focus();
                      }}
                      style={({ pressed }) => [styles.heroSuggestionPressable, pressed && styles.heroSuggestionPressed]}
                      accessibilityRole="button"
                      accessibilityLabel={suggestion.label}
                    >
                      <View style={styles.heroSuggestionRow}>
                        <AppIcon icon={suggestion.icon} size={16} color={colors.textTertiary} strokeWidth={1.9} />
                        <Text style={styles.heroSuggestionText}>{suggestion.label}</Text>
                      </View>
                    </PressableScale>
                  ))}
                </View>
              </View>
            ) : (
              <>
                <ScrollView
                  ref={scrollRef}
                  contentContainerStyle={styles.scroll}
                  onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
                  keyboardShouldPersistTaps="handled"
                >
                  {messages.map((m) => {
                    const isUser = m.role === "user";
                    const voiceMarker = m.attachments?.find((attachment) => attachment.kind === "voice");
                    const fileAttachments = m.attachments?.filter((attachment) => attachment.kind !== "voice") ?? [];
                    return (
                      <View key={m.id} style={[styles.bubbleRow, isUser ? styles.rowUser : styles.rowAssistant]}>
                        <View
                          style={[
                            isUser ? styles.bubbleUser : styles.bubbleAssistant,
                            m.error_message ? styles.bubbleError : null,
                          ]}
                        >
                          {isUser ? (
                            <>
                              {voiceMarker ? (
                                <View style={styles.voiceBubbleMeta}>
                                  <AppIcon
                                    icon={MicrophoneActiveIcon}
                                    size={14}
                                    color={colors.white}
                                    strokeWidth={1.9}
                                  />
                                  <Text style={styles.voiceBubbleMetaText}>
                                    Voice note · {formatDuration(voiceMarker.duration_seconds ?? 0)}
                                  </Text>
                                </View>
                              ) : null}
                              {fileAttachments.length > 0 ? (
                                <View style={styles.messageAttachments}>
                                  {fileAttachments.map((attachment, index) => (
                                    <View
                                      key={`${attachment.name ?? "attachment"}-${index}`}
                                      style={styles.messageAttachmentCard}
                                      accessibilityLabel={`${attachment.name ?? "Attachment"}, ${formatFileSize(attachment.size)}`}
                                    >
                                      <AppIcon
                                        icon={attachmentIcon(attachment.kind)}
                                        size={16}
                                        color={colors.white}
                                        strokeWidth={1.9}
                                      />
                                      <View style={styles.messageAttachmentCopy}>
                                        <Text style={styles.messageAttachmentName} numberOfLines={1}>
                                          {attachment.name ?? "Attachment"}
                                        </Text>
                                        <Text style={styles.messageAttachmentSize}>
                                          {attachment.dropped
                                            ? "Too large to process"
                                            : formatFileSize(attachment.size)}
                                        </Text>
                                      </View>
                                    </View>
                                  ))}
                                </View>
                              ) : null}
                              {m.content ? (
                                <Text style={[styles.bubbleText, styles.bubbleTextUser]}>{m.content}</Text>
                              ) : null}
                            </>
                          ) : (
                            renderAssistantMessage(
                              m.content ||
                                (m.error_message ? "Atlas couldn't complete that request. Please try again." : "")
                            )
                          )}
                        </View>
                      </View>
                    );
                  })}
                  {sending ? (
                    <View
                      style={[styles.bubbleRow, styles.rowAssistant]}
                      accessibilityLiveRegion="polite"
                      accessibilityLabel="Atlas is thinking"
                    >
                      <View style={styles.thinkingRow}>
                        <MorphingInfinityLoader
                          size={28}
                          color={colors.textTertiary}
                          durationMs={5000}
                          accessibilityLabel=""
                        />
                        <Text style={styles.thinkingText}>Thinking…</Text>
                      </View>
                    </View>
                  ) : null}
                </ScrollView>

                <LinearGradient colors={[FADE_SOLID, FADE_CLEAR]} style={styles.topFade} pointerEvents="none" />
                <LinearGradient colors={[FADE_CLEAR, FADE_SOLID]} style={styles.bottomFade} pointerEvents="none" />
              </>
            )}
          </View>

          {pendingWebContext && pendingContext ? (
            <View style={styles.handoffCard} accessibilityLiveRegion="polite">
              <View style={styles.handoffCopy}>
                <Text style={styles.handoffTitle}>Continue from web?</Text>
                <Text style={styles.handoffText} numberOfLines={2}>
                  Atlas was using {pendingContextLabel}
                  {pendingContext.updatedAt ? ` · ${timeAgo(pendingContext.updatedAt)}` : ""}.
                </Text>
              </View>
              <View style={styles.handoffActions}>
                <PressableScale
                  onPress={dismissWebContext}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss web context and use whole workspace"
                  style={({ pressed }) => [styles.handoffButtonSecondary, pressed && styles.pressedDim]}
                >
                  <Text style={styles.handoffButtonSecondaryText}>Dismiss</Text>
                </PressableScale>
                <PressableScale
                  onPress={applyWebContext}
                  accessibilityRole="button"
                  accessibilityLabel={`Continue with ${pendingContextLabel}`}
                  style={({ pressed }) => [styles.handoffButtonPrimary, pressed && styles.pressedDim]}
                >
                  <Text style={styles.handoffButtonPrimaryText}>Continue</Text>
                </PressableScale>
              </View>
            </View>
          ) : null}

          <View style={[styles.composerSafe, { paddingBottom: keyboardUp ? 0 : insets.bottom }]}>
            {mentionResults.length > 0 && !voiceRecording && !voiceBusy && !voiceReady && !pendingWebContext ? (
              <View style={styles.mentionMenu} accessibilityRole="menu" accessibilityLabel="Atlas references">
                <Text style={styles.mentionMenuTitle}>Mention a workspace item</Text>
                <ScrollView
                  style={styles.mentionMenuScroll}
                  keyboardShouldPersistTaps="always"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {mentionResults.map((reference) => {
                    const icon =
                      reference.type === "task"
                        ? ChecklistIcon
                        : reference.type === "sticky"
                          ? StickyNote02Icon
                          : FileTextIcon;
                    return (
                      <PressableScale
                        key={`${reference.type}:${reference.id}`}
                        onPress={() => selectMention(reference)}
                        accessibilityRole="menuitem"
                        accessibilityLabel={`Mention ${reference.title}`}
                        style={({ pressed }) => [styles.mentionRow, pressed && styles.pressedDim]}
                      >
                        <View style={styles.mentionIcon}>
                          <AppIcon icon={icon} size={16} color={colors.brandText} strokeWidth={1.9} />
                        </View>
                        <View style={styles.mentionCopy}>
                          <Text style={styles.mentionTitle} numberOfLines={1}>
                            {reference.title}
                          </Text>
                          <Text style={styles.mentionSubtitle} numberOfLines={1}>
                            {reference.subtitle}
                            {reference.projectId
                              ? ` · ${projects.find((project) => project.id === reference.projectId)?.name ?? "Project"}`
                              : ""}
                          </Text>
                        </View>
                      </PressableScale>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
            {/* Integrated composer card — message field on top, scope selector
                bottom-left inside the same surface. borderColor firms up on
                focus (set inline). */}
            <View style={[styles.inputPill, { borderColor: focused ? colors.borderStrong : colors.border }]}>
              {!voiceRecording && !voiceBusy && (scopeProjectId || contextPageId) ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="always"
                  contentContainerStyle={styles.contextChips}
                >
                  {scopeProjectId ? (
                    <View style={styles.contextChip}>
                      <AppIcon icon={Folder01Icon} size={14} color={colors.brandText} strokeWidth={1.9} />
                      <Text style={styles.contextChipText} numberOfLines={1}>
                        {scopeLabel}
                      </Text>
                      <PressableScale
                        onPress={() => selectProjectContext(undefined)}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${scopeLabel} context`}
                      >
                        <AppIcon icon={Cancel01Icon} size={14} color={colors.brandText} strokeWidth={1.9} />
                      </PressableScale>
                    </View>
                  ) : null}
                  {contextPageId ? (
                    <View style={styles.contextChip}>
                      <AppIcon icon={FileTextIcon} size={14} color={colors.brandText} strokeWidth={1.9} />
                      <Text style={styles.contextChipText} numberOfLines={1}>
                        {contextPageName || "Document"}
                      </Text>
                      <PressableScale
                        onPress={removeDocumentContext}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${contextPageName || "document"} context`}
                      >
                        <AppIcon icon={Cancel01Icon} size={14} color={colors.brandText} strokeWidth={1.9} />
                      </PressableScale>
                    </View>
                  ) : null}
                </ScrollView>
              ) : null}
              {voiceRecording || voiceBusy ? (
                <View style={styles.voiceRecordingField} accessibilityLiveRegion="polite">
                  <View style={[styles.voiceRecordingDot, voiceBusy && styles.voiceRecordingDotBusy]} />
                  <View style={styles.voiceRecordingCopy}>
                    <Text style={styles.voiceRecordingLabel}>
                      {voiceStatus === "stopping"
                        ? "Finishing voice note…"
                        : voiceStatus === "cancelling"
                          ? "Cancelling…"
                          : "Recording voice note"}
                    </Text>
                    <Text style={styles.voiceRecordingTranscript} numberOfLines={1}>
                      {voiceTranscript || "Start speaking…"}
                    </Text>
                  </View>
                  <Text style={styles.voiceRecordingTime}>{formatDuration(voiceSeconds)}</Text>
                </View>
              ) : (
                <>
                  {voiceReady ? (
                    <View style={styles.voiceReadyMeta}>
                      <AppIcon icon={MicrophoneActiveIcon} size={15} color={colors.accentPrimary} strokeWidth={1.9} />
                      <Text style={styles.voiceReadyMetaText}>Voice note · {formatDuration(voiceSeconds)}</Text>
                    </View>
                  ) : null}
                  {!voiceReady && pendingAttachments.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.pendingAttachments}
                      keyboardShouldPersistTaps="handled"
                    >
                      {pendingAttachments.map((file) => {
                        const kind = attachmentKind(file.mimeType);
                        return (
                          <View key={file.id} style={styles.pendingAttachmentCard}>
                            <View style={styles.pendingAttachmentIcon}>
                              <AppIcon
                                icon={attachmentIcon(kind)}
                                size={16}
                                color={colors.textSecondary}
                                strokeWidth={1.9}
                              />
                            </View>
                            <View style={styles.pendingAttachmentCopy}>
                              <Text style={styles.pendingAttachmentName} numberOfLines={1}>
                                {file.name}
                              </Text>
                              <Text style={styles.pendingAttachmentSize}>{formatFileSize(file.size)}</Text>
                            </View>
                            <PressableScale
                              onPress={() => removeAttachment(file.id)}
                              disabled={sending}
                              hitSlop={6}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${file.name}`}
                            >
                              <View style={styles.removeAttachmentBtn}>
                                <AppIcon icon={Cancel01Icon} size={15} color={colors.textTertiary} strokeWidth={1.9} />
                              </View>
                            </PressableScale>
                          </View>
                        );
                      })}
                    </ScrollView>
                  ) : null}
                  <TextInput
                    ref={inputRef}
                    value={voiceReady ? voiceTranscript : input}
                    onChangeText={(text) => {
                      if (voiceReady) {
                        voiceTranscriptRef.current = text;
                        setVoiceTranscript(text);
                      } else {
                        setInput(text);
                      }
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={voiceReady ? "Review transcript…" : "Message Atlas…"}
                    placeholderTextColor={colors.textPlaceholder}
                    multiline
                    returnKeyType="send"
                    submitBehavior="submit"
                    enablesReturnKeyAutomatically
                    onSubmitEditing={voiceReady ? sendVoice : () => void send()}
                    onContentSizeChange={(e) => {
                      const h = e.nativeEvent.contentSize.height;
                      setInputHeight(Math.min(INPUT_MAX_HEIGHT, Math.max(INPUT_MIN_HEIGHT, h)));
                    }}
                    style={[styles.input, { height: inputHeight }]}
                    editable={!pendingWebContext}
                    accessibilityLabel={voiceReady ? "Voice note transcript" : "Message Atlas"}
                  />
                </>
              )}

              {/* Row layout on an inner View — New-Arch Pressable stacks its
                  children when it carries flexDirection itself. */}
              <View style={styles.composerActions}>
                {voiceRecording || voiceBusy ? (
                  <PressableScale
                    onPress={cancelVoice}
                    disabled={voiceBusy}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel voice note"
                    style={({ pressed }) => [pressed && styles.pressedDim]}
                  >
                    <View style={[styles.attachBtnInner, voiceBusy && styles.actionDisabled]}>
                      <AppIcon icon={Cancel01Icon} size={17} color={colors.textTertiary} strokeWidth={1.9} />
                    </View>
                  </PressableScale>
                ) : voiceReady ? (
                  <PressableScale
                    onPress={cancelVoice}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Discard voice note"
                    style={({ pressed }) => [pressed && styles.pressedDim]}
                  >
                    <View style={styles.attachBtnInner}>
                      <AppIcon icon={Cancel01Icon} size={17} color={colors.textTertiary} strokeWidth={1.9} />
                    </View>
                  </PressableScale>
                ) : (
                  <PressableScale
                    onPress={() => void pickAttachments()}
                    disabled={pickingAttachments || sending}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Add attachment"
                    accessibilityState={{ busy: pickingAttachments, disabled: pickingAttachments || sending }}
                    style={({ pressed }) => [pressed && styles.pressedDim]}
                  >
                    <View style={[styles.attachBtnInner, (pickingAttachments || sending) && styles.actionDisabled]}>
                      {pickingAttachments ? (
                        <ActivityIndicator size="small" color={colors.textTertiary} />
                      ) : (
                        <AppIcon icon={AttachmentIcon} size={16} color={colors.textTertiary} strokeWidth={1.9} />
                      )}
                    </View>
                  </PressableScale>
                )}

                {voiceRecording || voiceBusy ? null : (
                  <PressableScale
                    onPress={() => setScopePickerOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`Context: ${scopeLabel}. Change`}
                    style={({ pressed }) => [styles.scopeBtn, pressed && styles.pressedDim]}
                  >
                    <View style={styles.scopeBtnInner}>
                      <AppIcon icon={Folder01Icon} size={15} color={colors.textTertiary} strokeWidth={1.9} />
                      <Text style={styles.scopeText} numberOfLines={1}>
                        {scopeLabel}
                      </Text>
                      <AppIcon icon={ArrowDown01Icon} size={14} color={colors.textTertiary} strokeWidth={1.9} />
                    </View>
                  </PressableScale>
                )}

                <View style={styles.composerSpacer} />

                {voiceRecording || voiceBusy ? (
                  <PressableScale
                    onPress={stopVoice}
                    disabled={voiceBusy}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Stop recording"
                    style={({ pressed }) => [pressed && styles.pressedDim]}
                  >
                    <View style={[styles.stopBtnInner, voiceBusy && styles.actionDisabled]}>
                      {voiceBusy ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <AppIcon icon={StopIcon} size={16} color={colors.white} strokeWidth={1.9} />
                      )}
                    </View>
                  </PressableScale>
                ) : voiceReady ? (
                  <PressableScale
                    onPress={sendVoice}
                    disabled={!voiceTranscript.trim() || sending}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Send voice note"
                    style={({ pressed }) => [pressed && styles.pressedDim]}
                  >
                    <View style={[styles.sendBtnInner, (!voiceTranscript.trim() || sending) && styles.actionDisabled]}>
                      {sending ? (
                        <ActivityIndicator size="small" color={colors.brandText} />
                      ) : (
                        <AppIcon icon={SentFilledIcon} size={16} color={colors.brandText} />
                      )}
                    </View>
                  </PressableScale>
                ) : hasSendableContent ? (
                  <PressableScale
                    onPress={() => void send()}
                    disabled={sending || resetting || !sessionId || !!pendingWebContext}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                    style={({ pressed }) => [pressed && styles.pressedDim]}
                  >
                    <View
                      style={[
                        styles.sendBtnInner,
                        (sending || resetting || !sessionId || !!pendingWebContext) && styles.actionDisabled,
                      ]}
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color={colors.brandText} />
                      ) : (
                        <AppIcon icon={SentFilledIcon} size={16} color={colors.brandText} />
                      )}
                    </View>
                  </PressableScale>
                ) : (
                  <PressableScale
                    onPress={() => void startVoice()}
                    disabled={micDisabled}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Record voice note"
                    style={({ pressed }) => [pressed && styles.pressedDim]}
                  >
                    <View style={[styles.micBtnInner, micDisabled && styles.actionDisabled]}>
                      <AppIcon icon={MicrophoneActiveIcon} size={17} color={colors.white} strokeWidth={1.9} />
                    </View>
                  </PressableScale>
                )}
              </View>

              {voiceError ? (
                <Text style={styles.voiceErrorText} accessibilityLiveRegion="polite">
                  {voiceError}
                </Text>
              ) : null}
              {attachmentError ? (
                <Text style={styles.voiceErrorText} accessibilityLiveRegion="polite">
                  {attachmentError}
                </Text>
              ) : null}
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <PickerSheet
        visible={scopePickerOpen}
        title="Atlas context"
        options={[
          { id: WHOLE_WORKSPACE_ID, label: WHOLE_WORKSPACE_LABEL },
          ...projects.map((p) => ({ id: p.id, label: p.name })),
        ]}
        selectedId={scopeProjectId ?? WHOLE_WORKSPACE_ID}
        onSelect={(id) => {
          selectProjectContext(id === WHOLE_WORKSPACE_ID ? undefined : id);
        }}
        onClose={() => setScopePickerOpen(false)}
      />
      <ChatHistorySheet
        visible={historyOpen}
        loading={switchingSession}
        rows={historyRows}
        onSelect={(id) => void switchConversation(id)}
        onClose={() => setHistoryOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  headerBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.white,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  headerBtnDisabled: { opacity: 0.55 },
  headerBtnLabel: {
    color: colors.ink,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.sm,
  },
  pressedDim: { opacity: 0.6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: {
    marginTop: 40,
    textAlign: "center",
    fontSize: font.size.sm,
    color: colors.muted,
    fontFamily: "Figtree_400Regular",
  },
  scrollArea: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.xl },
  // Dragon mark + title + suggestions, filling the space above the composer.
  hero: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: spacing.md },
  heroCopy: { alignItems: "center", gap: spacing.xs },
  heroTitle: {
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.md,
    color: colors.ink,
    textAlign: "center",
  },
  heroSubtitle: {
    maxWidth: 280,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.xs,
    lineHeight: 17,
    color: colors.textTertiary,
    textAlign: "center",
  },
  heroSuggestions: { marginTop: spacing.xs, width: "100%", maxWidth: 280 },
  heroSuggestionPressable: { borderRadius: radius.md },
  heroSuggestionPressed: { backgroundColor: colors.layer1 },
  heroSuggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  heroSuggestionText: {
    flex: 1,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  unavailableState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  setupButton: { marginTop: spacing.xs, borderRadius: radius.pill },
  setupButtonPressed: { opacity: 0.72 },
  setupButtonInner: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
  },
  setupButtonText: {
    color: colors.brandText,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.sm,
  },
  bubbleRow: { flexDirection: "row" },
  rowUser: { justifyContent: "flex-end" },
  rowAssistant: { justifyContent: "flex-start" },
  // User messages stay as a right-aligned bubble; assistant replies render
  // full-width like a document — no background, border, or max width.
  bubbleUser: {
    maxWidth: "84%",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accentPrimary,
    borderBottomRightRadius: 6,
  },
  bubbleAssistant: { flex: 1 },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  thinkingText: {
    color: colors.textTertiary,
    fontFamily: "Figtree_500Medium",
    fontSize: font.size.base,
  },
  bubbleError: {
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleText: {
    fontSize: COMPOSER_TEXT_SIZE,
    lineHeight: COMPOSER_LINE_HEIGHT,
    fontFamily: "Figtree_400Regular",
  },
  bubbleTextUser: { color: colors.white },
  bubbleTextAssistant: { color: colors.ink },
  voiceBubbleMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  voiceBubbleMetaText: {
    color: colors.white,
    fontSize: font.size.xs,
    fontFamily: "Figtree_600SemiBold",
    fontVariant: ["tabular-nums"],
    opacity: 0.88,
  },
  messageAttachments: { gap: spacing.xs, marginBottom: spacing.sm },
  messageAttachmentCard: {
    minWidth: 176,
    maxWidth: 240,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
  messageAttachmentCopy: { flex: 1, minWidth: 0 },
  messageAttachmentName: {
    color: colors.white,
    fontSize: font.size.sm,
    fontFamily: "Figtree_600SemiBold",
  },
  messageAttachmentSize: {
    color: colors.white,
    fontSize: font.size.xs,
    fontFamily: "Figtree_400Regular",
    opacity: 0.78,
  },
  atlasDocCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  atlasDocCardPressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
  atlasDocIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.layer1Hover,
  },
  atlasDocCopy: { flex: 1, minWidth: 0, gap: 2 },
  atlasDocTitle: {
    color: colors.ink,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.sm,
  },
  atlasDocMeta: {
    color: colors.textTertiary,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.xs,
  },
  topFade: { position: "absolute", top: 0, left: 0, right: 0, height: 32 },
  bottomFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 48 },
  handoffCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    padding: spacing.md,
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(170, 2, 118, 0.14)",
    backgroundColor: colors.brandSoft,
  },
  handoffCopy: { gap: 2 },
  handoffTitle: { color: colors.ink, fontFamily: "Figtree_600SemiBold", fontSize: font.size.sm },
  handoffText: {
    color: colors.textSecondary,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.xs,
    lineHeight: 16,
  },
  handoffActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
  handoffButtonSecondary: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(170, 2, 118, 0.16)",
    backgroundColor: colors.surface,
  },
  handoffButtonSecondaryText: {
    color: colors.textSecondary,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.xs,
  },
  handoffButtonPrimary: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.accentPrimary,
  },
  handoffButtonPrimaryText: { color: colors.white, fontFamily: "Figtree_600SemiBold", fontSize: font.size.xs },
  composerSafe: { backgroundColor: colors.canvas, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  mentionMenu: {
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...shadow.card,
  },
  mentionMenuTitle: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    color: colors.textTertiary,
    fontSize: font.size.xs,
    fontFamily: "Figtree_600SemiBold",
  },
  mentionMenuScroll: { maxHeight: 230 },
  mentionRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mentionIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
  },
  mentionCopy: { flex: 1, minWidth: 0, gap: 2 },
  mentionTitle: { color: colors.ink, fontSize: font.size.sm, fontFamily: "Figtree_500Medium" },
  mentionSubtitle: { color: colors.textTertiary, fontSize: font.size.xs, fontFamily: "Figtree_400Regular" },
  // Integrated composer card — vertical stack: field on top, scope selector
  // bottom-left inside the same surface. borderColor firms up on focus (set inline).
  inputPill: {
    flexDirection: "column",
    alignItems: "stretch",
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    ...shadow.card,
  },
  input: {
    alignSelf: "stretch",
    // Field height is driven by onContentSizeChange (INPUT_MIN/MAX_HEIGHT).
    paddingTop: 4,
    paddingBottom: 4,
    fontSize: COMPOSER_TEXT_SIZE,
    lineHeight: COMPOSER_LINE_HEIGHT,
    includeFontPadding: false,
    color: colors.ink,
    fontFamily: "Figtree_400Regular",
  },
  contextChips: { alignItems: "center", gap: spacing.xs, paddingTop: spacing.xs, paddingBottom: spacing.xs },
  contextChip: {
    maxWidth: 210,
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingLeft: spacing.sm,
    paddingRight: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
  },
  contextChipText: {
    flexShrink: 1,
    color: colors.brandText,
    fontFamily: "Figtree_500Medium",
    fontSize: font.size.xs,
  },
  pendingAttachments: { gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  pendingAttachmentCard: {
    width: 196,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.layer1,
  },
  pendingAttachmentIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  pendingAttachmentCopy: { flex: 1, minWidth: 0 },
  pendingAttachmentName: {
    color: colors.ink,
    fontSize: font.size.sm,
    fontFamily: "Figtree_500Medium",
  },
  pendingAttachmentSize: {
    color: colors.textTertiary,
    fontSize: font.size.xs,
    fontFamily: "Figtree_400Regular",
  },
  removeAttachmentBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  voiceRecordingField: {
    minHeight: INPUT_MIN_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  voiceRecordingDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  voiceRecordingDotBusy: { opacity: 0.4 },
  voiceRecordingCopy: { flex: 1, gap: 2 },
  voiceRecordingLabel: {
    color: colors.ink,
    fontSize: font.size.sm,
    fontFamily: "Figtree_600SemiBold",
  },
  voiceRecordingTranscript: {
    color: colors.textTertiary,
    fontSize: font.size.sm,
    fontFamily: "Figtree_400Regular",
  },
  voiceRecordingTime: {
    color: colors.textSecondary,
    fontSize: font.size.sm,
    fontFamily: "Figtree_500Medium",
    fontVariant: ["tabular-nums"],
  },
  voiceReadyMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  voiceReadyMetaText: {
    color: colors.accentPrimary,
    fontSize: font.size.xs,
    fontFamily: "Figtree_600SemiBold",
    fontVariant: ["tabular-nums"],
  },
  // Row below the field holding the attach control and the scope selector.
  composerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  composerSpacer: { flex: 1 },
  attachBtnInner: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.layer1Hover,
    borderRadius: radius.pill,
  },
  micBtnInner: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPrimary,
    borderRadius: radius.pill,
  },
  stopBtnInner: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
  },
  sendBtnInner: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
  },
  actionDisabled: { opacity: 0.45 },
  voiceErrorText: {
    color: colors.danger,
    fontSize: font.size.xs,
    lineHeight: 16,
    fontFamily: "Figtree_400Regular",
    marginTop: spacing.sm,
  },
  // Context selector — the web Atlas scope bar: current scope label, one tap to
  // change which project (or the whole workspace) Atlas grounds in. Sits
  // bottom-left inside the composer card, below the field.
  scopeBtn: {
    alignSelf: "flex-start",
  },
  scopeBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    height: 32,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.layer1Hover,
    borderRadius: radius.pill,
  },
  scopeText: {
    flexShrink: 1,
    fontSize: font.size.sm,
    color: colors.textSecondary,
    fontFamily: "Figtree_500Medium",
  },
});

// Markdown rendering for assistant bubbles — mapped to the app's theme.
// Custom fonts don't synthesize bold/italic, so strong/em get explicit faces.
const markdownStyles = StyleSheet.create({
  body: {
    fontSize: COMPOSER_TEXT_SIZE,
    lineHeight: COMPOSER_LINE_HEIGHT,
    color: colors.ink,
    fontFamily: "Figtree_400Regular",
  },
  paragraph: { marginTop: 0, marginBottom: spacing.sm },
  heading1: {
    fontSize: font.size.lg,
    lineHeight: 26,
    color: colors.ink,
    fontFamily: "Figtree_600SemiBold",
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  heading2: {
    fontSize: font.size.md,
    lineHeight: 24,
    color: colors.ink,
    fontFamily: "Figtree_600SemiBold",
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  heading3: {
    fontSize: COMPOSER_TEXT_SIZE,
    lineHeight: COMPOSER_LINE_HEIGHT,
    color: colors.ink,
    fontFamily: "Figtree_600SemiBold",
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  strong: { fontFamily: "Figtree_600SemiBold" },
  em: { fontStyle: "italic" },
  link: { color: colors.brand, textDecorationLine: "underline" },
  bullet_list: { marginBottom: spacing.xs },
  ordered_list: { marginBottom: spacing.xs },
  list_item: { marginBottom: 2 },
  bullet_list_icon: { color: colors.muted },
  ordered_list_icon: { color: colors.muted },
  code_inline: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: COMPOSER_TEXT_SIZE,
    lineHeight: COMPOSER_LINE_HEIGHT,
    backgroundColor: colors.layer1Hover,
    color: colors.ink,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  fence: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: COMPOSER_TEXT_SIZE,
    lineHeight: COMPOSER_LINE_HEIGHT,
    backgroundColor: colors.layer1Hover,
    color: colors.ink,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  code_block: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: COMPOSER_TEXT_SIZE,
    lineHeight: COMPOSER_LINE_HEIGHT,
    backgroundColor: colors.layer1Hover,
    color: colors.ink,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  blockquote: {
    backgroundColor: colors.surfaceMuted,
    borderLeftWidth: 3,
    borderLeftColor: colors.borderStrong,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  hr: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
});

// react-native-markdown-display does not expose Text props at its top level.
// Mark the leaf and text-group nodes selectable so iOS/Android show the native
// copy/select menu while preserving the formatted Markdown layout.
const selectableMarkdownRules: RenderRules = {
  text: (node, _children, _parent, styles, inheritedStyles = {}) => (
    <Text key={node.key} selectable style={[inheritedStyles, styles.text]}>
      {node.content}
    </Text>
  ),
  textgroup: (node, children, _parent, styles) => (
    <Text key={node.key} selectable style={styles.textgroup}>
      {children}
    </Text>
  ),
};

import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import {
  Animated as NativeAnimated,
  Dimensions,
  Linking,
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
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedSegmentedControl } from "@/components/animated-segmented-control";
import { AppIcon } from "@/components/app-icon";
import { MorphingInfinityLoader } from "@/components/morphing-infinity-loader";
import { PressableScale } from "@/components/pressable-scale";
import {
  createAgentSession,
  createMeetingNotesDraft,
  apiErrorMessage,
  getAgents,
  getProjects,
  isAuthError,
  sendAgentMessage,
} from "@/lib/api";
import { ArrowRight01Icon, Cancel01Icon, CheckmarkCircle02Icon, MicrophoneActiveIcon, StopIcon } from "@/lib/icons";
import { motion } from "@/lib/motion";
import { useSession } from "@/lib/session";
import { resolveSpeechRecognitionLocale } from "@/lib/speech-locale";
import { colors, font, radius, shadow, spacing } from "@/lib/theme";
import { acquireVoiceOwner, isVoiceOwner, releaseVoiceOwner, type VoiceOwnerId } from "@/lib/voice-recognition-owner";

// This component owns the mic only while it holds this token — see
// lib/voice-recognition-owner.ts for why that coordination exists (Atlas
// chat's composer mic can be mounted at the same time as this hub tab).
const OWNER_ID: VoiceOwnerId = "hub";
const SCREEN_HEIGHT = Dimensions.get("window").height;

type CaptureMode = "action" | "meeting";
type CaptureStatus = "idle" | "listening" | "processing" | "success" | "error";

const MODE_OPTIONS = [
  { value: "action", label: "Action" },
  { value: "meeting", label: "Meeting notes" },
] as const;

function actionPrompt(transcript: string, projectNames: string[]): string {
  const availableProjects = projectNames.length > 0 ? projectNames.join(", ") : "none returned";
  return [
    "Execute the following DragonFruit request now using the appropriate internal tool.",
    "Treat the transcription as the user's explicit instruction. Do not merely explain how to do it.",
    "This is a workspace-level mobile voice request, so there is no currently-open project context.",
    `Available workspace projects: ${availableProjects}.`,
    "For any document, task, spreadsheet, or other project-scoped write, always pass the exact project name in the tool's `project` argument.",
    "If the user does not name a project, use the project named `Personal` when it is available; never ask the user to open a project first.",
    "When the user says `personal project`, use `project: Personal`.",
    "The transcript may switch between Spanish and English in the same request. Understand both languages, preserve names and quoted text, and never fail just because the language changes.",
    "",
    "Voice request:",
    transcript,
  ].join("\n");
}

function capturedMeetingTitle(): string {
  const timestamp = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Captured meeting · ${timestamp}`;
}

function inAppDocId(url: string): { projectId: string; pageId: string } | null {
  const match = url.match(/\/projects\/([^/]+)\/pages\/([^/?#]+)/);
  return match ? { projectId: match[1], pageId: match[2] } : null;
}

function resultLink(value: string | null): { label: string; url: string } | null {
  if (!value) return null;
  const match = value.match(/\[([^\]]+)\]\(([^)]+)\)/);
  return match ? { label: match[1], url: match[2] } : null;
}

function resultKind(mode: CaptureMode, value: string | null): "meeting" | "doc" | "action" {
  if (mode === "meeting") return "meeting";
  return value?.match(/\/projects\/[^/]+\/pages\/[^/?#]+/) ? "doc" : "action";
}

type VoiceCaptureProps = {
  workspaceSlug: string;
  active: boolean;
  onRecordingChange?: (recording: boolean) => void;
};

// Circle orb (orb-ui "circle" theme, rebuilt in Reanimated): crisp concentric
// rings ripple outward from a pulsing core, all driven by the live mic `volume`
// (0..1) so the orb breathes and swells with the voice.
const ORBIT_SIZE = 320;
const RIPPLE_COUNT = 4;
const RIPPLE_BASE = 150;

function RippleRing({
  index,
  t,
  volume,
  listening,
}: {
  index: number;
  t: SharedValue<number>;
  volume: SharedValue<number>;
  listening: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const phase = (t.value + index / RIPPLE_COUNT) % 1;
    const grow = 1 + phase * (0.7 + volume.value * 1.15);
    const fade = 1 - phase;
    return {
      transform: [{ scale: grow }],
      opacity: fade * (listening ? 0.5 : 0.14) * (0.5 + volume.value * 0.9),
    };
  });
  return <Animated.View style={[styles.orbRing, style]} />;
}

function CircleOrb({
  volume,
  listening,
  reducedMotion,
}: {
  volume: SharedValue<number>;
  listening: boolean;
  reducedMotion: boolean;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      t.value = 0;
      return undefined;
    }
    t.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [reducedMotion, t]);

  // Soft filled core halo that swells with the voice.
  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + volume.value * 0.32 }],
    opacity: (listening ? 0.26 : 0.1) + volume.value * 0.32,
  }));
  // Crisp rim ring hugging the mic that pulses with the level.
  const rimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: (listening ? 1 : 0.98) + volume.value * 0.18 }],
    opacity: listening ? 0.5 + volume.value * 0.4 : 0.22,
  }));

  return (
    <View style={styles.orbit} pointerEvents="none">
      {Array.from({ length: RIPPLE_COUNT }).map((_, index) => (
        <RippleRing key={index} index={index} t={t} volume={volume} listening={listening} />
      ))}
      <Animated.View style={[styles.orbCore, coreStyle]} />
      <Animated.View style={[styles.orbRim, rimStyle]} />
    </View>
  );
}

export function VoiceCapture({ workspaceSlug, active, onRecordingChange }: VoiceCaptureProps) {
  const { signOut } = useSession();
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<CaptureMode>("action");
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionPromiseRef = useRef<Promise<string> | null>(null);
  const transcriptRef = useRef("");
  const finalSegmentsRef = useRef<string[]>([]);
  const projectNamesRef = useRef<string[]>([]);
  const shouldCompleteRef = useRef(false);
  const submittedRef = useRef(false);
  const stoppingRef = useRef(false);
  const stopFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<CaptureMode>(mode);
  const volume = useSharedValue(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    onRecordingChange?.(status === "listening");
  }, [onRecordingChange, status]);

  useEffect(() => {
    if (!active && status === "listening" && isVoiceOwner(OWNER_ID)) {
      shouldCompleteRef.current = true;
      stoppingRef.current = true;
      ExpoSpeechRecognitionModule.stop();
    }
  }, [active, status]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (sessionPromiseRef.current) return sessionPromiseRef.current;

    const promise = (async () => {
      // Quick voice actions need a clean personal session. Reusing the most
      // recent Atlas conversation can accidentally inherit a web document or
      // project scope and execute the request in the wrong place.
      const [agents, projects] = await Promise.all([
        getAgents(workspaceSlug).catch(() => []),
        getProjects(workspaceSlug).catch(() => []),
      ]);
      projectNamesRef.current = projects.map((project) => project.name).filter(Boolean);
      const agent = agents.find((item) => item.is_enabled !== false) ?? agents[0];
      const created = await createAgentSession(workspaceSlug, agent?.id);
      const id = created.id;
      sessionIdRef.current = id;
      return id;
    })();

    sessionPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      sessionPromiseRef.current = null;
    }
  }, [workspaceSlug]);

  const execute = useCallback(
    async (spokenText: string) => {
      const text = spokenText.trim();
      if (!text) {
        setStatus("error");
        setError("I didn't catch anything. Tap the button and try again.");
        return;
      }

      setStatus("processing");
      setError(null);
      try {
        if (modeRef.current === "meeting") {
          const draft = await createMeetingNotesDraft(workspaceSlug, text, capturedMeetingTitle());
          setResult(`Meeting notes saved as [${draft.name}](${draft.url}).`);
        } else {
          const sessionId = await ensureSession();
          const response = await sendAgentMessage(
            workspaceSlug,
            sessionId,
            actionPrompt(text, projectNamesRef.current)
          );
          const reply = response.assistant_message.content.trim();
          if (response.assistant_message.error_message || !reply) {
            throw new Error(response.assistant_message.error_message || "Atlas returned an empty response");
          }
          setResult(reply);
        }
        setStatus("success");
      } catch (caught) {
        if (isAuthError(caught)) {
          await signOut();
          return;
        }
        setStatus("error");
        setError(
          apiErrorMessage(
            caught,
            modeRef.current === "meeting"
              ? "Meeting notes couldn't be saved. Your transcript is still here so you can retry."
              : "Atlas couldn't run that action. Your transcript is still here so you can retry."
          )
        );
      }
    },
    [ensureSession, signOut, workspaceSlug]
  );

  const submitCaptured = useCallback(
    (spokenText: string) => {
      const text = spokenText.trim();
      if (!text || submittedRef.current) return false;
      submittedRef.current = true;
      shouldCompleteRef.current = false;
      void execute(text);
      return true;
    },
    [execute]
  );

  useSpeechRecognitionEvent("start", () => {
    if (!isVoiceOwner(OWNER_ID)) return;
    setStatus("listening");
  });

  useSpeechRecognitionEvent("volumechange", (event) => {
    if (!isVoiceOwner(OWNER_ID)) return;
    const next = Math.max(0, Math.min(1, (event.value + 2) / 12));
    volume.value = reducedMotion ? 0 : withTiming(next, { duration: 80 });
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (!isVoiceOwner(OWNER_ID)) return;
    const next = event.results[0]?.transcript.trim() ?? "";
    if (!next) return;

    if (event.isFinal) {
      const segments = finalSegmentsRef.current;
      if (segments.at(-1) !== next) segments.push(next);
      transcriptRef.current = segments.join(" ").trim();
    } else {
      transcriptRef.current = [...finalSegmentsRef.current, next].join(" ").trim();
    }
    setTranscript(transcriptRef.current);
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (!isVoiceOwner(OWNER_ID)) return;
    if (stopFallbackRef.current) clearTimeout(stopFallbackRef.current);
    stopFallbackRef.current = null;
    const expectedStop = stoppingRef.current;
    const capturedText = transcriptRef.current.trim();
    releaseVoiceOwner(OWNER_ID);
    // Reanimated shared values are intentionally mutable from event callbacks.
    // eslint-disable-next-line react-hooks/immutability
    volume.value = reducedMotion ? 0 : withTiming(0, { duration: 120 });

    // iOS can report an `aborted`/interrupted error immediately before the
    // normal `end` event when the user taps stop or changes tabs. Treat that
    // as a completed capture so actions and meeting notes can be created.
    if (event.error === "aborted" || expectedStop) {
      shouldCompleteRef.current = false;
      stoppingRef.current = false;
      if (capturedText) {
        submitCaptured(capturedText);
        setError(null);
      } else {
        setStatus("error");
        setError("I didn't catch anything. Tap the button and try again.");
      }
      return;
    }
    shouldCompleteRef.current = false;
    stoppingRef.current = false;
    setStatus("error");
    setError(
      event.error === "not-allowed"
        ? "Microphone and speech recognition access are required to record."
        : event.error === "no-speech" || event.error === "speech-timeout"
          ? "I didn't hear any speech. Tap the button and try again."
          : "Speech recognition stopped unexpectedly. Please try again."
    );
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isVoiceOwner(OWNER_ID)) return;
    if (stopFallbackRef.current) clearTimeout(stopFallbackRef.current);
    stopFallbackRef.current = null;
    releaseVoiceOwner(OWNER_ID);
    // Reanimated shared values are intentionally mutable from event callbacks.
    // eslint-disable-next-line react-hooks/immutability
    volume.value = reducedMotion ? 0 : withTiming(0, { duration: 120 });
    if (!shouldCompleteRef.current) return;
    shouldCompleteRef.current = false;
    stoppingRef.current = false;
    if (transcriptRef.current.trim()) {
      submitCaptured(transcriptRef.current);
      setError(null);
    } else {
      setStatus("error");
      setError("I didn't catch anything. Tap the button and try again.");
    }
  });

  useEffect(
    () => () => {
      shouldCompleteRef.current = false;
      stoppingRef.current = false;
      if (stopFallbackRef.current) clearTimeout(stopFallbackRef.current);
      stopFallbackRef.current = null;
      if (isVoiceOwner(OWNER_ID)) {
        ExpoSpeechRecognitionModule.abort();
        releaseVoiceOwner(OWNER_ID);
      }
    },
    []
  );

  const start = async () => {
    if (stopFallbackRef.current) clearTimeout(stopFallbackRef.current);
    stopFallbackRef.current = null;
    setError(null);
    setResult(null);
    setTranscript("");
    submittedRef.current = false;
    transcriptRef.current = "";
    finalSegmentsRef.current = [];

    if (!acquireVoiceOwner(OWNER_ID)) {
      setStatus("error");
      setError("Atlas is already recording a voice note elsewhere. Finish or cancel that one first.");
      return;
    }

    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        releaseVoiceOwner(OWNER_ID);
        setStatus("error");
        setError("Speech recognition isn't available on this device.");
        return;
      }

      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        releaseVoiceOwner(OWNER_ID);
        setStatus("error");
        setError("Allow microphone and speech recognition access in Settings to record.");
        return;
      }

      shouldCompleteRef.current = true;
      stoppingRef.current = false;
      // Give immediate feedback on the original tap. The native `start` event
      // can arrive noticeably later on a cold speech-recognition session.
      setStatus("listening");
      ExpoSpeechRecognitionModule.start({
        // The raw device locale (e.g. "es-PE") is usually not in iOS's exact
        // supported list and would fail with `language-not-supported`.
        lang: await resolveSpeechRecognitionLocale(),
        interimResults: true,
        continuous: Platform.OS !== "android" || Number(Platform.Version) >= 33,
        addsPunctuation: true,
        iosTaskHint: "dictation",
        contextualStrings: [
          "DragonFruit",
          "Atlas",
          "document",
          "documento",
          "spreadsheet",
          "hoja de cálculo",
          "sticky",
          "stickie",
          "meeting notes",
          "notas de reunión",
          "action",
          "acción",
        ],
        // Off by default; the listening orb is driven by `volumechange` events.
        volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
      });
    } catch {
      shouldCompleteRef.current = false;
      stoppingRef.current = false;
      releaseVoiceOwner(OWNER_ID);
      setStatus("error");
      setError("Speech recognition couldn't start. Please try again.");
    }
  };

  const stop = () => {
    if (!isVoiceOwner(OWNER_ID)) return;
    shouldCompleteRef.current = true;
    stoppingRef.current = true;
    ExpoSpeechRecognitionModule.stop();
    // iOS can occasionally omit/delay the native `end` event after stopping a
    // continuous dictation session. Never leave the UI stuck on Listening.
    stopFallbackRef.current = setTimeout(() => {
      if (isVoiceOwner(OWNER_ID)) {
        ExpoSpeechRecognitionModule.abort();
        releaseVoiceOwner(OWNER_ID);
      }
      shouldCompleteRef.current = false;
      stoppingRef.current = false;
      if (transcriptRef.current.trim()) {
        submitCaptured(transcriptRef.current);
        setError(null);
      } else {
        setStatus("error");
        setError("I didn't catch anything. Tap the button and try again.");
      }
      stopFallbackRef.current = null;
    }, 2500);
  };

  const retry = () => {
    void execute(transcriptRef.current);
  };

  const openResultLink = useCallback(
    (url: string) => {
      const doc = inAppDocId(url);
      if (!doc) return true;
      router.push({
        pathname: "/[workspaceSlug]/doc/[pageId]",
        params: {
          workspaceSlug,
          pageId: doc.pageId,
          projectId: doc.projectId,
          pageType: "doc",
        },
      });
      return false;
    },
    [workspaceSlug]
  );

  const updateTranscript = (text: string) => {
    transcriptRef.current = text;
    setTranscript(text);
  };

  const reset = () => {
    setStatus("idle");
    stoppingRef.current = false;
    submittedRef.current = false;
    setTranscript("");
    transcriptRef.current = "";
    finalSegmentsRef.current = [];
    setResult(null);
    setError(null);
  };

  const listening = status === "listening";
  const processing = status === "processing";
  // Keep the capture screen in place while a successful result is presented in
  // a modal drawer. Errors retain the editable transcript view below.
  const showOutput = !!error && !result;
  const showResultDrawer = !!result;
  const expanded = !showOutput;
  const kind = resultKind(mode, result);
  const successTitle =
    kind === "meeting" ? "Meeting notes saved" : kind === "doc" ? "Document created" : "Action completed";
  const successCopy =
    kind === "meeting"
      ? "Your transcript was saved successfully."
      : kind === "doc"
        ? "Your document is ready to open in Atlas."
        : "Atlas completed your request successfully.";
  const errorTitle =
    kind === "meeting"
      ? "Meeting notes couldn’t be saved"
      : kind === "doc"
        ? "Document couldn’t be created"
        : "Action couldn’t be completed";

  return (
    <View style={styles.container}>
      {!showOutput ? (
        <View style={[styles.captureArea, expanded && styles.captureAreaFull]}>
          <View style={[styles.stage, !expanded && styles.stageCompact]}>
            {expanded ? <CircleOrb volume={volume} listening={listening} reducedMotion={reducedMotion} /> : null}
            <Pressable
              onPress={listening ? stop : () => void start()}
              disabled={processing}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={listening ? "Stop recording" : "Start recording"}
              accessibilityState={{ busy: processing }}
              style={({ pressed }) => [
                styles.recordButton,
                listening && styles.recordButtonListening,
                pressed && styles.recordButtonPressed,
                processing && styles.recordButtonDisabled,
              ]}
            >
              {processing ? (
                <MorphingInfinityLoader size={52} color={colors.white} accessibilityLabel="Running action" />
              ) : (
                <AppIcon
                  icon={listening ? StopIcon : MicrophoneActiveIcon}
                  size={36}
                  color={colors.white}
                  strokeWidth={1.8}
                />
              )}
            </Pressable>
          </View>
          <Text style={styles.statusTitle} accessibilityLiveRegion="polite">
            {listening
              ? "Listening…"
              : processing
                ? mode === "meeting"
                  ? "Saving your meeting notes…"
                  : "Running your action…"
                : mode === "meeting"
                  ? "Record meeting notes"
                  : "Tell DragonFruit what to do"}
          </Text>
          <Text style={styles.statusCopy}>
            {listening
              ? "Speak naturally. Tap stop when you're done."
              : mode === "meeting"
                ? "Tap the microphone to capture notes. They’ll be saved when you stop."
                : "Tap the microphone to create, update, or find docs and sheets with your voice."}
          </Text>
          {listening && transcript ? (
            <Text style={styles.liveCaption} numberOfLines={3}>
              {transcript}
            </Text>
          ) : null}
        </View>
      ) : null}

      {status !== "listening" && status !== "processing" && !showOutput ? (
        <View style={styles.bottomControls}>
          <View style={styles.modeSwitch}>
            <AnimatedSegmentedControl
              compact
              pill
              options={MODE_OPTIONS}
              value={mode}
              onChange={setMode}
              accessibilityLabel="Voice recording mode"
            />
          </View>
        </View>
      ) : null}

      {showOutput ? (
        <ScrollView
          style={styles.outputScroll}
          contentContainerStyle={styles.outputContent}
          showsVerticalScrollIndicator={false}
        >
          {transcript && error ? (
            <View style={styles.transcriptCard}>
              <Text style={styles.eyebrow}>{error ? "Transcript" : "You said"}</Text>
              {error ? (
                <TextInput
                  value={transcript}
                  onChangeText={updateTranscript}
                  editable={!processing}
                  multiline
                  textAlignVertical="top"
                  accessibilityLabel="Voice transcript"
                  style={styles.transcriptInput}
                />
              ) : (
                <Text style={styles.transcriptText}>{transcript}</Text>
              )}
            </View>
          ) : null}

          {error ? (
            <View style={styles.resultPanel} accessibilityLiveRegion="polite">
              <View style={[styles.resultStatusIcon, styles.resultStatusIconError]}>
                <AppIcon icon={Cancel01Icon} size={34} color={colors.danger} strokeWidth={1.8} />
              </View>
              <Text style={styles.resultTitle}>{errorTitle}</Text>
              <Text style={styles.resultCopy}>{error}</Text>
              <View style={styles.resultActions}>
                {transcript ? (
                  <PressableScale
                    onPress={retry}
                    accessibilityRole="button"
                    accessibilityLabel="Retry action"
                    style={({ pressed }) => [styles.resultPrimaryAction, pressed && styles.resultActionPressed]}
                  >
                    <Text style={styles.resultPrimaryActionText}>Try again</Text>
                  </PressableScale>
                ) : error.includes("Settings") ? (
                  <PressableScale
                    onPress={() => void Linking.openSettings()}
                    accessibilityRole="button"
                    accessibilityLabel="Open Settings"
                    style={({ pressed }) => [styles.resultPrimaryAction, pressed && styles.resultActionPressed]}
                  >
                    <Text style={styles.resultPrimaryActionText}>Open Settings</Text>
                  </PressableScale>
                ) : null}
                <PressableScale
                  onPress={reset}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss result"
                  style={({ pressed }) => [
                    styles.resultSecondaryAction,
                    pressed && styles.resultSecondaryActionPressed,
                  ]}
                >
                  <Text style={styles.resultSecondaryActionText}>Done</Text>
                </PressableScale>
              </View>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      <VoiceResultDrawer
        visible={showResultDrawer}
        title={successTitle}
        copy={successCopy}
        kind={kind}
        resultText={result}
        link={resultLink(result)}
        onOpenLink={openResultLink}
        onClose={reset}
      />
    </View>
  );
}

type VoiceResultDrawerProps = {
  visible: boolean;
  title: string;
  copy: string;
  kind: "meeting" | "doc" | "action";
  resultText: string | null;
  link: { label: string; url: string } | null;
  onOpenLink: (url: string) => boolean;
  onClose: () => void;
};

/**
 * A compact completion sheet keeps the recording screen underneath it intact.
 * This makes a successful voice action feel like a completed step, while the
 * user can either follow the created item or dismiss and record again.
 */
function VoiceResultDrawer({
  visible,
  title,
  copy,
  kind,
  resultText,
  link,
  onOpenLink,
  onClose,
}: VoiceResultDrawerProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [rendered, setRendered] = useState(visible);
  const [detailsVisible, setDetailsVisible] = useState(false);
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
      NativeAnimated.parallel([
        NativeAnimated.timing(backdrop, {
          toValue: 0,
          duration: motion.duration.control,
          easing: motion.easing.scrimOut,
          useNativeDriver: true,
        }),
        NativeAnimated.timing(translateY, {
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
      NativeAnimated.parallel([
        NativeAnimated.timing(backdrop, {
          toValue: 1,
          duration: motion.duration.panelOpen,
          easing: motion.easing.scrimIn,
          useNativeDriver: true,
        }),
        NativeAnimated.spring(translateY, { toValue: 0, ...motion.sheet.spring, useNativeDriver: true }),
      ]).start();
    } else {
      animateClose(() => setRendered(false));
    }
  }, [animateClose, backdrop, reducedMotion, rendered, translateY, visible]);

  useEffect(() => {
    if (!visible) setDetailsVisible(false);
  }, [visible]);

  if (!rendered) return null;

  const linkLabel = kind === "meeting" ? "Open meeting notes" : kind === "doc" ? "Open document" : "View action output";

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => animateClose(onClose)} statusBarTranslucent>
      <View style={drawerStyles.fill} accessibilityViewIsModal>
        <NativeAnimated.View style={[drawerStyles.backdrop, { opacity: backdrop }]}>
          <Pressable
            style={drawerStyles.fill}
            onPress={() => animateClose(onClose)}
            accessibilityRole="button"
            accessibilityLabel="Close result"
          />
        </NativeAnimated.View>

        <NativeAnimated.View
          style={[drawerStyles.sheet, { paddingBottom: insets.bottom + spacing.lg, transform: [{ translateY }] }]}
        >
          <View style={drawerStyles.grabberWrap}>
            <View style={drawerStyles.grabber} />
          </View>
          <View style={drawerStyles.successIcon}>
            <AppIcon icon={CheckmarkCircle02Icon} size={34} color={colors.success} strokeWidth={1.8} />
          </View>
          <Text style={drawerStyles.title}>{title}</Text>
          <Text style={drawerStyles.copy}>{copy}</Text>

          {detailsVisible && resultText ? (
            <ScrollView
              style={drawerStyles.outputScroll}
              contentContainerStyle={drawerStyles.outputContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={drawerStyles.outputText}>{resultText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")}</Text>
            </ScrollView>
          ) : null}

          {link || (kind === "action" && resultText) ? (
            <PressableScale
              onPress={() => {
                if (link) {
                  animateClose(() => {
                    onClose();
                    onOpenLink(link.url);
                  });
                } else {
                  setDetailsVisible(true);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={link ? `${linkLabel}: ${link.label}` : linkLabel}
              style={drawerStyles.buttonPressable}
            >
              <View style={drawerStyles.openButton}>
                <Text style={drawerStyles.openButtonText}>{linkLabel}</Text>
                {link ? (
                  <Text style={drawerStyles.linkName} numberOfLines={1}>
                    {link.label}
                  </Text>
                ) : null}
                <AppIcon icon={ArrowRight01Icon} size={18} color={colors.brandText} strokeWidth={2} />
              </View>
            </PressableScale>
          ) : null}

          <PressableScale
            onPress={() => animateClose(onClose)}
            accessibilityRole="button"
            accessibilityLabel="Close result"
            style={drawerStyles.buttonPressable}
          >
            <View style={drawerStyles.closeButton}>
              <Text style={drawerStyles.closeButtonText}>Close</Text>
            </View>
          </PressableScale>
        </NativeAnimated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg },
  captureArea: { alignItems: "center", marginTop: spacing.md, paddingTop: spacing.sm },
  bottomControls: { alignItems: "center", paddingTop: spacing.sm, paddingBottom: spacing.lg },
  modeSwitch: { width: 236 },
  // Fill the whole page and center the orbit while there is no output yet.
  captureAreaFull: { flex: 1, justifyContent: "center", paddingBottom: 24 },
  stage: {
    width: ORBIT_SIZE,
    height: ORBIT_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.md,
  },
  stageCompact: { width: 124, height: 124, marginVertical: spacing.sm },
  orbit: {
    position: "absolute",
    width: ORBIT_SIZE,
    height: ORBIT_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  orbRing: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: RIPPLE_BASE,
    height: RIPPLE_BASE,
    borderRadius: RIPPLE_BASE / 2,
    marginTop: -RIPPLE_BASE / 2,
    marginLeft: -RIPPLE_BASE / 2,
    borderWidth: 2,
    borderColor: colors.accentPrimary,
  },
  orbCore: {
    position: "absolute",
    width: 152,
    height: 152,
    borderRadius: 76,
    backgroundColor: colors.accentPrimary,
  },
  orbRim: {
    position: "absolute",
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 3,
    borderColor: colors.accentPrimary,
  },
  liveCaption: {
    maxWidth: 320,
    marginTop: spacing.lg,
    textAlign: "center",
    color: colors.textSecondary,
    fontFamily: "Figtree_500Medium",
    fontSize: font.size.base,
    lineHeight: 22,
  },
  recordButton: {
    height: 112,
    width: 112,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPrimary,
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 8,
  },
  recordButtonListening: { backgroundColor: colors.accentPrimaryActive },
  recordButtonPressed: { backgroundColor: colors.accentPrimaryHover, transform: [{ scale: 0.95 }] },
  recordButtonDisabled: { opacity: 0.72 },
  statusTitle: {
    marginTop: spacing.sm,
    color: colors.ink,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.xl,
  },
  statusCopy: {
    maxWidth: 290,
    marginTop: spacing.sm,
    textAlign: "center",
    color: colors.muted,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.sm,
    lineHeight: 20,
  },
  outputScroll: { flex: 1, marginTop: spacing.xl },
  outputContent: { gap: spacing.md, paddingBottom: spacing.xxl },
  transcriptCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  resultPanel: {
    alignItems: "center",
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    ...shadow.card,
  },
  resultStatusIcon: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    marginBottom: spacing.md,
  },
  resultStatusIconSuccess: { backgroundColor: "#d8f7a4" },
  resultStatusIconError: { backgroundColor: colors.dangerSoft },
  resultTitle: {
    color: colors.ink,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.xl,
    textAlign: "center",
  },
  resultCopy: {
    maxWidth: 280,
    marginTop: spacing.xs,
    color: colors.textTertiary,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  resultDetailsCard: {
    alignSelf: "stretch",
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.layer1,
  },
  resultActions: {
    alignSelf: "stretch",
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  resultPrimaryAction: {
    minHeight: 42,
    minWidth: 128,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  resultPrimaryActionText: {
    color: colors.white,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.sm,
  },
  resultSecondaryAction: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  resultSecondaryActionPressed: { backgroundColor: colors.layer1Hover },
  resultSecondaryActionText: {
    color: colors.textSecondary,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.sm,
  },
  resultActionPressed: { opacity: 0.78 },
  eyebrow: {
    marginBottom: spacing.sm,
    color: colors.textTertiary,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.xs,
    letterSpacing: 0.2,
  },
  transcriptText: {
    color: colors.ink,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.base,
    lineHeight: 23,
  },
  transcriptInput: {
    minHeight: 96,
    color: colors.ink,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.base,
    lineHeight: 23,
    padding: 0,
  },
});

const drawerStyles = StyleSheet.create({
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
    alignItems: "center",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    shadowColor: colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  grabberWrap: { alignItems: "center", paddingBottom: spacing.xl },
  grabber: { width: 40, height: 5, borderRadius: radius.pill, backgroundColor: "rgba(0, 0, 0, 0.16)" },
  successIcon: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: "#d8f7a4",
    marginBottom: spacing.md,
  },
  title: { color: colors.ink, fontFamily: "Figtree_600SemiBold", fontSize: font.size.xxl, textAlign: "center" },
  copy: {
    maxWidth: 300,
    marginTop: spacing.xs,
    color: colors.textTertiary,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  openButton: {
    alignSelf: "stretch",
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.layer1Hover,
  },
  buttonPressable: { alignSelf: "stretch" },
  openButtonText: { color: colors.brandText, fontFamily: "Figtree_600SemiBold", fontSize: font.size.sm },
  linkName: { flex: 1, color: colors.textSecondary, fontFamily: "Figtree_400Regular", fontSize: font.size.sm },
  closeButton: {
    alignSelf: "stretch",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.layer1Hover,
  },
  closeButtonText: { color: colors.brandText, fontFamily: "Figtree_600SemiBold", fontSize: font.size.sm },
  outputScroll: { alignSelf: "stretch", maxHeight: 180, marginTop: spacing.lg },
  outputContent: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.layer1 },
  outputText: { color: colors.textSecondary, fontFamily: "Figtree_400Regular", fontSize: font.size.sm, lineHeight: 21 },
});

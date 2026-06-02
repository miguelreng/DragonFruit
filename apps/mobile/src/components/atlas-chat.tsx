import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Markdown from "react-native-markdown-display";
import { SentIcon, SparklesIcon } from "@hugeicons/core-free-icons";

import { AppIcon } from "@/components/app-icon";
import { ScreenHeader } from "@/components/screen-header";
import {
  createAgentSession,
  getAgents,
  getAgentSession,
  isAuthError,
  listAgentSessions,
  sendAgentMessage,
  type AgentMessage,
} from "@/lib/api";
import { useSession } from "@/lib/session";
import { colors, font, radius, spacing } from "@/lib/theme";

let tempCounter = 0;
const tempId = () => `temp-${++tempCounter}`;

// Canvas (#f4f5f5) as solid + fully clear, so the fades blend into the
// background without the black tint a bare "transparent" stop causes.
const FADE_SOLID = colors.canvas;
const FADE_CLEAR = "rgba(244, 245, 245, 0)";

// Resting height matches the send button (16 + 20 line-height + 16). The field
// grows with content up to the max, then scrolls.
const INPUT_MIN_HEIGHT = 52;
const INPUT_MAX_HEIGHT = 120;

/**
 * The Ask Atlas chat surface — session bootstrap, message list, and composer.
 * Rendered by the sidebar destination (`atlas.tsx`) and by the home right-edge
 * peek (`AtlasPeek`). `ScreenHeader` adapts its leading button: a menu button
 * at the top level, or a back arrow when an `onClose` is supplied (the peek
 * passes one to slide itself away), so the same body serves both entry points.
 */
export function AtlasChat({ onClose }: { onClose?: () => void } = {}) {
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();
  const { signOut } = useSession();
  const insets = useSafeAreaInsets();
  const [keyboardUp, setKeyboardUp] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Resolve a personal chat session: reuse the most recent, else spin one up
  // against the workspace's first agent (Atlas).
  const init = useCallback(async () => {
    try {
      setError(null);
      const sessions = await listAgentSessions(workspaceSlug);
      let id = sessions[0]?.id ?? null;
      if (!id) {
        const agents = await getAgents(workspaceSlug).catch(() => []);
        const created = await createAgentSession(workspaceSlug, agents[0]?.id);
        id = created.id;
      }
      setSessionId(id);
      const detail = await getAgentSession(workspaceSlug, id);
      setMessages(detail.messages ?? []);
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't start a chat with Atlas.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, signOut]);

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

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !sessionId) return;
    setInput("");
    setInputHeight(INPUT_MIN_HEIGHT);
    setSending(true);
    const optimistic: AgentMessage = {
      id: tempId(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await sendAgentMessage(workspaceSlug, sessionId, text);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        res.user_message,
        res.assistant_message,
      ]);
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
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

  return (
    <View style={styles.safe}>
      <ScreenHeader title="Ask Atlas" onClose={onClose} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error && messages.length === 0 ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={styles.scrollArea}>
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.scroll}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              keyboardShouldPersistTaps="handled"
            >
              {messages.length === 0 ? (
                <View style={styles.intro}>
                  <View style={styles.introIcon}>
                    <AppIcon icon={SparklesIcon} size={26} color={colors.brand} strokeWidth={1.9} />
                  </View>
                  <Text style={styles.introTitle}>Ask Atlas anything</Text>
                  <Text style={styles.introSub}>
                    Summarize an issue, draft an update, or ask about your projects.
                  </Text>
                </View>
              ) : (
                messages.map((m) => {
                  const isUser = m.role === "user";
                  return (
                    <View key={m.id} style={[styles.bubbleRow, isUser ? styles.rowUser : styles.rowAssistant]}>
                      <View
                        style={[
                          isUser ? styles.bubbleUser : styles.bubbleAssistant,
                          m.error_message ? styles.bubbleError : null,
                        ]}
                      >
                        {isUser ? (
                          <Text style={[styles.bubbleText, styles.bubbleTextUser]}>{m.content}</Text>
                        ) : (
                          <Markdown style={markdownStyles}>{m.content}</Markdown>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
              {sending ? (
                <View style={[styles.bubbleRow, styles.rowAssistant]}>
                  <View style={styles.bubbleAssistant}>
                    <ActivityIndicator size="small" color={colors.muted} />
                  </View>
                </View>
              ) : null}
            </ScrollView>

            <LinearGradient colors={[FADE_SOLID, FADE_CLEAR]} style={styles.topFade} pointerEvents="none" />
            <LinearGradient colors={[FADE_CLEAR, FADE_SOLID]} style={styles.bottomFade} pointerEvents="none" />
          </View>

          <View style={[styles.composerSafe, { paddingBottom: keyboardUp ? 0 : insets.bottom }]}>
            <View style={styles.composerRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Message Atlas…"
                placeholderTextColor={colors.textPlaceholder}
                multiline
                onContentSizeChange={(e) => {
                  const h = e.nativeEvent.contentSize.height;
                  setInputHeight(Math.min(INPUT_MAX_HEIGHT, Math.max(INPUT_MIN_HEIGHT, h)));
                }}
                style={[styles.input, { height: inputHeight }]}
                accessibilityLabel="Message Atlas"
              />
              <Pressable
                onPress={() => void send()}
                disabled={sending || input.trim().length === 0}
                accessibilityRole="button"
                accessibilityLabel="Send message"
                style={({ pressed }) => [
                  styles.sendBtn,
                  pressed && styles.sendBtnPressed,
                  (sending || input.trim().length === 0) && styles.sendBtnDisabled,
                ]}
              >
                <AppIcon icon={SentIcon} size={18} color={colors.white} strokeWidth={1.9} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { marginTop: 40, textAlign: "center", fontSize: font.size.sm, color: colors.muted, fontFamily: "Figtree_400Regular" },
  scrollArea: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.xl },
  intro: { alignItems: "center", paddingTop: 56, paddingHorizontal: 24 },
  introIcon: {
    height: 60,
    width: 60,
    borderRadius: 18,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  introTitle: { fontSize: font.size.lg, color: colors.ink, fontFamily: "Figtree_600SemiBold" },
  introSub: { marginTop: spacing.xs, textAlign: "center", fontSize: font.size.sm, lineHeight: 20, color: colors.muted, fontFamily: "Figtree_400Regular" },
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
  bubbleError: {
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleText: { fontSize: font.size.sm, lineHeight: 21, fontFamily: "Figtree_400Regular" },
  bubbleTextUser: { color: colors.white },
  bubbleTextAssistant: { color: colors.ink },
  topFade: { position: "absolute", top: 0, left: 0, right: 0, height: 32 },
  bottomFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 48 },
  composerSafe: { backgroundColor: colors.canvas },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  input: {
    flex: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg,
    // Symmetric vertical padding + matched lineHeight keeps the text vertically
    // centered; the field's height is driven by onContentSizeChange so it hugs
    // a single line at rest and grows with content (see INPUT_MIN/MAX_HEIGHT).
    paddingTop: 16,
    paddingBottom: 16,
    fontSize: font.size.sm,
    lineHeight: 20,
    textAlignVertical: "center",
    includeFontPadding: false,
    color: colors.ink,
    fontFamily: "Figtree_400Regular",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sendBtn: {
    height: 52,
    width: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accentPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentPrimaryHover,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  sendBtnPressed: { backgroundColor: colors.accentPrimaryHover },
  sendBtnDisabled: { opacity: 0.4 },
});

// Markdown rendering for assistant bubbles — mapped to the app's theme.
// Custom fonts don't synthesize bold/italic, so strong/em get explicit faces.
const markdownStyles = StyleSheet.create({
  body: { fontSize: font.size.sm, lineHeight: 21, color: colors.ink, fontFamily: "Figtree_400Regular" },
  paragraph: { marginTop: 0, marginBottom: spacing.sm },
  heading1: { fontSize: font.size.lg, lineHeight: 26, color: colors.ink, fontFamily: "Figtree_600SemiBold", marginTop: spacing.xs, marginBottom: spacing.xs },
  heading2: { fontSize: font.size.md, lineHeight: 24, color: colors.ink, fontFamily: "Figtree_600SemiBold", marginTop: spacing.xs, marginBottom: spacing.xs },
  heading3: { fontSize: font.size.sm, lineHeight: 22, color: colors.ink, fontFamily: "Figtree_600SemiBold", marginTop: spacing.xs, marginBottom: spacing.xs },
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
    fontSize: 13,
    backgroundColor: colors.layer1Hover,
    color: colors.ink,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  fence: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    backgroundColor: colors.layer1Hover,
    color: colors.ink,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  code_block: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
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

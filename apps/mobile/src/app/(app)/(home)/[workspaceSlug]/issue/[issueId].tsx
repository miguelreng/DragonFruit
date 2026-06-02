import { useCallback, useEffect, useState } from "react";
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
import { ArrowRight01Icon, Calendar03Icon, SentIcon } from "@hugeicons/core-free-icons";

import { AppIcon } from "@/components/app-icon";
import { Avatar } from "@/components/avatar";
import { PickerSheet } from "@/components/picker-sheet";
import { ScreenHeader } from "@/components/screen-header";
import { ScrollFade } from "@/components/scroll-fade";
import {
  addComment,
  getComments,
  getIssue,
  getStates,
  isAuthError,
  updateIssue,
  type IssueComment,
  type IssueDetail,
  type WorkflowState,
} from "@/lib/api";
import { escapeHtml, formatDueDate, PRIORITY_COLOR, PRIORITY_LABEL, stripHtml, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, font, radius, spacing } from "@/lib/theme";

// Resting height matches the send button (16 + 20 line-height + 16). The field
// grows with content up to the max, then scrolls. Mirrors Ask Atlas.
const INPUT_MIN_HEIGHT = 52;
const INPUT_MAX_HEIGHT = 120;

export default function IssueDetailScreen() {
  const { workspaceSlug, issueId, projectId, name } = useLocalSearchParams<{
    workspaceSlug: string;
    issueId: string;
    projectId: string;
    name?: string;
  }>();
  const { user, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const [keyboardUp, setKeyboardUp] = useState(false);

  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);
  const [savingState, setSavingState] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [savingAssignee, setSavingAssignee] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentHeight, setCommentHeight] = useState(INPUT_MIN_HEIGHT);
  const [postingComment, setPostingComment] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [detail, projectStates, issueComments] = await Promise.all([
        getIssue(workspaceSlug, projectId, issueId),
        getStates(workspaceSlug, projectId),
        getComments(workspaceSlug, projectId, issueId),
      ]);
      setIssue(detail);
      setStates(projectStates);
      setComments(issueComments);
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't load this work item.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, projectId, issueId, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const currentState = states.find((state) => state.id === issue?.state_id) ?? null;
  const isAssignedToMe = !!user && !!issue?.assignee_ids.includes(user.id);
  const otherAssignees = issue ? issue.assignee_ids.filter((id) => id !== user?.id).length : 0;

  // Optimistic update helper — apply, call, revert on failure.
  const patchIssue = async (
    next: IssueDetail,
    data: { state_id?: string; assignee_ids?: string[]; priority?: string }
  ) => {
    if (!issue) return;
    const previous = issue;
    setIssue(next);
    try {
      await updateIssue(workspaceSlug, projectId, issueId, data);
    } catch (err) {
      setIssue(previous);
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't save your change.");
    }
  };

  const changeState = async (stateId: string) => {
    setStatePickerOpen(false);
    if (!issue || stateId === issue.state_id) return;
    setSavingState(true);
    await patchIssue({ ...issue, state_id: stateId }, { state_id: stateId });
    setSavingState(false);
  };

  const changePriority = async (nextPriority: string) => {
    setPriorityPickerOpen(false);
    if (!issue || nextPriority === issue.priority) return;
    setSavingPriority(true);
    await patchIssue({ ...issue, priority: nextPriority }, { priority: nextPriority });
    setSavingPriority(false);
  };

  const toggleAssignMe = async () => {
    if (!issue || !user) return;
    const next = isAssignedToMe ? issue.assignee_ids.filter((id) => id !== user.id) : [...issue.assignee_ids, user.id];
    setSavingAssignee(true);
    await patchIssue({ ...issue, assignee_ids: next }, { assignee_ids: next });
    setSavingAssignee(false);
  };

  const submitComment = async () => {
    const text = commentText.trim();
    if (!text || postingComment) return;
    setPostingComment(true);
    try {
      await addComment(workspaceSlug, projectId, issueId, `<p>${escapeHtml(text)}</p>`);
      setComments(await getComments(workspaceSlug, projectId, issueId));
      setCommentText("");
      setCommentHeight(INPUT_MIN_HEIGHT);
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't post the comment.");
    } finally {
      setPostingComment(false);
    }
  };

  const description = issue?.description_html ? stripHtml(issue.description_html) : "";
  const priority = issue?.priority ?? "none";
  const due = formatDueDate(issue?.target_date);

  return (
    <View style={styles.safe}>
      <ScreenHeader title={name ?? "Work item"} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : !issue ? (
        <Text style={styles.emptyText}>{error ?? "Work item not found."}</Text>
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollFade>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.issueRef}>#{issue.sequence_id}</Text>
            <Text style={styles.issueName}>{issue.name}</Text>

            {/* Editable meta */}
            <View style={styles.metaCard}>
              <Pressable onPress={() => setStatePickerOpen(true)}>
                {({ pressed }) => (
                  <View style={[styles.metaRowPressable, pressed && styles.metaRowPressed]}>
                    <Text style={styles.metaLabel}>Status</Text>
                    <View style={styles.metaValueRow}>
                      {savingState ? <ActivityIndicator size="small" color={colors.brand} /> : null}
                      {currentState ? (
                        <View style={[styles.stateDot, { backgroundColor: currentState.color }]} />
                      ) : null}
                      <Text style={styles.metaValue}>{currentState?.name ?? "—"}</Text>
                      <AppIcon icon={ArrowRight01Icon} size={16} color={colors.faint} strokeWidth={1.9} />
                    </View>
                  </View>
                )}
              </Pressable>

              <View style={styles.divider} />

              <Pressable onPress={() => setPriorityPickerOpen(true)}>
                {({ pressed }) => (
                  <View style={[styles.metaRowPressable, pressed && styles.metaRowPressed]}>
                    <Text style={styles.metaLabel}>Priority</Text>
                    <View style={styles.metaValueRow}>
                      {savingPriority ? <ActivityIndicator size="small" color={colors.brand} /> : null}
                      <View
                        style={[styles.stateDot, { backgroundColor: PRIORITY_COLOR[priority] ?? PRIORITY_COLOR.none }]}
                      />
                      <Text style={styles.metaValue}>{PRIORITY_LABEL[priority] ?? "No priority"}</Text>
                      <AppIcon icon={ArrowRight01Icon} size={16} color={colors.faint} strokeWidth={1.9} />
                    </View>
                  </View>
                )}
              </Pressable>

              <View style={styles.divider} />

              <View style={styles.metaRow}>
                <View>
                  <Text style={styles.metaLabel}>Assignee</Text>
                  {otherAssignees > 0 ? (
                    <Text style={styles.metaSubLabel}>
                      +{otherAssignees} other{otherAssignees === 1 ? "" : "s"}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => void toggleAssignMe()}
                  disabled={savingAssignee}
                  style={savingAssignee && styles.assignButtonDisabled}
                >
                  {({ pressed }) => (
                    <View style={[styles.assignButton, pressed && styles.assignButtonPressed]}>
                      {savingAssignee ? <ActivityIndicator size="small" color={colors.brand} /> : null}
                      <Text style={styles.assignButtonText}>{isAssignedToMe ? "Unassign me" : "Assign to me"}</Text>
                    </View>
                  )}
                </Pressable>
              </View>

              {due ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Due date</Text>
                    <View style={styles.metaValueRow}>
                      <AppIcon
                        icon={Calendar03Icon}
                        size={14}
                        color={due.overdue ? colors.danger : colors.faint}
                        strokeWidth={1.9}
                      />
                      <Text style={[styles.metaValue, due.overdue && styles.metaValueOverdue]}>{due.label}</Text>
                    </View>
                  </View>
                </>
              ) : null}
            </View>

            {/* Description */}
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={[styles.description, !description && styles.descriptionEmpty]}>
              {description || "No description."}
            </Text>

            {/* Comments */}
            <Text style={styles.sectionLabel}>Comments{comments.length > 0 ? ` · ${comments.length}` : ""}</Text>
            {comments.length === 0 ? (
              <Text style={styles.commentsEmpty}>No comments yet.</Text>
            ) : (
              comments.map((comment) => {
                const author = comment.actor_detail?.display_name ?? "Someone";
                return (
                  <View key={comment.id} style={styles.commentCard}>
                    <View style={styles.commentHeader}>
                      <Avatar
                        name={author}
                        size={22}
                        circle
                        imageUrl={comment.actor_detail?.avatar_url}
                      />
                      <Text style={styles.commentActor}>{author}</Text>
                      <Text style={styles.commentTime}>{timeAgo(comment.created_at)}</Text>
                    </View>
                    <Text style={styles.commentBody}>
                      {comment.comment_stripped?.trim() || stripHtml(comment.comment_html)}
                    </Text>
                  </View>
                );
              })
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>
          </ScrollFade>

          {/* Floating comment composer — mirrors Ask Atlas */}
          <View style={[styles.composerSafe, { paddingBottom: keyboardUp ? spacing.sm : insets.bottom }]}>
            <View style={styles.composerRow}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Add a comment…"
                placeholderTextColor={colors.textPlaceholder}
                multiline
                onContentSizeChange={(e) => {
                  const h = e.nativeEvent.contentSize.height;
                  setCommentHeight(Math.min(INPUT_MAX_HEIGHT, Math.max(INPUT_MIN_HEIGHT, h)));
                }}
                style={[styles.composerInput, { height: commentHeight }]}
                accessibilityLabel="Add a comment"
              />
              <Pressable
                onPress={() => void submitComment()}
                disabled={postingComment || commentText.trim().length === 0}
                accessibilityRole="button"
                accessibilityLabel="Post comment"
                style={({ pressed }) => [
                  styles.sendButton,
                  pressed && styles.sendButtonPressed,
                  (postingComment || commentText.trim().length === 0) && styles.sendButtonDisabled,
                ]}
              >
                {postingComment ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <AppIcon icon={SentIcon} size={18} color={colors.white} strokeWidth={1.9} />
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <PickerSheet
        visible={statePickerOpen}
        title="Status"
        options={states.map((state) => ({ id: state.id, label: state.name, color: state.color }))}
        selectedId={issue?.state_id}
        onSelect={(id) => void changeState(id)}
        onClose={() => setStatePickerOpen(false)}
      />

      <PickerSheet
        visible={priorityPickerOpen}
        title="Priority"
        options={["urgent", "high", "medium", "low", "none"].map((p) => ({
          id: p,
          label: PRIORITY_LABEL[p],
          color: PRIORITY_COLOR[p],
        }))}
        selectedId={priority}
        onSelect={(id) => void changePriority(id)}
        onClose={() => setPriorityPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: {
    marginTop: 40,
    textAlign: "center",
    fontSize: font.size.sm,
    color: colors.muted,
    fontFamily: "Figtree_400Regular",
  },
  keyboard: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  issueRef: {
    marginBottom: 2,
    fontSize: font.size.xs,
    color: colors.muted,
    fontFamily: "Figtree_600SemiBold",
  },
  issueName: {
    marginBottom: spacing.md,
    fontSize: font.size.xl,
    color: colors.ink,
    fontFamily: "Figtree_600SemiBold",
  },
  metaCard: {
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  metaRowPressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  metaRowPressed: { backgroundColor: colors.layerTransparentHover },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  metaLabel: { fontSize: font.size.sm, color: colors.muted, fontFamily: "Figtree_500Medium" },
  metaSubLabel: { marginTop: 2, fontSize: font.size.xs, color: colors.muted, fontFamily: "Figtree_400Regular" },
  metaValueRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  metaValue: { fontSize: font.size.sm, color: colors.ink, fontFamily: "Figtree_600SemiBold" },
  metaValueOverdue: { color: colors.danger },
  stateDot: { height: 12, width: 12, borderRadius: 999 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  assignButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  assignButtonPressed: { backgroundColor: colors.accentSubtleActive },
  assignButtonDisabled: { opacity: 0.7 },
  assignButtonText: { fontSize: font.size.sm, color: colors.brandText, fontFamily: "Figtree_600SemiBold" },
  sectionLabel: {
    marginBottom: 4,
    fontSize: font.size.xs,
    color: colors.muted,
    fontFamily: "Figtree_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  description: {
    marginBottom: spacing.lg,
    fontSize: font.size.sm,
    lineHeight: 20,
    color: colors.ink,
    fontFamily: "Figtree_400Regular",
  },
  descriptionEmpty: { color: colors.muted },
  commentsEmpty: {
    marginBottom: spacing.sm,
    fontSize: font.size.sm,
    color: colors.muted,
    fontFamily: "Figtree_400Regular",
  },
  commentCard: {
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  commentHeader: {
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  commentActor: { flex: 1, fontSize: font.size.sm, color: colors.ink, fontFamily: "Figtree_600SemiBold" },
  commentTime: { fontSize: font.size.xs, color: colors.muted, fontFamily: "Figtree_400Regular" },
  commentBody: {
    fontSize: font.size.sm,
    lineHeight: 20,
    color: colors.ink,
    fontFamily: "Figtree_400Regular",
  },
  errorText: {
    marginTop: spacing.sm,
    fontSize: font.size.sm,
    color: colors.danger,
    fontFamily: "Figtree_500Medium",
  },
  composerSafe: { backgroundColor: colors.canvas },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  composerInput: {
    flex: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg,
    // Symmetric vertical padding + matched lineHeight keeps the text vertically
    // centered; height is driven by onContentSizeChange so it hugs a single line
    // at rest and grows with content (see INPUT_MIN/MAX_HEIGHT).
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
  sendButton: {
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
  sendButtonPressed: { backgroundColor: colors.accentPrimaryHover },
  sendButtonDisabled: { opacity: 0.4 },
});

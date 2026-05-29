import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PickerSheet } from "@/components/picker-sheet";
import { ScreenHeader } from "@/components/screen-header";
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
import { escapeHtml, PRIORITY_COLOR, PRIORITY_LABEL, stripHtml, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function IssueDetailScreen() {
  const { workspaceSlug, issueId, projectId, name } = useLocalSearchParams<{
    workspaceSlug: string;
    issueId: string;
    projectId: string;
    name?: string;
  }>();
  const { user, signOut } = useSession();

  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [savingState, setSavingState] = useState(false);
  const [savingAssignee, setSavingAssignee] = useState(false);
  const [commentText, setCommentText] = useState("");
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

  const currentState = states.find((state) => state.id === issue?.state_id) ?? null;
  const isAssignedToMe = !!user && !!issue?.assignee_ids.includes(user.id);
  const otherAssignees = issue ? issue.assignee_ids.filter((id) => id !== user?.id).length : 0;

  // Optimistic update helper — apply, call, revert on failure.
  const patchIssue = async (next: IssueDetail, data: { state_id?: string; assignee_ids?: string[] }) => {
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

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={name ?? "Work item"} subtitle={issue ? `#${issue.sequence_id}` : undefined} />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e445a6" />
        </View>
      ) : !issue ? (
        <Text className="text-sm text-muted mt-10 text-center">{error ?? "Work item not found."}</Text>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
            <Text className="text-xl text-ink mb-4 font-semibold">{issue.name}</Text>

            {/* Editable meta */}
            <View className="mb-4 rounded-xl border border-black/5 bg-white">
              <Pressable
                onPress={() => setStatePickerOpen(true)}
                className="flex-row items-center justify-between gap-3 px-4 py-3 active:bg-black/5"
              >
                <Text className="text-sm text-muted">Status</Text>
                <View className="flex-row items-center gap-2">
                  {savingState ? <ActivityIndicator size="small" color="#e445a6" /> : null}
                  {currentState ? (
                    <View style={{ backgroundColor: currentState.color }} className="h-3 w-3 rounded-full" />
                  ) : null}
                  <Text className="text-sm text-ink font-medium">{currentState?.name ?? "—"}</Text>
                  <Text className="text-base text-muted">›</Text>
                </View>
              </Pressable>

              <View className="h-px bg-black/5" />

              <View className="flex-row items-center justify-between gap-3 px-4 py-3">
                <Text className="text-sm text-muted">Priority</Text>
                <View className="flex-row items-center gap-2">
                  <View
                    style={{ backgroundColor: PRIORITY_COLOR[priority] ?? PRIORITY_COLOR.none }}
                    className="h-3 w-3 rounded-full"
                  />
                  <Text className="text-sm text-ink font-medium">{PRIORITY_LABEL[priority] ?? "No priority"}</Text>
                </View>
              </View>

              <View className="h-px bg-black/5" />

              <View className="flex-row items-center justify-between gap-3 px-4 py-3">
                <View>
                  <Text className="text-sm text-muted">Assignee</Text>
                  {otherAssignees > 0 ? (
                    <Text className="text-xs text-muted">
                      +{otherAssignees} other{otherAssignees === 1 ? "" : "s"}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => void toggleAssignMe()}
                  disabled={savingAssignee}
                  className="bg-accent/10 flex-row items-center gap-2 rounded-lg px-3 py-1.5 active:opacity-70"
                >
                  {savingAssignee ? <ActivityIndicator size="small" color="#e445a6" /> : null}
                  <Text className="text-sm text-accent font-medium">
                    {isAssignedToMe ? "Unassign me" : "Assign to me"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Description */}
            <Text className="text-xs text-muted mb-1 font-medium uppercase">Description</Text>
            <Text className="text-sm text-ink mb-5 leading-5">{description || "No description."}</Text>

            {/* Comments */}
            <Text className="text-xs text-muted mb-2 font-medium uppercase">
              Comments{comments.length > 0 ? ` · ${comments.length}` : ""}
            </Text>
            {comments.length === 0 ? (
              <Text className="text-sm text-muted mb-2">No comments yet.</Text>
            ) : (
              comments.map((comment) => (
                <View key={comment.id} className="mb-2 rounded-xl border border-black/5 bg-white p-3">
                  <View className="mb-1 flex-row items-center justify-between">
                    <Text className="text-sm text-ink font-medium">
                      {comment.actor_detail?.display_name ?? "Someone"}
                    </Text>
                    <Text className="text-xs text-muted">{timeAgo(comment.created_at)}</Text>
                  </View>
                  <Text className="text-sm text-ink leading-5">
                    {comment.comment_stripped?.trim() || stripHtml(comment.comment_html)}
                  </Text>
                </View>
              ))
            )}

            {error ? <Text className="text-sm text-red-600 mt-2">{error}</Text> : null}
          </ScrollView>

          {/* Comment composer */}
          <SafeAreaView edges={["bottom"]} className="border-t border-black/5 bg-white">
            <View className="flex-row items-end gap-2 px-4 py-2">
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Add a comment…"
                placeholderTextColor="#9ca3af"
                multiline
                className="text-sm text-ink max-h-24 flex-1 rounded-xl bg-black/5 px-3 py-2"
              />
              <Pressable
                onPress={() => void submitComment()}
                disabled={postingComment || commentText.trim().length === 0}
                className="bg-accent rounded-xl px-4 py-2.5 active:opacity-80 disabled:opacity-40"
              >
                <Text className="text-sm font-semibold text-white">{postingComment ? "…" : "Send"}</Text>
              </Pressable>
            </View>
          </SafeAreaView>
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
    </View>
  );
}

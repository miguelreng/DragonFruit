import { useCallback, useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight01Icon } from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { PickerSheet } from "@/components/picker-sheet";
import {
  createIssue,
  getProjects,
  getWorkspaceMembers,
  isAuthError,
  type Priority,
  type Project,
  type WorkspaceMember,
} from "@/lib/api";
import { PRIORITY_COLOR, PRIORITY_LABEL } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, font, radius, spacing } from "@/lib/theme";

const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];

export default function NewTaskScreen() {
  const { workspaceSlug, projectId: presetProjectId } = useLocalSearchParams<{
    workspaceSlug: string;
    projectId?: string;
  }>();
  const { user, signOut } = useSession();
  const insets = useSafeAreaInsets();

  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(presetProjectId);
  const [priority, setPriority] = useState<Priority>("none");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  const [picker, setPicker] = useState<null | "project" | "priority" | "assignee">(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [projectList, memberList] = await Promise.all([
        getProjects(workspaceSlug),
        getWorkspaceMembers(workspaceSlug).catch(() => [] as WorkspaceMember[]),
      ]);
      setProjects(projectList);
      setMembers(memberList);
      // Default to the only project, or a preset, so the common case is one tap.
      if (!presetProjectId && projectList.length === 1) setProjectId(projectList[0].id);
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't load projects. Go back and try again.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, presetProjectId, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const assigneeName = useMemo(() => {
    if (!assigneeId) return "Unassigned";
    if (assigneeId === user?.id) return "Me";
    const m = members.find((mm) => mm.member.id === assigneeId);
    return m?.member.display_name || m?.member.first_name || "Someone";
  }, [assigneeId, members, user?.id]);

  const memberOptions = useMemo(() => {
    const opts = members.map((m) => ({
      id: m.member.id,
      label:
        m.member.id === user?.id
          ? "Me"
          : m.member.display_name || m.member.first_name || m.member.email || "Member",
    }));
    // Make sure "Me" is offered and sits first even if the members call failed.
    if (user && !opts.some((o) => o.id === user.id)) opts.unshift({ id: user.id, label: "Me" });
    return [{ id: "__none__", label: "Unassigned" }, ...opts];
  }, [members, user]);

  const canSubmit = !!projectId && name.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!projectId || name.trim().length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const issue = await createIssue(workspaceSlug, projectId, {
        name: name.trim(),
        priority,
        assignee_ids: assigneeId ? [assigneeId] : [],
      });
      // Replace so Back returns to where the user started, not this form.
      router.replace({
        pathname: "/[workspaceSlug]/issue/[issueId]",
        params: { workspaceSlug, issueId: issue.id, projectId, name: issue.name },
      });
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't create the task. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Dimmed backdrop — tapping outside the card dismisses the form. */}
      <Pressable style={styles.backdrop} onPress={() => router.back()} accessibilityLabel="Dismiss">
        <View style={[styles.sheet, { marginBottom: insets.bottom + spacing.md }]}>
          {/* Inner press handler stops taps on the card from dismissing it. */}
          <Pressable onPress={() => {}}>
            <View style={styles.grabberWrap}>
              <View style={styles.grabber} />
            </View>

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : (
              <View style={styles.body}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Task title"
                  placeholderTextColor={colors.textPlaceholder}
                  style={styles.titleInput}
                  multiline
                  accessibilityLabel="Task title"
                />

                <View style={styles.card}>
                  <FieldRow
                    label="Project"
                    value={selectedProject?.name ?? "Select a project"}
                    muted={!selectedProject}
                    onPress={() => setPicker("project")}
                  />
                  <View style={styles.divider} />
                  <FieldRow
                    label="Priority"
                    value={PRIORITY_LABEL[priority] ?? "No priority"}
                    dotColor={PRIORITY_COLOR[priority]}
                    onPress={() => setPicker("priority")}
                  />
                  <View style={styles.divider} />
                  <FieldRow label="Assignee" value={assigneeName} onPress={() => setPicker("assignee")} />
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  onPress={() => void submit()}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityLabel="Create task"
                  style={({ pressed }) => [
                    styles.submit,
                    pressed && styles.submitPressed,
                    !canSubmit && styles.submitDisabled,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.submitText}>Create task</Text>
                  )}
                </Pressable>
              </View>
            )}
          </Pressable>
        </View>
      </Pressable>

      <PickerSheet
        visible={picker === "project"}
        title="Project"
        options={projects.map((p) => ({ id: p.id, label: p.name }))}
        selectedId={projectId}
        onSelect={(id) => {
          setProjectId(id);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === "priority"}
        title="Priority"
        options={PRIORITIES.map((p) => ({ id: p, label: PRIORITY_LABEL[p], color: PRIORITY_COLOR[p] }))}
        selectedId={priority}
        onSelect={(id) => {
          setPriority(id as Priority);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === "assignee"}
        title="Assignee"
        options={memberOptions}
        selectedId={assigneeId ?? "__none__"}
        onSelect={(id) => {
          setAssigneeId(id === "__none__" ? null : id);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
    </KeyboardAvoidingView>
  );
}

function FieldRow({
  label,
  value,
  muted,
  dotColor,
  onPress,
}: {
  label: string;
  value: string;
  muted?: boolean;
  dotColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => pressed && styles.rowPressed}
    >
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.rowValueWrap}>
          {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
          <Text style={[styles.rowValue, muted && styles.rowValueMuted]} numberOfLines={1}>
            {value}
          </Text>
          <AppIcon icon={ArrowRight01Icon} size={16} color={colors.faint} strokeWidth={1.9} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Dimmed scrim; the card is pinned to the bottom with side gaps so it reads
  // as a floating drawer rather than an edge-docked sheet.
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.md,
  },
  sheet: {
    borderRadius: radius.xl,
    backgroundColor: colors.canvas,
    overflow: "hidden",
  },
  grabberWrap: { alignItems: "center", paddingTop: spacing.sm, paddingBottom: spacing.xs },
  grabber: { height: 4, width: 40, borderRadius: 999, backgroundColor: "rgba(0, 0, 0, 0.15)" },
  loading: { minHeight: 240, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: 20, paddingTop: spacing.md, paddingBottom: spacing.xl },
  titleInput: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.xs,
    fontSize: font.size.xl,
    lineHeight: 28,
    color: colors.ink,
    fontFamily: "Newsreader_600SemiBold",
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  rowPressed: { backgroundColor: colors.layerTransparentHover },
  rowLabel: { fontSize: font.size.sm, color: colors.muted, fontFamily: "Figtree_500Medium" },
  rowValueWrap: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowValue: { flexShrink: 1, fontSize: font.size.sm, color: colors.ink, fontFamily: "Figtree_600SemiBold" },
  rowValueMuted: { color: colors.textPlaceholder, fontFamily: "Figtree_400Regular" },
  dot: { height: 12, width: 12, borderRadius: 999 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.md },
  error: { marginTop: spacing.md, fontSize: font.size.sm, color: colors.danger, fontFamily: "Figtree_500Medium" },
  submit: {
    marginTop: spacing.lg,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.accentPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitPressed: { backgroundColor: colors.accentPrimaryHover },
  submitDisabled: { opacity: 0.4 },
  submitText: { fontSize: font.size.md, color: colors.white, fontFamily: "Figtree_600SemiBold" },
});

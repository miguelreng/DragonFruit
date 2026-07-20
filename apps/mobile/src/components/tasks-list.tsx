import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { router } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { AppIcon } from "@/components/app-icon";
import { EmptyState } from "@/components/empty-state";
import { FilterPills } from "@/components/filter-pills";
import { PressableScale } from "@/components/pressable-scale";
import { ScrollFade } from "@/components/scroll-fade";
import {
  getMyIssues,
  getProjects,
  getWorkspaceLabels,
  getWorkspaceStates,
  isAuthError,
  updateIssue,
  type IssueListItem,
  type Label,
  type WorkflowState,
} from "@/lib/api";
import { formatDueDate, PRIORITY_COLOR } from "@/lib/format";
import { commitHaptic, selectionHaptic } from "@/lib/haptics";
import { ArrowRight01Icon, CheckIcon, CheckmarkCircle02Icon, RepeatIcon } from "@/lib/icons";
import { useSession } from "@/lib/session";
import { colors, font, radius, spacing } from "@/lib/theme";

// State groups that mean "no longer on the todo list" — mirrors the web My tasks
// (isOpenIssue), which only ever shows open work.
const DONE_GROUPS = new Set(["completed", "cancelled"]);
// How long a row stays visibly checked (strike-through + filled check) before it
// animates out — matches the web list's COMPLETE_ANIMATION_MS feel.
const COMPLETE_ANIMATION_MS = 320;

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ProjectGroup = { projectId: string; name: string; issues: IssueListItem[] };
type UndoTask = { issue: IssueListItem; previousStateId: string | null };

function TaskRow({
  issue,
  labels,
  checked,
  onComplete,
  onOpen,
}: {
  issue: IssueListItem;
  labels: Label[];
  checked: boolean;
  onComplete: () => void;
  onOpen: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const completion = useSharedValue(checked ? 1 : 0);
  const priority = issue.priority ?? "none";
  const hasPriority = priority !== "none";
  const due = formatDueDate(issue.target_date);
  const shownLabels = labels.slice(0, 3);
  const hasMeta = hasPriority || !!due || shownLabels.length > 0;

  useEffect(() => {
    completion.value = reducedMotion
      ? checked
        ? 1
        : 0
      : checked
        ? withSpring(1, { damping: 20, stiffness: 280, mass: 0.7 })
        : withTiming(0, { duration: 140 });
  }, [checked, completion, reducedMotion]);

  const rowMotionStyle = useAnimatedStyle(() => ({
    opacity: 1 - completion.value * 0.38,
    transform: [{ translateX: completion.value * 8 }],
  }));
  const checkMotionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.72 + completion.value * 0.28 }, { rotate: `${(1 - completion.value) * -18}deg` }],
  }));

  return (
    <Animated.View style={rowMotionStyle}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={issue.name}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed, checked && styles.rowChecked]}
      >
        <Pressable
          onPress={onComplete}
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={`Complete ${issue.name}`}
          style={[styles.checkbox, checked && styles.checkboxChecked]}
        >
          {checked ? (
            <Animated.View style={checkMotionStyle}>
              <AppIcon icon={CheckIcon} size={11} color={colors.textTertiary} strokeWidth={3} />
            </Animated.View>
          ) : null}
        </Pressable>

        <Text style={[styles.rowTitle, checked && styles.rowTitleChecked]} numberOfLines={1}>
          {issue.name}
        </Text>

        {hasMeta ? (
          <View style={styles.metaRow}>
            {shownLabels.map((label) => (
              <View key={label.id} style={[styles.labelDot, { backgroundColor: label.color || colors.textTertiary }]} />
            ))}
            {hasPriority ? (
              <View
                style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[priority] ?? PRIORITY_COLOR.none }]}
              />
            ) : null}
            {due ? (
              <Text style={[styles.dueText, due.overdue && styles.dueTextOverdue]} numberOfLines={1}>
                {due.label}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function AnimatedChevron({ expanded }: { expanded: boolean }) {
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    rotation.value = reducedMotion ? (expanded ? 1 : 0) : withTiming(expanded ? 1 : 0, { duration: 200 });
  }, [expanded, reducedMotion, rotation]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value * 90}deg` }] }));
  return (
    <Animated.View style={style}>
      <AppIcon icon={ArrowRight01Icon} size={16} color={colors.textTertiary} strokeWidth={2} />
    </Animated.View>
  );
}

/**
 * "My tasks" list — the mobile counterpart of the web My tasks page. Tasks are
 * grouped under collapsible per-project headers with counts, each row has a
 * tap-to-complete check (strike-through, then it slides out), and rows surface
 * their priority, due date, and label chips.
 */
export function TasksList({ workspaceSlug, showTitle = true }: { workspaceSlug: string; showTitle?: boolean }) {
  const { user, signOut } = useSession();
  const reducedMotion = useReducedMotion();
  const [issues, setIssues] = useState<IssueListItem[]>([]);
  const [projects, setProjects] = useState<Record<string, { name: string; identifier: string }>>({});
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [labels, setLabels] = useState<Map<string, Label>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [undoTask, setUndoTask] = useState<UndoTask | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const [myIssues, projectList, wsStates, wsLabels] = await Promise.all([
        getMyIssues(workspaceSlug, user.id),
        getProjects(workspaceSlug),
        getWorkspaceStates(workspaceSlug),
        getWorkspaceLabels(workspaceSlug),
      ]);
      setIssues(myIssues);
      setProjects(Object.fromEntries(projectList.map((p) => [p.id, { name: p.name, identifier: p.identifier }])));
      setStates(wsStates);
      setLabels(new Map(wsLabels.map((label) => [label.id, label])));
    } catch (caught) {
      if (isAuthError(caught)) {
        await signOut();
        return;
      }
      setError("Couldn't load your tasks.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [signOut, user, workspaceSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    },
    []
  );

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  const stateById = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);
  // First "completed"-group state per project — the target when checking a task off.
  const completedStateByProject = useMemo(() => {
    const map = new Map<string, string>();
    for (const state of states) {
      if (state.group === "completed" && state.project_id && !map.has(state.project_id)) {
        map.set(state.project_id, state.id);
      }
    }
    return map;
  }, [states]);

  // Only open work belongs on the list: drop anything done/cancelled or already checked off here.
  const groups = useMemo<ProjectGroup[]>(() => {
    const byProject = new Map<string, IssueListItem[]>();
    for (const issue of issues) {
      if (completedIds.has(issue.id)) continue;
      const group = issue.state_id ? stateById.get(issue.state_id)?.group : undefined;
      if (group && DONE_GROUPS.has(group)) continue;
      const bucket = byProject.get(issue.project_id);
      if (bucket) bucket.push(issue);
      else byProject.set(issue.project_id, [issue]);
    }
    return [...byProject.entries()]
      .map(([projectId, groupIssues]) => ({
        projectId,
        name: projects[projectId]?.name ?? "Other",
        issues: groupIssues,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [issues, completedIds, stateById, projects]);

  const projectOptions = useMemo(() => groups.map((g) => ({ id: g.projectId, label: g.name })), [groups]);
  const visibleGroups = projectFilter ? groups.filter((g) => g.projectId === projectFilter) : groups;

  const toggleGroup = (projectId: string) => {
    selectionHaptic();
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const presentUndo = (action: UndoTask) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoTask(action);
    undoTimerRef.current = setTimeout(() => {
      setUndoTask(null);
      undoTimerRef.current = null;
    }, 6000);
  };

  const completeTask = (issue: IssueListItem) => {
    if (checkingIds.has(issue.id)) return;
    const completedStateId = completedStateByProject.get(issue.project_id);
    if (!completedStateId) {
      setError("This project has no completed state to move the task into.");
      return;
    }
    commitHaptic();
    setCheckingIds((prev) => new Set(prev).add(issue.id));
    void updateIssue(workspaceSlug, issue.project_id, issue.id, { state_id: completedStateId })
      .then(() => {
        const timer = setTimeout(() => {
          if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setCompletedIds((prev) => new Set(prev).add(issue.id));
          setCheckingIds((prev) => {
            const next = new Set(prev);
            next.delete(issue.id);
            return next;
          });
          presentUndo({ issue, previousStateId: issue.state_id });
        }, COMPLETE_ANIMATION_MS);
        timersRef.current.push(timer);
      })
      .catch(async (caught: unknown) => {
        if (isAuthError(caught)) {
          await signOut();
          return;
        }
        setCheckingIds((prev) => {
          const next = new Set(prev);
          next.delete(issue.id);
          return next;
        });
        setError("Couldn't complete that task. Please try again.");
      });
  };

  const undoLastTask = async () => {
    const action = undoTask;
    if (!action || undoingId) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setUndoingId(action.issue.id);
    selectionHaptic();
    try {
      await updateIssue(workspaceSlug, action.issue.project_id, action.issue.id, {
        state_id: action.previousStateId,
      });
      setCompletedIds((prev) => {
        const next = new Set(prev);
        next.delete(action.issue.id);
        return next;
      });
      setUndoTask(null);
    } catch (caught: unknown) {
      if (isAuthError(caught)) {
        setUndoTask(null);
        await signOut();
        return;
      }
      setError("Couldn't undo that task. Please try again.");
      presentUndo(action);
    } finally {
      setUndoingId(null);
    }
  };

  const openIssue = (issue: IssueListItem) => {
    selectionHaptic();
    router.push({
      pathname: "/[workspaceSlug]/issue/[issueId]",
      params: { workspaceSlug, issueId: issue.id, projectId: issue.project_id, name: issue.name },
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {showTitle ? (
        <View style={styles.header}>
          <Text style={styles.title}>My tasks</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      {projectOptions.length > 1 ? (
        <FilterPills options={projectOptions} value={projectFilter} onChange={setProjectFilter} />
      ) : null}

      <ScrollFade topHeight={20} bottomHeight={showTitle ? 80 : 48}>
        <ScrollView
          contentContainerStyle={visibleGroups.length === 0 ? styles.emptyContent : styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accentPrimary} />
          }
        >
          {visibleGroups.length === 0 ? (
            <EmptyState
              icon={CheckmarkCircle02Icon}
              title={error ? "Couldn't load your tasks" : "You're all caught up"}
              body={error ? "Pull to retry." : "Work items assigned to you across this workspace show up here."}
            />
          ) : (
            visibleGroups.map((group) => {
              const isCollapsed = collapsed.has(group.projectId);
              return (
                <View key={group.projectId} style={styles.group}>
                  <PressableScale
                    onPress={() => toggleGroup(group.projectId)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !isCollapsed }}
                    accessibilityLabel={`${group.name}, ${group.issues.length} tasks`}
                    style={({ pressed }) => [styles.groupHeader, pressed && styles.groupHeaderPressed]}
                  >
                    {/* Row layout lives on an inner View — New-Arch (Animated)
                        Pressable stacks its children when it carries flexDirection. */}
                    <View style={styles.groupHeaderInner}>
                      <AnimatedChevron expanded={!isCollapsed} />
                      <Text style={styles.groupName} numberOfLines={1}>
                        {group.name}
                      </Text>
                      <View style={styles.groupCount}>
                        <Text style={styles.groupCountText}>{group.issues.length}</Text>
                      </View>
                    </View>
                  </PressableScale>

                  {isCollapsed ? null : (
                    <View style={styles.groupTasks}>
                      {group.issues.map((issue) => {
                        const issueLabels = (issue.label_ids ?? [])
                          .map((id) => labels.get(id))
                          .filter((label): label is Label => !!label);
                        return (
                          <TaskRow
                            key={issue.id}
                            issue={issue}
                            labels={issueLabels}
                            checked={checkingIds.has(issue.id)}
                            onComplete={() => completeTask(issue)}
                            onOpen={() => openIssue(issue)}
                          />
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </ScrollFade>

      {undoTask ? (
        <View style={styles.undoToast} accessibilityLiveRegion="polite">
          <AppIcon icon={RepeatIcon} size={18} color={colors.textSecondary} strokeWidth={1.9} />
          <View style={styles.undoCopy}>
            <Text style={styles.undoTitle} numberOfLines={1}>
              Task completed
            </Text>
            <Text style={styles.undoSubtitle} numberOfLines={1}>
              {undoTask.issue.name}
            </Text>
          </View>
          <PressableScale
            onPress={() => void undoLastTask()}
            disabled={undoingId !== null}
            accessibilityRole="button"
            accessibilityLabel={`Undo completing ${undoTask.issue.name}`}
            style={({ pressed }) => [styles.undoButton, pressed && styles.undoButtonPressed]}
          >
            <Text style={styles.undoButtonText}>{undoingId ? "Undoing…" : "Undo"}</Text>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  title: { color: colors.ink, fontFamily: "Figtree_600SemiBold", fontSize: font.size.xxl, letterSpacing: -0.45 },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.danger,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.sm,
  },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  emptyContent: { flexGrow: 1, paddingHorizontal: spacing.lg },
  group: { marginBottom: spacing.md },
  groupTasks: { marginTop: spacing.sm },
  // Header: caret + name + count hug the left, matching the web list.
  groupHeader: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  groupHeaderInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  groupHeaderPressed: { backgroundColor: colors.layerTransparentHover },
  groupName: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.base,
  },
  groupCount: {
    flexShrink: 0,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.layer1,
  },
  groupCountText: { color: colors.textTertiary, fontFamily: "Figtree_500Medium", fontSize: font.size.xs },
  // Flat, borderless rows — a checkbox + title, Reminders/Things-style like the web.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 9,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowPressed: { backgroundColor: colors.layerTransparentHover },
  rowChecked: { opacity: 0.6 },
  checkbox: {
    height: 20,
    width: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  checkboxChecked: { backgroundColor: colors.layer1Active },
  rowTitle: { flex: 1, fontSize: font.size.base, color: colors.textSecondary, fontFamily: "Figtree_400Regular" },
  rowTitleChecked: { textDecorationLine: "line-through", color: colors.textPlaceholder },
  metaRow: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  priorityDot: { height: 8, width: 8, borderRadius: 999 },
  labelDot: { height: 8, width: 8, borderRadius: 999 },
  dueText: { fontSize: font.size.xs, color: colors.textTertiary, fontFamily: "Figtree_500Medium" },
  dueTextOverdue: { color: colors.danger },
  undoToast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  undoCopy: { flex: 1, minWidth: 0, gap: 1 },
  undoTitle: { color: colors.ink, fontFamily: "Figtree_600SemiBold", fontSize: font.size.sm },
  undoSubtitle: { color: colors.textTertiary, fontFamily: "Figtree_400Regular", fontSize: font.size.xs },
  undoButton: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.layer1Hover,
  },
  undoButtonPressed: { backgroundColor: colors.layer1Active },
  undoButtonText: { color: colors.brandText, fontFamily: "Figtree_600SemiBold", fontSize: font.size.sm },
});

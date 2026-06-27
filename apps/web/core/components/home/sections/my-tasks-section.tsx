/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import { TOAST_TYPE, dismissToast, setToast } from "@plane/propel/toast";
import type { TBaseIssue, TIssuesResponse } from "@plane/types";
import { cn, createIssuePayload, getDate, renderFormattedPayloadDate } from "@plane/utils";
import { ChevronRight } from "@/components/icons/lucide-shim";
import useLocalStorage from "@/hooks/use-local-storage";
import { useUser } from "@/hooks/store/user";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { IssueService } from "@/services/issue";
import { normalizeProjectToken, parseQuickInput, randomLabelColor } from "./task-parse";
import { TaskQuickAdd } from "./task-quick-add";
import { MAX_TASK_DEPTH, TaskRow, type TaskRowOps } from "./task-row";
import { isOpenIssue, useMyTasksData } from "./use-my-tasks";

// How long the row stays visibly "checked" before it animates out of the list.
const COMPLETE_ANIMATION_MS = 320;

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

const issueService = new IssueService();

/** Soonest due first, then by priority — mirrors how Reminders surfaces what's urgent. */
function sortIssues(issues: TBaseIssue[]): TBaseIssue[] {
  // Copy before sorting (toSorted needs es2023 lib, which this project's tsc target predates).
  // oxlint-disable-next-line unicorn/no-array-sort
  return [...issues].sort((a, b) => {
    const aDue = a.target_date ? (getDate(a.target_date)?.getTime() ?? Infinity) : Infinity;
    const bDue = b.target_date ? (getDate(b.target_date)?.getTime() ?? Infinity) : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    const aRank = PRIORITY_RANK[a.priority ?? "none"] ?? 4;
    const bRank = PRIORITY_RANK[b.priority ?? "none"] ?? 4;
    return aRank - bRank;
  });
}

type ForestEntry = { issue: TBaseIssue; depth: number; height: number; ancestorIds: string[] };

type Forest = {
  /** Render order (parents before children) per project. */
  entriesByProject: Map<string, ForestEntry[]>;
  /** Render order across all projects (flat usage). */
  allEntries: ForestEntry[];
  byId: Map<string, TBaseIssue>;
  depthById: Map<string, number>;
  heightById: Map<string, number>;
  /** All descendant ids per task (for cycle checks on nest). */
  descendantIdsById: Map<string, Set<string>>;
  /** Direct children per parent, in render order. */
  childrenByParent: Map<string, TBaseIssue[]>;
};

/**
 * Turn the flat open-issue list into a parent→child forest. A task is a root when it has no
 * parent (or its parent isn't in the user's list). Each entry carries its depth, the height of
 * its own subtree, and its ancestor chain. Children stay sorted by due → priority within a parent.
 */
function buildForest(issues: TBaseIssue[], openIds: Set<string>): Forest {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const childrenByParent = new Map<string, TBaseIssue[]>();
  const roots: TBaseIssue[] = [];
  for (const issue of issues) {
    const pid = issue.parent_id && openIds.has(issue.parent_id) ? issue.parent_id : null;
    if (pid) {
      const bucket = childrenByParent.get(pid);
      if (bucket) bucket.push(issue);
      else childrenByParent.set(pid, [issue]);
    } else {
      roots.push(issue);
    }
  }

  const entriesByProject = new Map<string, ForestEntry[]>();
  const allEntries: ForestEntry[] = [];
  const depthById = new Map<string, number>();
  const heightById = new Map<string, number>();
  const descendantIdsById = new Map<string, Set<string>>();

  const pushEntry = (entry: ForestEntry) => {
    allEntries.push(entry);
    const key = entry.issue.project_id ?? "__none__";
    const bucket = entriesByProject.get(key);
    if (bucket) bucket.push(entry);
    else entriesByProject.set(key, [entry]);
  };

  const visit = (issue: TBaseIssue, depth: number, ancestorIds: string[]): { height: number; descendants: Set<string> } => {
    depthById.set(issue.id, depth);
    const entry: ForestEntry = { issue, depth, height: 0, ancestorIds };
    pushEntry(entry);
    const kids = sortIssues(childrenByParent.get(issue.id) ?? []);
    const childAncestors = [...ancestorIds, issue.id];
    const descendants = new Set<string>();
    let height = 0;
    for (const kid of kids) {
      const res = visit(kid, depth + 1, childAncestors);
      height = Math.max(height, res.height + 1);
      descendants.add(kid.id);
      for (const d of res.descendants) descendants.add(d);
    }
    entry.height = height;
    heightById.set(issue.id, height);
    descendantIdsById.set(issue.id, descendants);
    return { height, descendants };
  };

  for (const root of sortIssues(roots)) visit(root, 0, []);

  return { entriesByProject, allEntries, byId, depthById, heightById, descendantIdsById, childrenByParent };
}

type MyTasksSectionProps = {
  /** Whose tasks to show. Defaults to the signed-in user (home usage). */
  userId?: string;
  /** Hide the widget's "My tasks" title + icon + count (profile page uses the page title instead). */
  hideHeader?: boolean;
  /** Drop the card chrome (border/bg) so the list sits flat on the page — used by the home. */
  flat?: boolean;
  /** Group tasks under collapsible per-project headers (full tasks page); flat list otherwise. */
  groupByProject?: boolean;
};

export const MyTasksSection = observer(function MyTasksSection({
  userId: userIdProp,
  hideHeader = false,
  flat = false,
  groupByProject = false,
}: MyTasksSectionProps = {}) {
  const { workspaceSlug } = useParams();
  const searchParams = useSearchParams();
  const { data: currentUser } = useUser();
  const { getStateById, getProjectStates, fetchWorkspaceStates, fetchProjectStates } = useProjectState();
  const { getProjectById, joinedProjectIds } = useProject();
  const { getProjectLabels, fetchProjectLabels, createLabel, getWorkspaceLabels, fetchWorkspaceLabels } = useLabel();

  const slug = workspaceSlug?.toString();
  const userId = userIdProp ?? currentUser?.id;

  // Inline create (Reminders-style): only on your own list, and only if there's
  // a project to drop the new task into.
  const isOwnList = !!currentUser?.id && userId === currentUser.id;
  const [addProjectId, setAddProjectId] = useState<string | null>(null);
  const resolvedAddProjectId = addProjectId ?? joinedProjectIds[0] ?? null;
  const canAdd = isOwnList && !!resolvedAddProjectId;

  // `checking` → row is mid-completion (shows the filled check + strike-through).
  // `completed` → completion confirmed, row is removed from the list.
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  // Which project groups are collapsed (persisted per workspace). Default = all expanded.
  const { storedValue: collapsedProjectIds, setValue: setCollapsedProjectIds } = useLocalStorage<string[]>(
    `my-tasks-collapsed-projects:${slug ?? "default"}`,
    []
  );
  const collapsedSet = new Set(collapsedProjectIds ?? []);
  const toggleProjectCollapsed = (projectId: string) => {
    const next = new Set(collapsedSet);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    setCollapsedProjectIds([...next]);
  };

  // The project + optional parent that currently shows a blank "new task" line (opened by
  // pressing Enter on a task, editor-checklist style). Only one draft line is open at a time.
  const [draft, setDraft] = useState<{ projectId: string; indentTargetId: string; defaultIndented: boolean } | null>(
    null
  );

  // Latest computed forest, kept in a ref so the nest/indent/outdent callbacks can stay stable
  // (otherwise they'd change every data update and re-register every row's drag listeners).
  const forestRef = useRef<Forest | null>(null);

  // Task whose inline title should grab focus next (set after creating from the add row).
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

  const { data, isLoading, mutate } = useMyTasksData(slug, userId);

  // Load every project's states up front so we can both classify each task's
  // state group and resolve the project's "done" state when completing.
  useEffect(() => {
    if (slug) fetchWorkspaceStates(slug).catch(() => {});
  }, [slug, fetchWorkspaceStates]);

  // Load workspace labels so we can render label chips on each task row.
  useEffect(() => {
    if (slug) fetchWorkspaceLabels(slug).catch(() => {});
  }, [slug, fetchWorkspaceLabels]);

  // id → label lookup for rendering chips (labels are workspace-wide here).
  const labelById = useMemo(
    () => new Map((slug ? (getWorkspaceLabels(slug) ?? []) : []).map((label) => [label.id, label])),
    [slug, getWorkspaceLabels]
  );

  const resolveCompletedStateId = useCallback(
    async (projectId: string): Promise<string | undefined> => {
      let states = getProjectStates(projectId);
      if ((!states || states.length === 0) && slug) {
        states = await fetchProjectStates(slug, projectId).catch(() => undefined);
      }
      return states?.find((state) => state.group === "completed")?.id;
    },
    [getProjectStates, fetchProjectStates, slug]
  );

  // Revert a just-completed task back to the state it had before completing,
  // bringing it back onto the list.
  const handleUndoComplete = useCallback(
    async (issue: TBaseIssue, previousStateId: string | null | undefined) => {
      const projectId = issue.project_id;
      if (!slug || !projectId || !previousStateId) return;
      try {
        await issueService.patchIssue(slug, projectId, issue.id, { state_id: previousStateId });
        setCompletedIds((prev) => {
          const next = new Set(prev);
          next.delete(issue.id);
          return next;
        });
        setCheckingIds((prev) => {
          const next = new Set(prev);
          next.delete(issue.id);
          return next;
        });
        mutate();
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't undo", message: "Something went wrong. Please try again." });
      }
    },
    [slug, mutate]
  );

  const handleComplete = useCallback(
    async (issue: TBaseIssue) => {
      const projectId = issue.project_id;
      if (!slug || !projectId || checkingIds.has(issue.id) || completedIds.has(issue.id)) return;

      // Remember the pre-completion state so the toast's "Undo" can restore it.
      const previousStateId = issue.state_id;

      // Optimistically show the row as checked.
      setCheckingIds((prev) => new Set(prev).add(issue.id));
      try {
        const completedStateId = await resolveCompletedStateId(projectId);
        if (!completedStateId) throw new Error("No completed state for project");
        await issueService.patchIssue(slug, projectId, issue.id, { state_id: completedStateId });
        // Let the check land, then slide the row out and refresh in the background.
        setTimeout(() => {
          setCompletedIds((prev) => new Set(prev).add(issue.id));
          setCheckingIds((prev) => {
            const next = new Set(prev);
            next.delete(issue.id);
            return next;
          });
          mutate();
          // Offer a brief window to undo, Reminders-style.
          let toastId: string | undefined;
          const undo = () => {
            if (toastId) dismissToast(toastId);
            handleUndoComplete(issue, previousStateId);
          };
          toastId = setToast({
            type: TOAST_TYPE.SUCCESS,
            title: "Task completed",
            actionItems: (
              <button type="button" onClick={undo}>
                Undo
              </button>
            ),
          });
        }, COMPLETE_ANIMATION_MS);
      } catch {
        setCheckingIds((prev) => {
          const next = new Set(prev);
          next.delete(issue.id);
          return next;
        });
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Couldn't complete task",
          message: "Something went wrong. Please try again.",
        });
      }
    },
    [slug, checkingIds, completedIds, resolveCompletedStateId, mutate, handleUndoComplete]
  );

  // Resolve `#label` names to label ids in the target project, creating any
  // that don't exist yet (case-insensitive match).
  const resolveLabelIds = useCallback(
    async (projectId: string, names: string[]): Promise<string[]> => {
      if (!slug || names.length === 0) return [];
      let labels = getProjectLabels(projectId);
      if (!labels) labels = await fetchProjectLabels(slug, projectId).catch(() => [] as typeof labels);
      const ids = await Promise.all(
        names.map(async (name) => {
          const existing = labels?.find((label) => label.name.toLowerCase() === name.toLowerCase());
          if (existing) return existing.id;
          try {
            const created = await createLabel(slug, projectId, { name, color: randomLabelColor() });
            return created?.id;
          } catch {
            // Skip a label we couldn't create rather than failing the whole task.
            return undefined;
          }
        })
      );
      return ids.filter((id): id is string => !!id);
    },
    [slug, getProjectLabels, fetchProjectLabels, createLabel]
  );

  const resolveProjectId = useCallback(
    (name: string): string | undefined => {
      const normalizedName = normalizeProjectToken(name);
      if (!normalizedName) return undefined;
      return joinedProjectIds.find((projectId) => {
        const project = getProjectById(projectId);
        return (
          normalizeProjectToken(project?.name ?? "") === normalizedName ||
          normalizeProjectToken(project?.identifier ?? "") === normalizedName
        );
      });
    },
    [joinedProjectIds, getProjectById]
  );

  // Create one task from raw quick-input text. `forcedProjectId` pins the target project; a
  // `parentId` makes it a subtask. Returns the created issue, or null on no-op/failure.
  const createTask = useCallback(
    async (rawText: string, opts?: { projectId?: string; parentId?: string | null }): Promise<TBaseIssue | null> => {
      const parsed = parseQuickInput(rawText);
      if (!slug || !parsed.name) return null;
      // Subtasks must stay in their parent's project (opts.projectId). For top-level creates a
      // typed `/project` token wins, then the composer's project, then the add-row default.
      const targetProjectId = opts?.parentId
        ? opts.projectId
        : (parsed.projectName ? resolveProjectId(parsed.projectName) : undefined) ??
          opts?.projectId ??
          resolvedAddProjectId;
      if (!targetProjectId) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Couldn't find project",
          message: `No joined project matches /${parsed.projectName}.`,
        });
        return null;
      }
      try {
        const labelIds = await resolveLabelIds(targetProjectId, parsed.labelNames);
        const payload = createIssuePayload(targetProjectId, {
          name: parsed.name,
          assignee_ids: userId ? [userId] : [],
          ...(opts?.parentId ? { parent_id: opts.parentId } : {}),
          ...(parsed.priority ? { priority: parsed.priority } : {}),
          ...(parsed.dueDate ? { target_date: renderFormattedPayloadDate(parsed.dueDate) } : {}),
          ...(labelIds.length > 0 ? { label_ids: labelIds } : {}),
        });
        const created = await issueService.createIssue(slug, targetProjectId, payload);
        // Optimistically surface the new task without a full refetch.
        mutate(
          (prev) => {
            const results = Array.isArray(prev?.results) ? (prev!.results as TBaseIssue[]) : [];
            return {
              ...prev,
              results: [created as TBaseIssue, ...results],
              total_count: ((prev?.total_count as number | undefined) ?? 0) + 1,
            } as TIssuesResponse;
          },
          { revalidate: false }
        );
        return created as TBaseIssue;
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Couldn't add task",
          message: "Something went wrong. Please try again.",
        });
        return null;
      }
    },
    [slug, resolvedAddProjectId, resolveProjectId, userId, mutate, resolveLabelIds]
  );

  // Save an inline edit to an existing task. The same `#label @date !priority` tokens the
  // add row supports are parsed out, applied, and stripped from the title. Labels are added
  // to (not removed from) the task; `/project` is ignored here (renaming doesn't move tasks).
  const updateTask = useCallback(
    async (issue: TBaseIssue, rawText: string) => {
      const parsed = parseQuickInput(rawText);
      const projectId = issue.project_id;
      if (!slug || !projectId || !parsed.name) return;
      const labelIds = parsed.labelNames.length > 0 ? await resolveLabelIds(projectId, parsed.labelNames) : [];
      const mergedLabels = labelIds.length > 0 ? [...new Set([...(issue.label_ids ?? []), ...labelIds])] : undefined;
      try {
        await issueService.patchIssue(slug, projectId, issue.id, {
          name: parsed.name,
          ...(parsed.priority ? { priority: parsed.priority } : {}),
          ...(parsed.dueDate ? { target_date: renderFormattedPayloadDate(parsed.dueDate) } : {}),
          ...(mergedLabels ? { label_ids: mergedLabels } : {}),
        });
        mutate();
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Couldn't update task",
          message: "Something went wrong. Please try again.",
        });
        // Re-throw so the inline field reverts to the last saved value.
        throw new Error("update failed");
      }
    },
    [slug, resolveLabelIds, mutate]
  );

  // Re-parent a task (drag-to-nest / Tab indent). Same project only; rejects cycles and any
  // move that would push the subtree past MAX_TASK_DEPTH.
  const nestTask = useCallback(
    async (childId: string, parentId: string) => {
      const f = forestRef.current;
      const child = f?.byId.get(childId);
      const parent = f?.byId.get(parentId);
      if (!slug || !f || !child?.project_id || !parent) return;
      if (childId === parentId || child.parent_id === parentId) return;
      if (child.project_id !== parent.project_id) return;
      // Don't nest a task under one of its own descendants.
      if (f.descendantIdsById.get(childId)?.has(parentId)) return;
      const newDepth = (f.depthById.get(parentId) ?? 0) + 1;
      const childHeight = f.heightById.get(childId) ?? 0;
      if (newDepth + childHeight > MAX_TASK_DEPTH) return;
      try {
        await issueService.patchIssue(slug, child.project_id, childId, { parent_id: parentId });
        mutate();
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't nest task", message: "Something went wrong." });
      }
    },
    [slug, mutate]
  );

  // Outdent one level: re-parent to the grandparent (or top level for a first-level subtask).
  const outdentTask = useCallback(
    async (issue: TBaseIssue) => {
      const f = forestRef.current;
      if (!slug || !issue.project_id || !issue.parent_id || !f) return;
      const parent = f.byId.get(issue.parent_id);
      const newParentId = parent?.parent_id && f.byId.has(parent.parent_id) ? parent.parent_id : null;
      try {
        await issueService.patchIssue(slug, issue.project_id, issue.id, { parent_id: newParentId });
        mutate();
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't outdent task", message: "Something went wrong." });
      }
    },
    [slug, mutate]
  );

  const allIssues: TBaseIssue[] = Array.isArray(data?.results) ? (data!.results as TBaseIssue[]) : [];

  // Header label pills drive `?label=<id>` — when set, show only tasks with that label.
  const activeLabel = searchParams.get("label");
  // Header search drives `?q=<text>` — when set, match against the task title.
  const searchQuery = (searchParams.get("q") ?? "").trim().toLowerCase();

  // Only open work belongs on a todo list — drop anything done or cancelled.
  const openIssues = allIssues.filter(
    (issue) =>
      !completedIds.has(issue.id) &&
      isOpenIssue(issue, getStateById) &&
      (!activeLabel || (issue.label_ids ?? []).includes(activeLabel)) &&
      (!searchQuery || (issue.name ?? "").toLowerCase().includes(searchQuery))
  );

  const tasks = sortIssues(openIssues);
  const openIds = useMemo(() => new Set(openIssues.map((i) => i.id)), [openIssues]);

  const forest = useMemo(() => buildForest(openIssues, openIds), [openIssues, openIds]);
  forestRef.current = forest;

  // Stable midnight reference for "overdue" styling — recomputed once per mount.
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Indent a task under its preceding sibling at the same level (Tab). Capped at MAX_TASK_DEPTH.
  const indentTask = useCallback((issue: TBaseIssue) => {
    const f = forestRef.current;
    if (!f) return;
    const depth = f.depthById.get(issue.id) ?? 0;
    const height = f.heightById.get(issue.id) ?? 0;
    if (depth + 1 + height > MAX_TASK_DEPTH) return;
    const effParent = issue.parent_id && f.byId.has(issue.parent_id) ? issue.parent_id : null;
    const siblingsRaw = effParent
      ? (f.childrenByParent.get(effParent) ?? [])
      : f.allEntries.filter((e) => e.depth === 0 && (e.issue.project_id ?? null) === (issue.project_id ?? null)).map((e) => e.issue);
    const siblings = sortIssues(siblingsRaw);
    const idx = siblings.findIndex((i) => i.id === issue.id);
    const prev = idx > 0 ? siblings[idx - 1] : undefined;
    if (!prev) return;
    nestTask(issue.id, prev.id);
  }, [nestTask]);

  const handleTaskEnter = useCallback(
    (issue: TBaseIssue) => {
      const projectId = issue.project_id;
      if (!isOwnList || !projectId) return;
      // Make sure the group is expanded so the new draft line is visible.
      setCollapsedProjectIds((collapsedProjectIds ?? []).filter((id) => id !== projectId));
      // From a subtask, keep the new line at the subtask level (under the same parent). From a
      // top-level task, offer that task as the indent target (Tab to make the new line its child).
      const isChild = !!issue.parent_id && openIds.has(issue.parent_id);
      const indentTargetId = isChild ? issue.parent_id! : issue.id;
      setDraft({ projectId, indentTargetId, defaultIndented: isChild });
    },
    [isOwnList, collapsedProjectIds, setCollapsedProjectIds, openIds]
  );

  const rowOps: TaskRowOps = useMemo(
    () => ({
      isOwnList,
      todayStart,
      getLabelById: (id) => labelById.get(id),
      onComplete: handleComplete,
      onSave: updateTask,
      onEnter: handleTaskEnter,
      onIndent: indentTask,
      onOutdent: outdentTask,
      onNest: nestTask,
    }),
    [isOwnList, todayStart, labelById, handleComplete, updateTask, handleTaskEnter, indentTask, outdentTask, nestTask]
  );

  const renderRow = (entry: ForestEntry, showProject: boolean) => (
    <TaskRow
      key={entry.issue.id}
      issue={entry.issue}
      isChecked={checkingIds.has(entry.issue.id)}
      showProject={showProject}
      projectName={getProjectById(entry.issue.project_id)?.name}
      depth={entry.depth}
      height={entry.height}
      ancestorIds={entry.ancestorIds}
      enableDrag={isOwnList && groupByProject}
      shouldFocus={focusTaskId === entry.issue.id}
      onFocused={() => setFocusTaskId(null)}
      ops={rowOps}
    />
  );

  // Partition the tasks into per-project groups, ordered by project name A→Z.
  const projectGroups = groupByProject
    ? (() => {
        const byProject = new Map<string, TBaseIssue[]>();
        for (const issue of tasks) {
          const key = issue.project_id ?? "__none__";
          const bucket = byProject.get(key);
          if (bucket) bucket.push(issue);
          else byProject.set(key, [issue]);
        }
        return [...byProject.entries()]
          .map(([projectId, issues]) => ({
            projectId,
            name: getProjectById(projectId)?.name ?? "Other",
            issues,
          }))
          // Sorting a freshly mapped array — no external mutation.
          // oxlint-disable-next-line unicorn/no-array-sort
          .sort((a, b) => a.name.localeCompare(b.name));
      })()
    : [];

  return (
    <section className="flex flex-col gap-2">
      {!hideHeader && (
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <h3 className="text-14 font-semibold text-secondary">My tasks</h3>
              {tasks.length > 0 && (
                <span className="rounded-full bg-layer-2 px-1.5 py-px text-11 font-medium text-tertiary">
                  {tasks.length}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      <div className={cn(!flat && "rounded-[18px] border border-subtle bg-surface-1")}>
        {isLoading ? (
          <div className="px-3 py-6 text-center text-12 text-placeholder">Loading…</div>
        ) : (
          <>
            {tasks.length === 0
              ? !canAdd && (
                  <div className="px-3 py-8 text-center text-12 text-placeholder">
                    All caught up — nothing on your list.
                  </div>
                )
              : null}
            {tasks.length > 0 &&
              (groupByProject ? (
                <div className="scrollbar-hide max-h-[420px] overflow-y-auto">
                  {projectGroups.map((group) => {
                    const isCollapsed = collapsedSet.has(group.projectId);
                    return (
                      <div key={group.projectId} className="pt-1 first:pt-0">
                        <button
                          type="button"
                          onClick={() => toggleProjectCollapsed(group.projectId)}
                          aria-expanded={!isCollapsed}
                          className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left transition hover:bg-layer-transparent-hover"
                        >
                          <ChevronRight
                            className={cn(
                              "size-3 flex-shrink-0 text-tertiary transition-transform",
                              !isCollapsed && "rotate-90"
                            )}
                          />
                          <span className="truncate text-14 font-semibold text-secondary">{group.name}</span>
                          <span className="rounded-full bg-layer-2 px-1.5 py-px text-11 font-medium text-tertiary">
                            {group.issues.length}
                          </span>
                        </button>
                        {!isCollapsed && (
                          <ul className="pb-1">
                            {(forest.entriesByProject.get(group.projectId) ?? []).map((entry) =>
                              renderRow(entry, false)
                            )}
                            {draft?.projectId === group.projectId && (
                              <TaskQuickAdd
                                slug={slug ?? ""}
                                projectId={group.projectId}
                                indentTargetId={draft.indentTargetId}
                                defaultIndented={draft.defaultIndented}
                                focusOnMount
                                onCreate={createTask}
                                onClose={() => setDraft(null)}
                              />
                            )}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <ul className="scrollbar-hide max-h-[420px] overflow-y-auto">
                  {forest.allEntries.map((entry) => renderRow(entry, true))}
                  {draft && (
                    <TaskQuickAdd
                      slug={slug ?? ""}
                      projectId={draft.projectId}
                      indentTargetId={draft.indentTargetId}
                      defaultIndented={draft.defaultIndented}
                      focusOnMount
                      onCreate={createTask}
                      onClose={() => setDraft(null)}
                    />
                  )}
                </ul>
              ))}
            {canAdd && resolvedAddProjectId && (
              <div className={cn(!flat && tasks.length > 0 && "border-t border-subtle")}>
                <ul>
                  <TaskQuickAdd
                    slug={slug ?? ""}
                    projectId={resolvedAddProjectId}
                    persistent
                    projectSelectable={joinedProjectIds.length > 1}
                    onSelectProject={(id) => setAddProjectId(id)}
                    onCreate={createTask}
                    onCreated={(created) => {
                      const id = (created as TBaseIssue | null)?.id;
                      if (id) setFocusTaskId(id);
                    }}
                  />
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
});

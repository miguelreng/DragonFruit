/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IState, TBaseIssue, TIssue } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { Collapse } from "@/components/common/collapse";
import {
  buildForest,
  sortIssues,
  type Forest,
  type ForestEntry,
} from "@/components/home/sections/task-forest";
import { parseQuickInput, randomLabelColor } from "@/components/home/sections/task-parse";
import { TaskQuickAdd } from "@/components/home/sections/task-quick-add";
import { MAX_TASK_DEPTH, TaskRow, type TaskRowOps } from "@/components/home/sections/task-row";
import { ChevronDown, ChevronUp } from "@/components/icons/lucide-shim";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useLabel } from "@/hooks/store/use-label";
import { useProjectState } from "@/hooks/store/use-project-state";
import useLocalStorage from "@/hooks/use-local-storage";
import { useIssuesActions } from "@/hooks/use-issues-actions";

// Statuses shown on the checklist, in board order (full status board incl. Done/Cancelled).
const GROUP_ORDER = ["backlog", "unstarted", "started", "completed", "cancelled"] as const;

/**
 * A whole status group acts as a drop target: dropping a task from another status here moves it
 * to this status. (Same-status drops are handled by the rows themselves, for subtask nesting.)
 */
function StatusDropZone({
  stateId,
  onDropTask,
  children,
}: {
  stateId: string;
  onDropTask: (issueId: string, stateId: string) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => {
        const sd = source.data as { id?: string; statusId?: string | null };
        return !!sd?.id && (sd.statusId ?? null) !== stateId;
      },
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: ({ source }) => {
        setIsOver(false);
        const sd = source.data as { id?: string; statusId?: string | null };
        if (sd?.id && (sd.statusId ?? null) !== stateId) onDropTask(String(sd.id), stateId);
      },
    });
  }, [stateId, onDropTask]);

  return (
    <div ref={ref} className={cn("rounded-lg transition", isOver && "ring-accent-primary/30 bg-accent-primary/5 ring-1")}>
      {children}
    </div>
  );
}

/**
 * The per-project Tasks LIST layout, rendered as the My-tasks-style checklist but grouped by
 * STATUS instead of project. Open statuses only (Backlog/Todo/In Progress); checking a task
 * completes it (moves it to the project's done state) and slides it out with an Undo, exactly
 * like My tasks. Reuses TaskRow / TaskQuickAdd / Collapse / the forest helpers.
 */
export const ProjectChecklist = observer(function ProjectChecklist() {
  const { workspaceSlug: routerSlug, projectId: routerProjectId } = useParams();
  const slug = routerSlug?.toString();
  const projectId = routerProjectId?.toString();

  const { issues, issueMap } = useIssues(EIssuesStoreType.PROJECT);
  const { fetchIssues, createIssue, updateIssue } = useIssuesActions(EIssuesStoreType.PROJECT);
  const { getProjectStates, getStateById } = useProjectState();
  const { getProjectLabels, fetchProjectLabels, createLabel, getWorkspaceLabels, fetchWorkspaceLabels } = useLabel();
  const { setPeekIssue } = useIssueDetail();

  // Load the grouped issues (group_by=state is forced by the layout root) + workspace labels.
  useEffect(() => {
    fetchIssues("init-loader", { canGroup: true, perPageCount: 50 });
  }, [fetchIssues]);
  useEffect(() => {
    if (slug) fetchWorkspaceLabels(slug).catch(() => {});
  }, [slug, fetchWorkspaceLabels]);

  const [draft, setDraft] = useState<{ stateId: string; indentTargetId: string; defaultIndented: boolean } | null>(
    null
  );
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

  const { storedValue: collapsedStateIds, setValue: setCollapsedStateIds } = useLocalStorage<string[]>(
    `project-checklist-collapsed:${projectId ?? "default"}`,
    []
  );
  const collapsedSet = new Set(collapsedStateIds ?? []);
  const toggleStateCollapsed = (stateId: string) => {
    const next = new Set(collapsedSet);
    if (next.has(stateId)) next.delete(stateId);
    else next.add(stateId);
    setCollapsedStateIds([...next]);
  };

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const labelById = useMemo(
    () => new Map((slug ? (getWorkspaceLabels(slug) ?? []) : []).map((label) => [label.id, label])),
    [slug, getWorkspaceLabels]
  );

  // Status groups, in board order, each with its issues resolved from the store.
  // Computed plainly each render: the store is MobX-observable and `observer` re-renders on
  // change, so a useMemo keyed on the store ref would go stale when groupedIssueIds mutates.
  const groupedIssueIds = (issues?.groupedIssueIds ?? {}) as Record<string, string[]>;
  const groups: { state: IState; issues: TBaseIssue[] }[] = projectId
    ? (getProjectStates(projectId) ?? [])
        .filter((s) => (GROUP_ORDER as readonly string[]).includes(s.group))
        // oxlint-disable-next-line unicorn/no-array-sort
        .sort((a, b) => {
          const ga = GROUP_ORDER.indexOf(a.group as (typeof GROUP_ORDER)[number]);
          const gb = GROUP_ORDER.indexOf(b.group as (typeof GROUP_ORDER)[number]);
          return ga !== gb ? ga - gb : (a.order ?? 0) - (b.order ?? 0);
        })
        .map((state) => {
          const ids = groupedIssueIds[state.id] ?? [];
          const groupIssues = ids
            .map((id) => issueMap?.[id] as TBaseIssue | undefined)
            .filter((i): i is TBaseIssue => !!i);
          return { state, issues: groupIssues };
        })
    : [];

  // A forest per status group (subtasks nest within a status), plus a combined lookup the
  // nest/indent/outdent callbacks read so they can stay stable.
  const forestByState = new Map<string, Forest>();
  const combined = {
    byId: new Map<string, TBaseIssue>(),
    depthById: new Map<string, number>(),
    heightById: new Map<string, number>(),
    descendantIdsById: new Map<string, Set<string>>(),
  };
  for (const group of groups) {
    const idSet = new Set(group.issues.map((i) => i.id));
    const forest = buildForest(group.issues, idSet);
    forestByState.set(group.state.id, forest);
    forest.byId.forEach((v, k) => combined.byId.set(k, v));
    forest.depthById.forEach((v, k) => combined.depthById.set(k, v));
    forest.heightById.forEach((v, k) => combined.heightById.set(k, v));
    forest.descendantIdsById.forEach((v, k) => combined.descendantIdsById.set(k, v));
  }

  const combinedRef = useRef(combined);
  combinedRef.current = combined;
  const forestByStateRef = useRef(forestByState);
  forestByStateRef.current = forestByState;

  const resolveLabelIds = useCallback(
    async (names: string[]): Promise<string[]> => {
      if (!slug || !projectId || names.length === 0) return [];
      let labels = getProjectLabels(projectId);
      if (!labels) labels = await fetchProjectLabels(slug, projectId).catch(() => [] as typeof labels);
      const ids = await Promise.all(
        names.map(async (name) => {
          const existing = labels?.find((l) => l.name.toLowerCase() === name.toLowerCase());
          if (existing) return existing.id;
          try {
            const created = await createLabel(slug, projectId, { name, color: randomLabelColor() });
            return created?.id;
          } catch {
            return undefined;
          }
        })
      );
      return ids.filter((id): id is string => !!id);
    },
    [slug, projectId, getProjectLabels, fetchProjectLabels, createLabel]
  );

  // Create a task in a specific status (and optional parent), parsing `#label @date !priority`.
  const createTask = useCallback(
    async (rawText: string, stateId: string, parentId?: string | null): Promise<TIssue | null> => {
      const parsed = parseQuickInput(rawText);
      if (!projectId || !parsed.name) return null;
      try {
        const labelIds = await resolveLabelIds(parsed.labelNames);
        const created = await createIssue?.(projectId, {
          name: parsed.name,
          state_id: stateId,
          ...(parentId ? { parent_id: parentId } : {}),
          ...(parsed.priority ? { priority: parsed.priority } : {}),
          ...(parsed.dueDate ? { target_date: renderFormattedPayloadDate(parsed.dueDate) } : {}),
          ...(labelIds.length > 0 ? { label_ids: labelIds } : {}),
        });
        return (created as TIssue) ?? null;
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't add task", message: "Something went wrong." });
        return null;
      }
    },
    [projectId, createIssue, resolveLabelIds]
  );

  const updateTask = useCallback(
    async (issue: TBaseIssue, rawText: string) => {
      const parsed = parseQuickInput(rawText);
      if (!projectId || !parsed.name) return;
      const labelIds = parsed.labelNames.length > 0 ? await resolveLabelIds(parsed.labelNames) : [];
      const mergedLabels = labelIds.length > 0 ? [...new Set([...(issue.label_ids ?? []), ...labelIds])] : undefined;
      try {
        await updateIssue?.(projectId, issue.id, {
          name: parsed.name,
          ...(parsed.priority ? { priority: parsed.priority } : {}),
          ...(parsed.dueDate ? { target_date: renderFormattedPayloadDate(parsed.dueDate) } : {}),
          ...(mergedLabels ? { label_ids: mergedLabels } : {}),
        });
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't update task", message: "Something went wrong." });
        throw new Error("update failed");
      }
    },
    [projectId, updateIssue, resolveLabelIds]
  );

  // Checkbox toggles completion: open task → the project's completed state (moves to the Done
  // group, checked); a completed task → reopen to the project's default open state.
  const handleToggleComplete = useCallback(
    async (issue: TBaseIssue) => {
      if (!projectId) return;
      const states = getProjectStates(projectId) ?? [];
      const currentGroup = getStateById(issue.state_id)?.group;
      const targetStateId =
        currentGroup === "completed"
          ? (states.find((s) => s.default && s.group !== "completed" && s.group !== "cancelled")?.id ??
            states.find((s) => ["backlog", "unstarted", "started"].includes(s.group))?.id)
          : states.find((s) => s.group === "completed")?.id;
      if (!targetStateId) return;
      try {
        await updateIssue?.(projectId, issue.id, { state_id: targetStateId });
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't update task", message: "Something went wrong." });
      }
    },
    [projectId, getProjectStates, getStateById, updateIssue]
  );

  const nestTask = useCallback(
    async (childId: string, parentId: string) => {
      const c = combinedRef.current;
      const child = c.byId.get(childId);
      if (!projectId || !child || childId === parentId || child.parent_id === parentId) return;
      if (c.descendantIdsById.get(childId)?.has(parentId)) return;
      const newDepth = (c.depthById.get(parentId) ?? 0) + 1;
      const childHeight = c.heightById.get(childId) ?? 0;
      if (newDepth + childHeight > MAX_TASK_DEPTH) return;
      try {
        await updateIssue?.(projectId, childId, { parent_id: parentId });
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't nest task", message: "Something went wrong." });
      }
    },
    [projectId, updateIssue]
  );

  // Drag a task onto a different status group → re-state it (and detach from any parent, since
  // subtasks live within a single status).
  const moveTaskToStatus = useCallback(
    async (issueId: string, stateId: string) => {
      if (!projectId) return;
      try {
        await updateIssue?.(projectId, issueId, { state_id: stateId, parent_id: null });
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't move task", message: "Something went wrong." });
      }
    },
    [projectId, updateIssue]
  );

  const outdentTask = useCallback(
    async (issue: TBaseIssue) => {
      const c = combinedRef.current;
      if (!projectId || !issue.parent_id) return;
      const parent = c.byId.get(issue.parent_id);
      const newParentId = parent?.parent_id && c.byId.has(parent.parent_id) ? parent.parent_id : null;
      try {
        await updateIssue?.(projectId, issue.id, { parent_id: newParentId });
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't outdent task", message: "Something went wrong." });
      }
    },
    [projectId, updateIssue]
  );

  const indentTask = useCallback(
    (issue: TBaseIssue) => {
      const c = combinedRef.current;
      const stateId = issue.state_id;
      if (!stateId) return;
      const forest = forestByStateRef.current.get(stateId);
      if (!forest) return;
      const depth = c.depthById.get(issue.id) ?? 0;
      const height = c.heightById.get(issue.id) ?? 0;
      if (depth + 1 + height > MAX_TASK_DEPTH) return;
      const effParent = issue.parent_id && c.byId.has(issue.parent_id) ? issue.parent_id : null;
      const siblingsRaw = effParent
        ? (forest.childrenByParent.get(effParent) ?? [])
        : forest.allEntries.filter((e) => e.depth === 0).map((e) => e.issue);
      const siblings = sortIssues(siblingsRaw);
      const idx = siblings.findIndex((i) => i.id === issue.id);
      const prev = idx > 0 ? siblings[idx - 1] : undefined;
      if (!prev) return;
      nestTask(issue.id, prev.id);
    },
    [nestTask]
  );

  const handleTaskEnter = useCallback(
    (issue: TBaseIssue) => {
      const stateId = issue.state_id;
      if (!stateId) return;
      setCollapsedStateIds((collapsedStateIds ?? []).filter((id) => id !== stateId));
      const c = combinedRef.current;
      const isChild = !!issue.parent_id && c.byId.has(issue.parent_id);
      const indentTargetId = isChild ? issue.parent_id! : issue.id;
      setDraft({ stateId, indentTargetId, defaultIndented: isChild });
    },
    [collapsedStateIds, setCollapsedStateIds]
  );

  // Open the task's detail peek overview (the project layout root mounts IssuePeekOverview).
  const onOpenDetail = useCallback(
    (issue: TBaseIssue) => {
      if (!slug || !issue.project_id) return;
      setPeekIssue({ workspaceSlug: slug, projectId: issue.project_id, issueId: issue.id });
    },
    [slug, setPeekIssue]
  );

  const rowOps: TaskRowOps = useMemo(
    () => ({
      isOwnList: true,
      todayStart,
      getLabelById: (id) => labelById.get(id),
      onComplete: handleToggleComplete,
      onSave: updateTask,
      onEnter: handleTaskEnter,
      onIndent: indentTask,
      onOutdent: outdentTask,
      onNest: nestTask,
      onOpenDetail,
      // No onFilterLabel: project labels filter via the rich-filter system, not here.
    }),
    [
      todayStart,
      labelById,
      handleToggleComplete,
      updateTask,
      handleTaskEnter,
      indentTask,
      outdentTask,
      nestTask,
      onOpenDetail,
    ]
  );

  const isLoading = issues?.getIssueLoader?.() === "init-loader" && groups.every((g) => g.issues.length === 0);
  const totalTasks = groups.reduce((sum, g) => sum + g.issues.length, 0);

  return (
    <div className="w-full max-w-xl px-4 pb-4 pt-1">
      {isLoading ? (
        <div className="px-3 py-6 text-center text-12 text-placeholder">Loading…</div>
      ) : totalTasks === 0 && !draft ? (
        <div className="px-3 py-8 text-center text-12 text-placeholder">No tasks yet.</div>
      ) : (
        groups.map((group) => {
          const isCollapsed = collapsedSet.has(group.state.id);
          const entries = forestByState.get(group.state.id)?.allEntries ?? [];
          return (
            <div key={group.state.id}>
              <StatusDropZone stateId={group.state.id} onDropTask={moveTaskToStatus}>
              <button
                type="button"
                onClick={() => toggleStateCollapsed(group.state.id)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1 text-left transition hover:bg-layer-transparent-hover"
              >
                {isCollapsed ? (
                  <ChevronUp className="size-3 flex-shrink-0 text-tertiary" weight="Bold" />
                ) : (
                  <ChevronDown className="size-3 flex-shrink-0 text-tertiary" weight="Bold" />
                )}
                <span
                  className="size-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: group.state.color || undefined }}
                />
                <span className="truncate text-14 font-semibold text-secondary">{group.state.name}</span>
                <span className="rounded-full bg-layer-1 px-1.5 py-px text-11 font-medium text-tertiary">
                  {group.issues.length}
                </span>
              </button>
              <Collapse open={!isCollapsed}>
                <ul>
                  {entries.map((entry: ForestEntry) => (
                    <TaskRow
                      key={entry.issue.id}
                      issue={entry.issue}
                      isChecked={group.state.group === "completed"}
                      showProject={false}
                      depth={entry.depth}
                      height={entry.height}
                      ancestorIds={entry.ancestorIds}
                      statusId={group.state.id}
                      enableDrag
                      shouldFocus={focusTaskId === entry.issue.id}
                      onFocused={() => setFocusTaskId(null)}
                      ops={rowOps}
                    />
                  ))}
                  {draft?.stateId === group.state.id && (
                    <TaskQuickAdd
                      slug={slug ?? ""}
                      projectId={projectId ?? ""}
                      indentTargetId={draft.indentTargetId}
                      defaultIndented={draft.defaultIndented}
                      hideProjectToken
                      focusOnMount
                      onCreate={(text, opts) => createTask(text, group.state.id, opts.parentId)}
                      onClose={() => setDraft(null)}
                    />
                  )}
                  {/* Per-status add row — only visible while the group is expanded. */}
                  <TaskQuickAdd
                    slug={slug ?? ""}
                    projectId={projectId ?? ""}
                    onCreate={(text) => createTask(text, group.state.id)}
                    onCreated={(created) => {
                      const id = (created as TIssue | null)?.id;
                      if (id) setFocusTaskId(id);
                    }}
                    hideProjectToken
                    persistent
                  />
                </ul>
              </Collapse>
              </StatusDropZone>
            </div>
          );
        })
      )}
    </div>
  );
});

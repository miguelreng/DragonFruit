/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { YourWorkIcon } from "@plane/propel/icons";
import type { TBaseIssue, TIssuePriorities, TIssuesResponse } from "@plane/types";
import { cn, createIssuePayload, getDate, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
import { Check, ChevronRight, Loader, Plus } from "@/components/icons/lucide-shim";
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
import { useUser } from "@/hooks/store/user";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { IssueService } from "@/services/issue";
import { isOpenIssue, useMyTasksData } from "./use-my-tasks";

// How long the row stays visibly "checked" before it animates out of the list.
const COMPLETE_ANIMATION_MS = 320;

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

// --- Inline natural-language parsing (Todoist/Things-style) -----------------
// `#label` → labels, `@date` → due date, `*priority` → priority.
const LABEL_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];
const randomLabelColor = () => LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)];

const PRIORITY_TOKENS: Record<string, TIssuePriorities> = {
  urgent: "urgent", u: "urgent", p1: "urgent",
  high: "high", h: "high", p2: "high",
  medium: "medium", med: "medium", m: "medium", p3: "medium",
  low: "low", l: "low", p4: "low",
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

/** Resolve an `@date` token (today/tomorrow/eod/eow/weekday/`3d`/`2w`/ISO/`M/D`) to a Date. */
function parseDueToken(token: string): Date | undefined {
  const t = token.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };
  if (t === "today" || t === "tod" || t === "eod") return today;
  if (t === "tomorrow" || t === "tom" || t === "tmr") return addDays(1);
  // End of week → this week's upcoming Friday (or today if it's Friday).
  if (t === "eow") return addDays((5 - today.getDay() + 7) % 7);
  if (t in WEEKDAYS) return addDays((WEEKDAYS[t] - today.getDay() + 7) % 7 || 7);
  const rel = /^(\d+)([dw])$/.exec(t);
  if (rel) return addDays(rel[2] === "w" ? parseInt(rel[1], 10) * 7 : parseInt(rel[1], 10));
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const md = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (md) {
    const month = Number(md[1]) - 1;
    const day = Number(md[2]);
    let d = new Date(today.getFullYear(), month, day);
    if (Number.isNaN(d.getTime())) return undefined;
    if (d < today) d = new Date(today.getFullYear() + 1, month, day);
    return d;
  }
  return undefined;
}

type ParsedQuickInput = {
  name: string;
  labelNames: string[];
  priority?: TIssuePriorities;
  dueDate?: Date;
};

/** Strip recognized `#`/`@`/`*` tokens out of the title and return the rest. */
function parseQuickInput(raw: string): ParsedQuickInput {
  const labelNames: string[] = [];
  let priority: TIssuePriorities | undefined;
  let dueDate: Date | undefined;
  const kept: string[] = [];
  const parts = raw.split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^#[A-Za-z][\w-]*$/.test(part)) {
      labelNames.push(part.slice(1));
      continue;
    }
    if (part.length > 1 && part.startsWith("@")) {
      const head = part.slice(1).toLowerCase();
      // Multi-word: "@next monday" / "@this fri" consumes the following token.
      if ((head === "next" || head === "this") && i + 1 < parts.length) {
        const parsed = parseDueToken(parts[i + 1]);
        if (parsed) {
          dueDate = parsed;
          i += 1;
          continue;
        }
      }
      const parsed = parseDueToken(head);
      if (parsed) {
        dueDate = parsed;
        continue;
      }
    }
    if (part.startsWith("*")) {
      // Bare asterisks: "*" → high, "**"+ → urgent. Or "*high" / "*p2" keywords.
      if (/^\*+$/.test(part)) {
        priority = part.length >= 2 ? "urgent" : "high";
        continue;
      }
      const parsed = PRIORITY_TOKENS[part.slice(1).toLowerCase()];
      if (parsed) {
        priority = parsed;
        continue;
      }
    }
    kept.push(part);
  }
  return { name: kept.join(" ").replace(/\s+/g, " ").trim(), labelNames, priority, dueDate };
}

const issueService = new IssueService();

type MyTasksSectionProps = {
  /** Whose tasks to show. Defaults to the signed-in user (home usage). */
  userId?: string;
  /**
   * "View all" link target. Omit for the default (the user's profile);
   * pass `null` to hide the link entirely.
   */
  viewAllHref?: string | null;
  /** Hide the widget's "My tasks" title + icon + count (profile page uses the page title instead). */
  hideHeader?: boolean;
};

export const MyTasksSection = observer(function MyTasksSection({
  userId: userIdProp,
  viewAllHref,
  hideHeader = false,
}: MyTasksSectionProps = {}) {
  const { workspaceSlug } = useParams();
  const { data: currentUser } = useUser();
  const { getStateById, getProjectStates, fetchWorkspaceStates, fetchProjectStates } = useProjectState();
  const { getProjectById, getProjectIdentifierById, joinedProjectIds } = useProject();
  const { getProjectLabels, fetchProjectLabels, createLabel, getWorkspaceLabels, fetchWorkspaceLabels } = useLabel();

  const slug = workspaceSlug?.toString();
  const userId = userIdProp ?? currentUser?.id;
  const resolvedViewAllHref =
    viewAllHref === undefined ? (userId ? `/${slug}/profile/${userId}` : null) : viewAllHref;

  // Inline create (Reminders-style): only on your own list, and only if there's
  // a project to drop the new task into.
  const isOwnList = !!currentUser?.id && userId === currentUser.id;
  const [newTaskName, setNewTaskName] = useState("");
  const [addProjectId, setAddProjectId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const newTaskInputRef = useRef<HTMLInputElement>(null);
  const resolvedAddProjectId = addProjectId ?? joinedProjectIds[0] ?? null;
  const canAdd = isOwnList && !!resolvedAddProjectId;

  // `checking` → row is mid-completion (shows the filled check + strike-through).
  // `completed` → completion confirmed, row is removed from the list.
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

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
  const labelById = new Map((slug ? (getWorkspaceLabels(slug) ?? []) : []).map((label) => [label.id, label]));

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

  const handleComplete = useCallback(
    async (issue: TBaseIssue) => {
      const projectId = issue.project_id;
      if (!slug || !projectId || checkingIds.has(issue.id) || completedIds.has(issue.id)) return;

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
    [slug, checkingIds, completedIds, resolveCompletedStateId, mutate]
  );

  // Resolve `#label` names to label ids in the target project, creating any
  // that don't exist yet (case-insensitive match).
  const resolveLabelIds = useCallback(
    async (projectId: string, names: string[]): Promise<string[]> => {
      if (!slug || names.length === 0) return [];
      let labels = getProjectLabels(projectId);
      if (!labels) labels = await fetchProjectLabels(slug, projectId).catch(() => [] as typeof labels);
      const ids: string[] = [];
      for (const name of names) {
        const existing = labels?.find((label) => label.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          ids.push(existing.id);
          continue;
        }
        try {
          const created = await createLabel(slug, projectId, { name, color: randomLabelColor() });
          if (created?.id) ids.push(created.id);
        } catch {
          // Skip a label we couldn't create rather than failing the whole task.
        }
      }
      return ids;
    },
    [slug, getProjectLabels, fetchProjectLabels, createLabel]
  );

  const handleCreate = useCallback(async () => {
    const parsed = parseQuickInput(newTaskName);
    if (!slug || !resolvedAddProjectId || !parsed.name || isCreating) return;
    setIsCreating(true);
    try {
      const labelIds = await resolveLabelIds(resolvedAddProjectId, parsed.labelNames);
      const payload = createIssuePayload(resolvedAddProjectId, {
        name: parsed.name,
        assignee_ids: userId ? [userId] : [],
        ...(parsed.priority ? { priority: parsed.priority } : {}),
        ...(parsed.dueDate ? { target_date: renderFormattedPayloadDate(parsed.dueDate) } : {}),
        ...(labelIds.length > 0 ? { label_ids: labelIds } : {}),
      });
      const created = await issueService.createIssue(slug, resolvedAddProjectId, payload);
      // Optimistically surface the new task without a full refetch.
      mutate((prev) => {
        const results = Array.isArray(prev?.results) ? (prev!.results as TBaseIssue[]) : [];
        return {
          ...prev,
          results: [created as TBaseIssue, ...results],
          total_count: ((prev?.total_count as number | undefined) ?? 0) + 1,
        } as TIssuesResponse;
      }, { revalidate: false });
      // Clear and keep focus for rapid continuous entry, like Reminders.
      setNewTaskName("");
      newTaskInputRef.current?.focus();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't add task",
        message: "Something went wrong. Please try again.",
      });
    } finally {
      setIsCreating(false);
    }
  }, [slug, resolvedAddProjectId, newTaskName, isCreating, userId, mutate, resolveLabelIds]);

  const allIssues: TBaseIssue[] = Array.isArray(data?.results) ? (data!.results as TBaseIssue[]) : [];

  // Only open work belongs on a todo list — drop anything done or cancelled.
  const openIssues = allIssues.filter((issue) => !completedIds.has(issue.id) && isOpenIssue(issue, getStateById));

  // Soonest due first, then by priority — mirrors how Reminders surfaces what's urgent.
  // Copy before sorting (toSorted needs es2023 lib, which this project's tsc target predates).
  const tasks = [...openIssues].sort((a, b) => {
    const aDue = a.target_date ? (getDate(a.target_date)?.getTime() ?? Infinity) : Infinity;
    const bDue = b.target_date ? (getDate(b.target_date)?.getTime() ?? Infinity) : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    const aRank = PRIORITY_RANK[a.priority ?? "none"] ?? 4;
    const bRank = PRIORITY_RANK[b.priority ?? "none"] ?? 4;
    return aRank - bRank;
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Live preview of what the inline tokens in the add input will resolve to.
  const inputPreview = parseQuickInput(newTaskName);
  const hasInputPreview =
    !!inputPreview.dueDate || !!inputPreview.priority || inputPreview.labelNames.length > 0;

  return (
    <section className="flex flex-col gap-2">
      {(!hideHeader || resolvedViewAllHref) && (
        <div className="flex items-center justify-between px-2">
          {hideHeader ? (
            <span />
          ) : (
            <div className="flex items-center gap-2">
              <YourWorkIcon className="size-4 text-tertiary" />
              <h3 className="text-14 font-semibold text-secondary">My tasks</h3>
              {tasks.length > 0 && (
                <span className="rounded-full bg-layer-2 px-1.5 py-px text-11 font-medium text-tertiary">
                  {tasks.length}
                </span>
              )}
            </div>
          )}
          {resolvedViewAllHref && (
            <Link
              href={resolvedViewAllHref}
              className="flex items-center gap-1 text-12 font-medium text-tertiary hover:text-secondary"
            >
              View all
              <ChevronRight className="size-3" />
            </Link>
          )}
        </div>
      )}
      <div className="rounded-[18px] border border-subtle bg-surface-1">
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
            {tasks.length > 0 && (
          <ul className="scrollbar-hide max-h-[420px] divide-y divide-subtle overflow-y-auto">
            {tasks.map((issue) => {
              const isChecked = checkingIds.has(issue.id);
              const project = getProjectById(issue.project_id);
              const projectIdentifier = getProjectIdentifierById(issue.project_id) ?? "";
              const href = `/${slug}/browse/${projectIdentifier}-${issue.sequence_id}/`;
              const dueDate = getDate(issue.target_date);
              const dueLabel = issue.target_date ? renderFormattedDate(issue.target_date, "MMM d") : undefined;
              const isOverdue = !!dueDate && dueDate < todayStart;
              const priority = (issue.priority ?? "none") as TIssuePriorities | "none";
              const hasPriority = priority !== "none";
              const labels = (issue.label_ids ?? []).map((id) => labelById.get(id)).filter(Boolean);
              const hasAttributes = !!dueLabel || hasPriority || labels.length > 0;
              const hasSubtitle = !!project?.name || hasAttributes;

              return (
                <li key={issue.id}>
                  <div
                    className={cn(
                      "group flex items-start gap-3 px-3 py-2.5 transition-opacity hover:bg-layer-transparent-hover",
                      isChecked && "opacity-60"
                    )}
                  >
                    <button
                      type="button"
                      aria-label="Mark task complete"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleComplete(issue);
                      }}
                      className={cn(
                        "mt-0.5 flex size-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
                        isChecked
                          ? "border-accent-primary bg-accent-primary text-white"
                          : "border-strong text-transparent hover:border-accent-primary"
                      )}
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </button>
                    <Link href={href} className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          "truncate text-13 text-secondary",
                          isChecked && "text-placeholder line-through"
                        )}
                      >
                        {issue.name}
                      </span>
                      {hasSubtitle && (
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-11 text-placeholder">
                          {project?.name && <span className="truncate">{project.name}</span>}
                          {project?.name && hasAttributes && <span aria-hidden>·</span>}
                          {hasAttributes && (
                            <span className="font-newsreader flex flex-wrap items-center gap-1.5 text-12 text-accent-primary">
                              {dueLabel && (
                                <span className={cn("flex-shrink-0", isOverdue && "text-danger-primary")}>
                                  {dueLabel}
                                </span>
                              )}
                              {hasPriority && <span className="flex-shrink-0 capitalize">{priority}</span>}
                              {labels.map((label) => (
                                <span key={label!.id} className="flex-shrink-0">
                                  #{label!.name}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                      )}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
            )}
            {canAdd && (
              <div className={cn("px-3 py-2.5", tasks.length > 0 && "border-t border-subtle")}>
                <div className="flex items-center gap-3">
                  <span className="flex size-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-strong text-tertiary">
                    <Plus className="size-3" />
                  </span>
                  <input
                    ref={newTaskInputRef}
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreate();
                      } else if (e.key === "Escape") {
                        setNewTaskName("");
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder="Add a task —  #label  @date  *priority"
                    className="min-w-0 flex-1 bg-transparent text-13 text-secondary outline-none placeholder:text-placeholder"
                  />
                  {isCreating && <Loader className="size-3.5 flex-shrink-0 animate-spin text-placeholder" />}
                  {joinedProjectIds.length > 1 && resolvedAddProjectId && (
                    <div className="flex-shrink-0">
                      <ProjectDropdown
                        value={resolvedAddProjectId}
                        onChange={(id) => setAddProjectId(id)}
                        multiple={false}
                        buttonVariant="transparent-with-text"
                        buttonClassName="text-11 text-tertiary"
                        dropdownArrow={false}
                      />
                    </div>
                  )}
                </div>
                {hasInputPreview && (
                  <div className="font-newsreader mt-1.5 flex flex-wrap items-center gap-2 pl-[30px] text-12 text-accent-primary">
                    {inputPreview.dueDate && <span>{renderFormattedDate(inputPreview.dueDate, "MMM d")}</span>}
                    {inputPreview.priority && <span className="capitalize">{inputPreview.priority}</span>}
                    {inputPreview.labelNames.map((labelName) => (
                      <span key={labelName}>#{labelName}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
});

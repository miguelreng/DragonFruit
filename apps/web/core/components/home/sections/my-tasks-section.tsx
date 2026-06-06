/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { PriorityIcon, YourWorkIcon } from "@plane/propel/icons";
import type { TBaseIssue, TIssuePriorities, TIssuesResponse } from "@plane/types";
import { cn, getDate, renderFormattedDate } from "@plane/utils";
import { Check, ChevronRight } from "@/components/icons/lucide-shim";
import { useUser } from "@/hooks/store/user";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { IssueService } from "@/services/issue";
import { UserService } from "@/services/user.service";

// Pull a generous page so the widget is a true aggregate of everything on the
// user's plate across projects — not just a teaser.
const PAGE_SIZE = 50;
// How long the row stays visibly "checked" before it animates out of the list.
const COMPLETE_ANIMATION_MS = 320;

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

const userService = new UserService();
const issueService = new IssueService();

type MyTasksSectionProps = {
  /** Whose tasks to show. Defaults to the signed-in user (home usage). */
  userId?: string;
  /**
   * "View all" link target. Omit for the default (the user's profile);
   * pass `null` to hide the link entirely.
   */
  viewAllHref?: string | null;
};

export const MyTasksSection = observer(function MyTasksSection({
  userId: userIdProp,
  viewAllHref,
}: MyTasksSectionProps = {}) {
  const { workspaceSlug } = useParams();
  const { data: currentUser } = useUser();
  const { getStateById, getProjectStates, fetchWorkspaceStates, fetchProjectStates } = useProjectState();
  const { getProjectById, getProjectIdentifierById } = useProject();

  const slug = workspaceSlug?.toString();
  const userId = userIdProp ?? currentUser?.id;
  const resolvedViewAllHref =
    viewAllHref === undefined ? (userId ? `/${slug}/profile/${userId}` : null) : viewAllHref;

  // `checking` → row is mid-completion (shows the filled check + strike-through).
  // `completed` → completion confirmed, row is removed from the list.
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const { data, isLoading, mutate } = useSWR<TIssuesResponse | null>(
    slug && userId ? `HOME_MY_TASKS_${slug}_${userId}` : null,
    slug && userId
      ? () =>
          userService.getUserProfileIssues(slug, userId, {
            assignees: userId,
            per_page: PAGE_SIZE,
          })
      : null,
    { revalidateOnFocus: false }
  );

  // Load every project's states up front so we can both classify each task's
  // state group and resolve the project's "done" state when completing.
  useEffect(() => {
    if (slug) fetchWorkspaceStates(slug).catch(() => {});
  }, [slug, fetchWorkspaceStates]);

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

  const allIssues: TBaseIssue[] = Array.isArray(data?.results) ? (data!.results as TBaseIssue[]) : [];

  // Only open work belongs on a todo list — drop anything done or cancelled.
  const openIssues = allIssues.filter((issue) => {
    if (completedIds.has(issue.id)) return false;
    if (issue.completed_at) return false;
    const group = issue.state_id ? getStateById(issue.state_id)?.group : undefined;
    return group !== "completed" && group !== "cancelled";
  });

  // Soonest due first, then by priority — mirrors how Reminders surfaces what's urgent.
  const tasks = openIssues.toSorted((a, b) => {
    const aDue = a.target_date ? (getDate(a.target_date)?.getTime() ?? Infinity) : Infinity;
    const bDue = b.target_date ? (getDate(b.target_date)?.getTime() ?? Infinity) : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    const aRank = PRIORITY_RANK[a.priority ?? "none"] ?? 4;
    const bRank = PRIORITY_RANK[b.priority ?? "none"] ?? 4;
    return aRank - bRank;
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <YourWorkIcon className="size-4 text-tertiary" />
          <h3 className="text-14 font-semibold text-secondary">My tasks</h3>
          {tasks.length > 0 && (
            <span className="rounded-full bg-layer-2 px-1.5 py-px text-11 font-medium text-tertiary">
              {tasks.length}
            </span>
          )}
        </div>
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
      <div className="rounded-[18px] border border-subtle bg-surface-1">
        {isLoading ? (
          <div className="px-3 py-6 text-center text-12 text-placeholder">Loading…</div>
        ) : tasks.length === 0 ? (
          <div className="px-3 py-8 text-center text-12 text-placeholder">All caught up — nothing on your list.</div>
        ) : (
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
              const showPriority = priority === "urgent" || priority === "high";

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
                      {(project?.name || dueLabel) && (
                        <span className="mt-0.5 flex items-center gap-1.5 text-11 text-placeholder">
                          {project?.name && <span className="truncate">{project.name}</span>}
                          {project?.name && dueLabel && <span aria-hidden>·</span>}
                          {dueLabel && (
                            <span className={cn("flex-shrink-0", isOverdue && "text-danger-primary")}>{dueLabel}</span>
                          )}
                        </span>
                      )}
                    </Link>
                    {showPriority && (
                      <PriorityIcon priority={issue.priority} withContainer size={12} className="mt-0.5" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
});

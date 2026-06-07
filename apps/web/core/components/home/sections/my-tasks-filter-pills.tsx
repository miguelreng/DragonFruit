/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "react-router";
import type { TBaseIssue } from "@plane/types";
import { cn } from "@plane/utils";
import { useLabel } from "@/hooks/store/use-label";
import { useProjectState } from "@/hooks/store/use-project-state";
import { isOpenIssue, useMyTasksData } from "./use-my-tasks";

type Props = {
  slug: string | undefined;
  userId: string | undefined;
  className?: string;
};

/**
 * Filter pills for the My tasks list — one pill per label the user has tagged
 * their open tasks with (plus "All"). The selected pill drives `?label=<id>`,
 * which `MyTasksSection` reads to filter the list. Reads the same SWR cache as
 * the list, so it adds no extra request.
 */
export const MyTasksFilterPills = observer(function MyTasksFilterPills({ slug, userId, className }: Props) {
  const { getStateById } = useProjectState();
  const { getWorkspaceLabels, fetchWorkspaceLabels } = useLabel();
  const { data: myTasks } = useMyTasksData(slug, userId);

  // Load workspace labels so the pills can show label names + colors.
  useEffect(() => {
    if (slug) fetchWorkspaceLabels(slug).catch(() => {});
  }, [slug, fetchWorkspaceLabels]);

  const openTasks = (Array.isArray(myTasks?.results) ? (myTasks!.results as TBaseIssue[]) : []).filter((issue) =>
    isOpenIssue(issue, getStateById)
  );

  const labelById = new Map((slug ? (getWorkspaceLabels(slug) ?? []) : []).map((label) => [label.id, label]));

  // Count how many open tasks carry each label, then surface them (most-used first).
  const labelCounts = new Map<string, number>();
  openTasks.forEach((issue) =>
    (issue.label_ids ?? []).forEach((id) => labelCounts.set(id, (labelCounts.get(id) ?? 0) + 1))
  );
  const usedLabels = Array.from(labelCounts.entries())
    .map(([id, count]) => ({ id, count, label: labelById.get(id) }))
    .filter((entry) => !!entry.label)
    .sort((a, b) => b.count - a.count);

  const [searchParams, setSearchParams] = useSearchParams();
  const activeLabel = searchParams.get("label");
  const setLabelFilter = (labelId: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (labelId) next.set("label", labelId);
        else next.delete("label");
        return next;
      },
      { replace: true }
    );
  };

  if (usedLabels.length === 0) return null;

  const pillBase = "rounded-full px-2.5 py-0.5 text-12 font-medium transition-colors";
  const pillActive = "bg-accent-subtle text-accent-primary";
  const pillInactive = "bg-layer-1 text-tertiary hover:text-secondary";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => setLabelFilter(null)}
        className={cn(pillBase, !activeLabel ? pillActive : pillInactive)}
      >
        All
      </button>
      {usedLabels.map(({ id, count, label }) => {
        const isActive = activeLabel === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setLabelFilter(isActive ? null : id)}
            className={cn("flex items-center gap-1", pillBase, isActive ? pillActive : pillInactive)}
          >
            {label!.name}
            <span className={cn("text-11", isActive ? "text-tertiary" : "text-placeholder")}>{count}</span>
          </button>
        );
      })}
    </div>
  );
});

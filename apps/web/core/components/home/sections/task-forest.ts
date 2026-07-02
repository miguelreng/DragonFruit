/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TBaseIssue } from "@plane/types";
import { getDate } from "@plane/utils";

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

/** Soonest due first, then by priority — mirrors how Reminders surfaces what's urgent. */
export function sortIssues(issues: TBaseIssue[]): TBaseIssue[] {
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

/** Manual drag order: ascending `sort_order`, falling back to the urgency sort for ties. */
export function sortIssuesManual(issues: TBaseIssue[]): TBaseIssue[] {
  // oxlint-disable-next-line unicorn/no-array-sort
  return [...issues].sort((a, b) => {
    const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aDue = a.target_date ? (getDate(a.target_date)?.getTime() ?? Infinity) : Infinity;
    const bDue = b.target_date ? (getDate(b.target_date)?.getTime() ?? Infinity) : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    return (PRIORITY_RANK[a.priority ?? "none"] ?? 4) - (PRIORITY_RANK[b.priority ?? "none"] ?? 4);
  });
}

export type ForestEntry = { issue: TBaseIssue; depth: number; height: number; ancestorIds: string[] };

export type Forest = {
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
 * Turn a flat issue list into a parent→child forest. A task is a root when it has no parent (or
 * its parent isn't in `openIds`). Each entry carries its depth, the height of its own subtree, and
 * its ancestor chain. Children stay sorted by due → priority within a parent.
 */
export function buildForest(issues: TBaseIssue[], openIds: Set<string>, manualOrder = false): Forest {
  const sort = manualOrder ? sortIssuesManual : sortIssues;
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

  const visit = (
    issue: TBaseIssue,
    depth: number,
    ancestorIds: string[]
  ): { height: number; descendants: Set<string> } => {
    depthById.set(issue.id, depth);
    const entry: ForestEntry = { issue, depth, height: 0, ancestorIds };
    pushEntry(entry);
    const kids = sort(childrenByParent.get(issue.id) ?? []);
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

  for (const root of sort(roots)) visit(root, 0, []);

  return { entriesByProject, allEntries, byId, depthById, heightById, descendantIdsById, childrenByParent };
}

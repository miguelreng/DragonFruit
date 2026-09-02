/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import type { IState, TBaseIssue, TIssuesResponse } from "@plane/types";
import { UserService } from "@/services/user.service";

export const MY_TASKS_PAGE_SIZE = 100;
/** Safety stop so a very large assignee list can't fan out into unbounded requests. */
const MY_TASKS_MAX_PAGES = 10;
/** Only open work belongs on a todo list — let the server drop done/cancelled. */
const OPEN_STATE_GROUPS = "backlog,unstarted,started";

const userService = new UserService();

/**
 * Walk every page of the user's open assigned work. The endpoint is offset
 * paginated, so a single request would silently truncate the list — tasks in
 * quieter projects fell off the end and looked like they were missing.
 */
async function fetchMyTasks(slug: string, userId: string): Promise<TIssuesResponse | null> {
  const results: TBaseIssue[] = [];
  let page: TIssuesResponse | null = null;
  let cursor: string | undefined;

  for (let i = 0; i < MY_TASKS_MAX_PAGES; i++) {
    // Sequential by necessity — each request needs the previous page's cursor.
    // oxlint-disable-next-line no-await-in-loop
    page = await userService.getUserProfileIssues(slug, userId, {
      assignees: userId,
      state_group: OPEN_STATE_GROUPS,
      per_page: MY_TASKS_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    if (!page) break;
    if (Array.isArray(page.results)) results.push(...(page.results as TBaseIssue[]));
    if (!page.next_page_results || !page.next_cursor) break;
    cursor = page.next_cursor;
  }

  return page ? { ...page, results } : null;
}

/**
 * Shared SWR for a user's assigned work items. Keyed so the home widget and
 * the profile page header read the same cache (no duplicate request).
 */
export function useMyTasksData(slug: string | undefined, userId: string | undefined) {
  return useSWR<TIssuesResponse | null>(
    slug && userId ? `HOME_MY_TASKS_${slug}_${userId}` : null,
    slug && userId ? () => fetchMyTasks(slug, userId) : null,
    { revalidateOnFocus: false }
  );
}

/** A task belongs on the todo list when it isn't done or cancelled. */
export function isOpenIssue(issue: TBaseIssue, getStateById: (id: string | null | undefined) => IState | undefined) {
  if (issue.completed_at) return false;
  const group = issue.state_id ? getStateById(issue.state_id)?.group : undefined;
  return group !== "completed" && group !== "cancelled";
}

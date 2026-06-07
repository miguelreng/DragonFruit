/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import type { IState, TBaseIssue, TIssuesResponse } from "@plane/types";
import { UserService } from "@/services/user.service";

export const MY_TASKS_PAGE_SIZE = 50;

const userService = new UserService();

/**
 * Shared SWR for a user's assigned work items. Keyed so the home widget and
 * the profile page header read the same cache (no duplicate request).
 */
export function useMyTasksData(slug: string | undefined, userId: string | undefined) {
  return useSWR<TIssuesResponse | null>(
    slug && userId ? `HOME_MY_TASKS_${slug}_${userId}` : null,
    slug && userId
      ? () => userService.getUserProfileIssues(slug, userId, { assignees: userId, per_page: MY_TASKS_PAGE_SIZE })
      : null,
    { revalidateOnFocus: false }
  );
}

/** A task belongs on the todo list when it isn't done or cancelled. */
export function isOpenIssue(issue: TBaseIssue, getStateById: (id: string | null | undefined) => IState | undefined) {
  if (issue.completed_at) return false;
  const group = issue.state_id ? getStateById(issue.state_id)?.group : undefined;
  return group !== "completed" && group !== "cancelled";
}

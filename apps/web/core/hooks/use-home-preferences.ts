/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import useSWR from "swr";
import { HomePreferencesService, type THomePreference } from "@/services/home-preferences.service";

const service = new HomePreferencesService();

/**
 * Load the current user's home-page section preferences and expose a
 * `reorder` helper that PATCHes new sort_order values to the backend.
 *
 * The hook returns rows sorted high→low (highest sort_order renders
 * first) to match how the WorkspaceHomeView consumes them. Optimistic
 * updates via SWR's `mutate` mean the UI feels instant even though the
 * actual PATCH is async.
 */
export function useHomePreferences(workspaceSlug: string | undefined) {
  const { data, isLoading, mutate } = useSWR<THomePreference[]>(
    workspaceSlug ? `HOME_PREFS_${workspaceSlug}` : null,
    workspaceSlug ? () => service.list(workspaceSlug) : null
  );

  // Sort high→low so the highest sort_order renders first without mutating
  // the SWR cache.
  const sorted = data ? [...data].sort((a, b) => b.sort_order - a.sort_order) : undefined;

  /**
   * Apply a new ordering to the section list. Takes the keys in their
   * desired top-to-bottom order; the hook assigns descending sort_order
   * values (so first → highest sort_order) and PATCHes any rows whose
   * order changed.
   */
  const reorder = useCallback(
    async (orderedKeys: string[]) => {
      if (!workspaceSlug || !data) return;

      const newOrders = new Map<string, number>();
      const base = 1000;
      orderedKeys.forEach((key, index) => {
        newOrders.set(key, base - index);
      });

      // Optimistic: mutate locally first.
      const optimistic = data.map((row) => ({
        ...row,
        sort_order: newOrders.get(row.key) ?? row.sort_order,
      }));
      await mutate(optimistic, { revalidate: false });

      // Then PATCH each changed row. Failures swallow — the next SWR
      // revalidation will pull the truth.
      const changed = optimistic.filter((row) => {
        const previous = data.find((d) => d.key === row.key);
        return previous && previous.sort_order !== row.sort_order;
      });
      await Promise.all(
        changed.map((row) =>
          service.update(workspaceSlug, row.key, { sort_order: row.sort_order }).catch(() => undefined)
        )
      );
    },
    [workspaceSlug, data, mutate]
  );

  return { preferences: sorted, isLoading, reorder };
}

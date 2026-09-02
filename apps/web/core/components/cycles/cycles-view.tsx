/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { EmptyStateIcon } from "@/components/empty-state/empty-state-icon";
import { useTranslation } from "@dragonfruit/i18n";
// components
import { CyclesList } from "@/components/cycles/list";
import { CycleModuleListLayoutLoader } from "@/components/ui/loader/cycle-module-list-loader";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useCycleFilter } from "@/hooks/store/use-cycle-filter";

export interface ICyclesView {
  workspaceSlug: string;
  projectId: string;
}

export const CyclesView = observer(function CyclesView(props: ICyclesView) {
  const { workspaceSlug, projectId } = props;
  // store hooks
  const { getFilteredCycleIds, getFilteredCompletedCycleIds, loader, currentProjectActiveCycleId } = useCycle();
  const { searchQuery } = useCycleFilter();
  const { t } = useTranslation();
  // derived values
  const filteredCycleIds = getFilteredCycleIds(projectId, false);
  const filteredCompletedCycleIds = getFilteredCompletedCycleIds(projectId);
  const filteredUpcomingCycleIds = (filteredCycleIds ?? []).filter(
    (cycleId) => cycleId !== currentProjectActiveCycleId
  );

  if (loader || !filteredCycleIds) return <CycleModuleListLayoutLoader />;

  if (filteredCycleIds.length === 0 && filteredCompletedCycleIds?.length === 0)
    return (
      <div className="grid h-full w-full place-items-center">
        <div className="text-center">
          <EmptyStateIcon name="search" className="mx-auto" />
          <h5 className="mt-7 mb-1 text-18 font-medium">{t("project_cycles.no_matching_cycles")}</h5>
          <p className="text-14 text-placeholder">
            {searchQuery.trim() === ""
              ? t("project_cycles.remove_filters_to_see_all_cycles")
              : t("project_cycles.remove_search_criteria_to_see_all_cycles")}
          </p>
        </div>
      </div>
    );

  return (
    <CyclesList
      completedCycleIds={filteredCompletedCycleIds ?? []}
      upcomingCycleIds={filteredUpcomingCycleIds}
      cycleIds={filteredCycleIds}
      workspaceSlug={workspaceSlug}
      projectId={projectId}
    />
  );
});

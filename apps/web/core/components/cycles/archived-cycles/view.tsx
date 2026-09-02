/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { EmptyStateIcon } from "@/components/empty-state/empty-state-icon";
import { CyclesList } from "@/components/cycles/list";
// ui
import { CycleModuleListLayoutLoader } from "@/components/ui/loader/cycle-module-list-loader";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useCycleFilter } from "@/hooks/store/use-cycle-filter";

export interface IArchivedCyclesView {
  workspaceSlug: string;
  projectId: string;
}

export const ArchivedCyclesView = observer(function ArchivedCyclesView(props: IArchivedCyclesView) {
  const { workspaceSlug, projectId } = props;
  // store hooks
  const { getFilteredArchivedCycleIds, loader } = useCycle();
  const { archivedCyclesSearchQuery } = useCycleFilter();
  // derived values
  const filteredArchivedCycleIds = getFilteredArchivedCycleIds(projectId);

  if (loader || !filteredArchivedCycleIds) return <CycleModuleListLayoutLoader />;

  if (filteredArchivedCycleIds.length === 0)
    return (
      <div className="grid h-full w-full place-items-center">
        <div className="text-center">
          <EmptyStateIcon name="search" className="mx-auto" />
          <h5 className="mt-7 mb-1 text-18 font-medium">No matching cycles</h5>
          <p className="text-14 text-placeholder">
            {archivedCyclesSearchQuery.trim() === ""
              ? "Remove the filters to see all cycles"
              : "Remove the search criteria to see all cycles"}
          </p>
        </div>
      </div>
    );

  return (
    <CyclesList
      completedCycleIds={[]}
      cycleIds={filteredArchivedCycleIds}
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      isArchived
    />
  );
});

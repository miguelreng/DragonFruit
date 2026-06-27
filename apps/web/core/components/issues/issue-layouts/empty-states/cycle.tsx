/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isEmpty } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { EIssuesStoreType, EUserProjectRoles } from "@plane/types";
// components
import { EmptyStateIcon } from "@/components/empty-state/empty-state-icon";
import { useCycle } from "@/hooks/store/use-cycle";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkItemFilterInstance } from "@/hooks/store/work-item-filters/use-work-item-filter-instance";

export const CycleEmptyState = observer(function CycleEmptyState() {
  // router
  const { cycleId: routerCycleId } = useParams();
  const cycleId = routerCycleId ? routerCycleId.toString() : undefined;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getCycleById } = useCycle();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const cycleWorkItemFilter = useWorkItemFilterInstance(EIssuesStoreType.CYCLE, cycleId);
  const cycleDetails = cycleId ? getCycleById(cycleId) : undefined;
  const isCompletedCycleSnapshotAvailable = !isEmpty(cycleDetails?.progress_snapshot ?? {});
  const isCompletedAndEmpty = isCompletedCycleSnapshotAvailable || cycleDetails?.status?.toLowerCase() === "completed";
  const canPerformEmptyStateActions = allowPermissions(
    [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  return (
    <div className="relative h-full w-full overflow-y-auto">
      <div className="grid h-full w-full place-items-center">
        {isCompletedAndEmpty ? (
          // TODO: Empty state ux copy needs to be updated
          <EmptyStateDetailed
            asset={<EmptyStateIcon name="tasks" />}
            title={t("project_cycles.empty_state.completed_no_issues.title")}
            description={t("project_cycles.empty_state.completed_no_issues.description")}
          />
        ) : cycleWorkItemFilter?.hasActiveFilters ? (
          <EmptyStateDetailed
            assetKey="search"
            title={t("common_empty_state.search.title")}
            description={t("common_empty_state.search.description")}
            actions={[
              {
                label: "Clear filters",
                onClick: cycleWorkItemFilter?.clearFilters,
                disabled: !canPerformEmptyStateActions || !cycleWorkItemFilter,
                variant: "secondary",
              },
            ]}
          />
        ) : (
          <EmptyStateDetailed
            asset={<EmptyStateIcon name="tasks" />}
            title={t("project_empty_state.cycle_work_items.title")}
            description={t("project_empty_state.cycle_work_items.description")}
          />
        )}
      </div>
    </div>
  );
});

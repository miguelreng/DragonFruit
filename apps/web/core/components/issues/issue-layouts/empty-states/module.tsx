/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { EIssuesStoreType, EUserProjectRoles } from "@plane/types";
// components
import { EmptyStateIcon } from "@/components/empty-state/empty-state-icon";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkItemFilterInstance } from "@/hooks/store/work-item-filters/use-work-item-filter-instance";

export const ModuleEmptyState = observer(function ModuleEmptyState() {
  // router
  const { moduleId: routerModuleId } = useParams();
  const moduleId = routerModuleId ? routerModuleId.toString() : undefined;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { allowPermissions } = useUserPermissions();
  // derived values
  const moduleWorkItemFilter = useWorkItemFilterInstance(EIssuesStoreType.MODULE, moduleId);
  const canPerformEmptyStateActions = allowPermissions(
    [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  return (
    <div className="relative h-full w-full overflow-y-auto">
      <div className="grid h-full w-full place-items-center">
        {moduleWorkItemFilter?.hasActiveFilters ? (
          <EmptyStateDetailed
            assetKey="search"
            title={t("common_empty_state.search.title")}
            description={t("common_empty_state.search.description")}
            actions={[
              {
                label: "Clear filters",
                onClick: moduleWorkItemFilter?.clearFilters,
                disabled: !canPerformEmptyStateActions || !moduleWorkItemFilter,
                variant: "secondary",
              },
            ]}
          />
        ) : (
          <EmptyStateDetailed
            asset={<EmptyStateIcon name="tasks" />}
            title={t("project_empty_state.module_work_items.title")}
            description={t("project_empty_state.module_work_items.description")}
          />
        )}
      </div>
    </div>
  );
});

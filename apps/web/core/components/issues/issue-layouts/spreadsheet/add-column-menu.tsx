/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// constants
import { EIssueFilterType, SPREADSHEET_PROPERTY_DETAILS } from "@plane/constants";
// i18n
import { useTranslation } from "@plane/i18n";
// types
import type { IIssueDisplayProperties } from "@plane/types";
// ui
import { CustomMenu } from "@plane/ui";
// components
import { CreateUpdateCustomFieldModal } from "@/components/custom-fields";
// icons
import { Plus } from "@/components/icons/lucide-shim";
// helpers
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
// hooks
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";

interface Props {
  displayProperties: IIssueDisplayProperties;
  spreadsheetColumnsList: (keyof IIssueDisplayProperties)[];
  refetchCustomFields?: () => void;
  isEpic?: boolean;
}

// The trailing "add column" (+) header. Offers creating a new project custom
// field, plus re-adding any built-in property whose column is currently hidden
// (the inverse of each column header's "Hide property" action).
export const AddColumnMenu = observer(function AddColumnMenu(props: Props) {
  const { displayProperties, spreadsheetColumnsList, refetchCustomFields, isEpic = false } = props;
  // i18n
  const { t } = useTranslation();
  // router
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const storeType = useIssueStoreType();
  const { updateFilters } = useIssuesActions(storeType);
  // state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Built-in properties available to add: renderable, defined, and not shown.
  const hiddenProperties = spreadsheetColumnsList.filter(
    (property) =>
      !displayProperties[property] && shouldRenderColumn(property) && !!SPREADSHEET_PROPERTY_DETAILS[property]
  );

  const handleAddBuiltIn = (property: keyof IIssueDisplayProperties) => {
    if (!projectId) return;
    updateFilters(projectId.toString(), EIssueFilterType.DISPLAY_PROPERTIES, { [property]: true });
  };

  // Custom fields are project-scoped, so only offer them on a project-level
  // table (workspace-level routes have no projectId param).
  const showCustomField = !!workspaceSlug && !!projectId;

  return (
    <>
      <CustomMenu
        className="w-full"
        customButtonClassName="clickable flex h-full w-full items-center justify-center"
        customButtonTabIndex={-1}
        customButton={
          <div className="flex h-9 w-full items-center justify-center text-tertiary hover:text-primary">
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </div>
        }
        placement="bottom-end"
        closeOnSelect
        maxHeight="lg"
      >
        {showCustomField && (
          <CustomMenu.MenuItem onClick={() => setIsCreateModalOpen(true)}>
            <span className="flex items-center gap-2 px-1 font-medium text-secondary hover:text-primary">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New field
            </span>
          </CustomMenu.MenuItem>
        )}

        {hiddenProperties.length > 0 && (
          <>
            {showCustomField && <div className="my-1 border-t border-subtle" />}
            <span className="flex px-1 pb-0.5 pt-1 text-11 font-medium uppercase tracking-wide text-tertiary">
              Show field
            </span>
            {hiddenProperties.map((property) => {
              const propertyDetails = SPREADSHEET_PROPERTY_DETAILS[property];
              const label =
                property === "sub_issue_count" && isEpic
                  ? t("issue.label", { count: 2 })
                  : t(propertyDetails.i18n_title);
              return (
                <CustomMenu.MenuItem key={property} onClick={() => handleAddBuiltIn(property)}>
                  <span className="flex items-center gap-2 px-1 text-secondary hover:text-primary">{label}</span>
                </CustomMenu.MenuItem>
              );
            })}
          </>
        )}

        {!showCustomField && hiddenProperties.length === 0 && (
          <span className="flex px-1 py-1.5 text-13 text-tertiary">All fields added</span>
        )}
      </CustomMenu>

      {showCustomField && (
        <CreateUpdateCustomFieldModal
          workspaceSlug={workspaceSlug.toString()}
          projectId={projectId.toString()}
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSaved={() => {
            setIsCreateModalOpen(false);
            refetchCustomFields?.();
          }}
        />
      )}
    </>
  );
});

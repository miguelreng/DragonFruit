/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// constants
import { SPREADSHEET_SELECT_GROUP } from "@plane/constants";
// ui
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties, IProjectCustomField } from "@plane/types";
// components
import { cn } from "@plane/utils";
import { MultipleSelectGroupAction } from "@/components/core/multiple-select";
// hooks
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { AddColumnMenu } from "./add-column-menu";
import { ColumnResizeHandle } from "./column-resize-handle";
import { SpreadsheetHeaderColumn } from "./spreadsheet-header-column";

interface Props {
  displayProperties: IIssueDisplayProperties;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  canEditProperties: (projectId: string | undefined) => boolean;
  isEstimateEnabled: boolean;
  spreadsheetColumnsList: (keyof IIssueDisplayProperties)[];
  customFields: IProjectCustomField[];
  refetchCustomFields?: () => void;
  selectionHelpers: TSelectionHelper;
  onColumnResize: (key: string, width: number) => void;
  nameColumnKey: string;
  isEpic?: boolean;
}

export const SpreadsheetHeader = observer(function SpreadsheetHeader(props: Props) {
  const {
    displayProperties,
    displayFilters,
    handleDisplayFilterUpdate,
    canEditProperties,
    isEstimateEnabled,
    spreadsheetColumnsList,
    customFields,
    refetchCustomFields,
    selectionHelpers,
    onColumnResize,
    nameColumnKey,
    isEpic = false,
  } = props;
  // router
  const { projectId } = useParams();
  // derived values
  const isGroupSelectionEmpty = selectionHelpers.isGroupSelected(SPREADSHEET_SELECT_GROUP) === "empty";
  // auth
  const canSelectIssues = canEditProperties(projectId?.toString()) && !selectionHelpers.isSelectionDisabled;

  return (
    <thead className="sticky top-0 left-0 z-[12] border-b-[0.5px] border-subtle">
      <tr>
        {/* Dedicated select-all column — its own frozen cell at the far left,
            always visible, mirroring the per-row checkbox cell below. */}
        <th
          className="sticky left-0 z-[16] h-9 w-12 min-w-12 border-r-[0.5px] border-subtle bg-layer-1 md:sticky"
          tabIndex={-1}
        >
          {canSelectIssues && (
            <div className="flex h-full w-full items-center justify-center">
              <MultipleSelectGroupAction
                className={cn("size-3.5 !outline-none", { "opacity-100": !isGroupSelectionEmpty })}
                groupID={SPREADSHEET_SELECT_GROUP}
                selectionHelpers={selectionHelpers}
              />
            </div>
          )}
        </th>
        {/* Title column, frozen to the right of the select column. */}
        <th
          // h-9 matches the new row height (was h-11). Compact spreadsheet.
          className="group/header relative left-0 z-[15] h-9 min-w-60 border-r-[0.5px] border-subtle bg-layer-1 text-13 font-medium md:sticky md:left-12"
          tabIndex={-1}
        >
          <div className="flex h-full w-full items-center px-page-x">
            <span className="text-13 font-medium">{`${isEpic ? "Epics" : "Tasks"}`}</span>
          </div>
          <ColumnResizeHandle onResize={(width) => onColumnResize(nameColumnKey, width)} />
        </th>

        {spreadsheetColumnsList.map((property) => (
          <SpreadsheetHeaderColumn
            key={property}
            property={property}
            displayProperties={displayProperties}
            displayFilters={displayFilters}
            handleDisplayFilterUpdate={handleDisplayFilterUpdate}
            isEstimateEnabled={isEstimateEnabled}
            onColumnResize={onColumnResize}
            isEpic={isEpic}
          />
        ))}
        {/* Custom-field columns, after the built-in properties. */}
        {customFields.map((field) => (
          <th
            key={field.id}
            className="group/header relative h-9 min-w-36 items-center border-r-[0.5px] border-subtle bg-layer-1 py-1 text-13 font-medium"
            tabIndex={0}
          >
            <div className="flex h-full w-full items-center px-page-x">
              <span className="truncate text-13 font-medium">{field.name}</span>
            </div>
            <ColumnResizeHandle onResize={(width) => onColumnResize(`cf:${field.id}`, width)} />
          </th>
        ))}
        {/* Trailing "add column" (+) cell — creates a new custom field or turns a
            hidden built-in property back into a column. */}
        <th className="relative h-9 bg-layer-1" tabIndex={-1}>
          <AddColumnMenu
            displayProperties={displayProperties}
            spreadsheetColumnsList={spreadsheetColumnsList}
            refetchCustomFields={refetchCustomFields}
            isEpic={isEpic}
          />
        </th>
      </tr>
    </thead>
  );
});

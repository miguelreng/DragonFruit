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
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
// components
import { cn } from "@plane/utils";
import { MultipleSelectGroupAction } from "@/components/core/multiple-select";
// hooks
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { SpreadsheetHeaderColumn } from "./spreadsheet-header-column";

interface Props {
  displayProperties: IIssueDisplayProperties;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  canEditProperties: (projectId: string | undefined) => boolean;
  isEstimateEnabled: boolean;
  spreadsheetColumnsList: (keyof IIssueDisplayProperties)[];
  selectionHelpers: TSelectionHelper;
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
    selectionHelpers,
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
        {/* Single header column containing both identifier and workitem */}
        <th
          // h-9 matches the new row height (was h-11). Compact spreadsheet.
          className="group/list-header left-0 z-[15] h-9 min-w-60 border-r-[0.5px] border-subtle bg-layer-1 text-13 font-medium md:sticky"
          tabIndex={-1}
        >
          {/* Header layout mirrors the row: leading select-all column (w-8)
              before the title text, same vertical center, same visibility
              treatment (hover-reveal, full opacity when any selection is
              active). */}
          <div className="flex h-full w-full items-center">
            {canSelectIssues && (
              <div className="flex h-full w-6 flex-shrink-0 items-center justify-center">
                <MultipleSelectGroupAction
                  className={cn(
                    "pointer-events-none size-3.5 opacity-0 !outline-none group-hover/list-header:pointer-events-auto group-hover/list-header:opacity-100",
                    {
                      "pointer-events-auto opacity-100": !isGroupSelectionEmpty,
                    }
                  )}
                  groupID={SPREADSHEET_SELECT_GROUP}
                  selectionHelpers={selectionHelpers}
                />
              </div>
            )}
            {/* Spacer mirrors the row's sub-issue chevron slot (size-5) + gap so
                the "Tasks" label lines up with the row titles below. */}
            <div className="flex flex-grow items-center gap-0.5">
              <div className="grid size-5 flex-shrink-0 place-items-center" />
              <span className="text-13 font-medium">{`${isEpic ? "Epics" : "Tasks"}`}</span>
            </div>
          </div>
        </th>

        {spreadsheetColumnsList.map((property) => (
          <SpreadsheetHeaderColumn
            key={property}
            property={property}
            displayProperties={displayProperties}
            displayFilters={displayFilters}
            handleDisplayFilterUpdate={handleDisplayFilterUpdate}
            isEstimateEnabled={isEstimateEnabled}
            isEpic={isEpic}
          />
        ))}
      </tr>
    </thead>
  );
});

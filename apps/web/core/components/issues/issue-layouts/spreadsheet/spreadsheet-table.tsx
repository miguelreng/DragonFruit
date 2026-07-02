/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MutableRefObject } from "react";
import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties, IProjectCustomField, TIssue } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { Checkbox } from "@plane/ui";
// components
import { SpreadsheetIssueRowLoader } from "@/components/ui/loader/layouts/spreadsheet-layout-loader";
// helpers
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
// hooks
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import useLocalStorage from "@/hooks/use-local-storage";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { useTableKeyboardNavigation } from "@/hooks/use-table-keyboard-navigation";
// local imports
import type { TRenderQuickActions } from "../list/list-view-types";
import { WithDisplayPropertiesHOC } from "../properties/with-display-properties-HOC";
import { QuickAddIssueRoot, SpreadsheetAddIssueButton } from "../quick-add";
import { getDisplayPropertiesCount } from "../utils";
import { SpreadsheetFooter } from "./footer/spreadsheet-footer";
import { SpreadsheetIssueRow } from "./issue-row";
import { SpreadsheetHeader } from "./spreadsheet-header";

// Frozen select column is fixed; the title + property columns are resizable.
const SELECT_COL_WIDTH = 48;
const NAME_COL_KEY = "__name__";
const DEFAULT_NAME_WIDTH = 280;
const DEFAULT_COL_WIDTH = 180;
// Fixed-width trailing column that hosts the "add column" (+) header.
const ADD_COL_WIDTH = 44;

type Props = {
  displayProperties: IIssueDisplayProperties;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  issueIds: string[];
  isEstimateEnabled: boolean;
  quickActions: TRenderQuickActions;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickAddCallback?: (projectId: string | null | undefined, data: TIssue) => Promise<TIssue | undefined>;
  enableQuickCreateIssue?: boolean;
  disableIssueCreation?: boolean;
  canEditProperties: (projectId: string | undefined) => boolean;
  portalElement: React.MutableRefObject<HTMLDivElement | null>;
  containerRef: MutableRefObject<HTMLTableElement | null>;
  canLoadMoreIssues: boolean;
  loadMoreIssues: () => void;
  spreadsheetColumnsList: (keyof IIssueDisplayProperties)[];
  customFields: IProjectCustomField[];
  refetchCustomFields?: () => void;
  selectionHelpers: TSelectionHelper;
  isEpic?: boolean;
};

export const SpreadsheetTable = observer(function SpreadsheetTable(props: Props) {
  const {
    displayProperties,
    displayFilters,
    handleDisplayFilterUpdate,
    issueIds,
    isEstimateEnabled,
    portalElement,
    quickActions,
    updateIssue,
    quickAddCallback,
    enableQuickCreateIssue,
    disableIssueCreation,
    canEditProperties,
    canLoadMoreIssues,
    containerRef,
    loadMoreIssues,
    spreadsheetColumnsList,
    customFields,
    refetchCustomFields,
    selectionHelpers,
    isEpic = false,
  } = props;

  // router
  const { projectId } = useParams();
  // states
  // Whether the inline "new task" editor row is open. The CTA row stays visible
  // either way so it never disappears when clicked (Notion-style).
  const [isAddingTask, setIsAddingTask] = useState(false);
  const isScrolled = useRef(false);

  // User-resized column widths, remembered per project. The select column is
  // fixed; the title (NAME_COL_KEY) and each property column are resizable.
  const { storedValue: columnWidths, setValue: setColumnWidths } = useLocalStorage<Record<string, number>>(
    `spreadsheet-col-widths:${projectId?.toString() ?? "default"}`,
    {}
  );
  const widthFor = (key: string, fallback: number) => columnWidths?.[key] ?? fallback;
  const handleColumnResize = (key: string, width: number) => setColumnWidths({ ...(columnWidths ?? {}), [key]: width });

  // Columns actually rendered (same predicate the header/rows use), in order.
  const visibleColumns = spreadsheetColumnsList.filter(
    (property) => !!displayProperties[property] && shouldRenderColumn(property)
  );
  // Custom-field columns are keyed by `cf:<id>` so their widths don't collide
  // with the built-in property keys.
  const customFieldColKey = (id: string) => `cf:${id}`;
  const tableWidth =
    SELECT_COL_WIDTH +
    widthFor(NAME_COL_KEY, DEFAULT_NAME_WIDTH) +
    visibleColumns.reduce((sum, property) => sum + widthFor(property, DEFAULT_COL_WIDTH), 0) +
    customFields.reduce((sum, field) => sum + widthFor(customFieldColKey(field.id), DEFAULT_COL_WIDTH), 0) +
    ADD_COL_WIDTH;
  const [intersectionElement, setIntersectionElement] = useState<HTMLElement | null>(null);

  const {
    issues: { getIssueLoader },
  } = useIssuesStore();

  const isPaginating = !!getIssueLoader();

  useIntersectionObserver(containerRef, isPaginating ? null : intersectionElement, loadMoreIssues, `100% 0% 100% 0%`);

  const handleKeyBoardNavigation = useTableKeyboardNavigation();

  const ignoreFieldsForCounting: (keyof IIssueDisplayProperties)[] = ["key"];
  if (!isEstimateEnabled) ignoreFieldsForCounting.push("estimate");
  const displayPropertiesCount = getDisplayPropertiesCount(displayProperties, ignoreFieldsForCounting);

  return (
    <table
      // border-separate (gapless) so sticky cells keep their own borders while
      // scrolling — with collapsed borders the divider belongs to the grid and
      // scrolls away from the frozen select/title columns.
      className="table-fixed border-separate border-spacing-0 overflow-y-auto bg-surface-1"
      style={{ width: tableWidth }}
      onKeyDown={handleKeyBoardNavigation}
    >
      {/* Column widths (resizable). Fixed layout makes these authoritative. */}
      <colgroup>
        <col style={{ width: SELECT_COL_WIDTH }} />
        <col style={{ width: widthFor(NAME_COL_KEY, DEFAULT_NAME_WIDTH) }} />
        {visibleColumns.map((property) => (
          <col key={property} style={{ width: widthFor(property, DEFAULT_COL_WIDTH) }} />
        ))}
        {customFields.map((field) => (
          <col key={field.id} style={{ width: widthFor(customFieldColKey(field.id), DEFAULT_COL_WIDTH) }} />
        ))}
        <col style={{ width: ADD_COL_WIDTH }} />
      </colgroup>
      <SpreadsheetHeader
        displayProperties={displayProperties}
        displayFilters={displayFilters}
        handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        canEditProperties={canEditProperties}
        isEstimateEnabled={isEstimateEnabled}
        spreadsheetColumnsList={spreadsheetColumnsList}
        customFields={customFields}
        refetchCustomFields={refetchCustomFields}
        selectionHelpers={selectionHelpers}
        onColumnResize={handleColumnResize}
        nameColumnKey={NAME_COL_KEY}
        isEpic={isEpic}
      />
      <tbody>
        {issueIds.map((id) => (
          <SpreadsheetIssueRow
            key={id}
            issueId={id}
            displayProperties={displayProperties}
            quickActions={quickActions}
            canEditProperties={canEditProperties}
            nestingLevel={0}
            isEstimateEnabled={isEstimateEnabled}
            updateIssue={updateIssue}
            portalElement={portalElement}
            containerRef={containerRef}
            isScrolled={isScrolled}
            spreadsheetColumnsList={spreadsheetColumnsList}
            customFields={customFields}
            selectionHelpers={selectionHelpers}
            isEpic={isEpic}
          />
        ))}
      </tbody>
      <tfoot>
        {/* Infinite-scroll sentinel + skeleton rows, only while more pages exist. */}
        {canLoadMoreIssues && (
          <>
            {Array.from({ length: 3 }).map((_, index) => (
              <SpreadsheetIssueRowLoader key={index} columnCount={displayPropertiesCount} />
            ))}
            <tr ref={setIntersectionElement} aria-hidden className="h-px" />
          </>
        )}
        {/* "New task" as REAL grid cells (frozen select + title columns, empty
            cells per column) so it reads like an actual row — Notion-style —
            sitting above the aggregation/count row. The editor row only shows
            while adding; the CTA row below is always present (never disappears). */}
        {enableQuickCreateIssue && !disableIssueCreation && (
          <>
            {isAddingTask && (
              <tr>
                <td className="sticky left-0 z-[11] h-9 w-12 min-w-12 border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1 md:sticky">
                  {/* Placeholder checkbox — exact same design as the row checkboxes
                      (border-strong, faded at rest), just non-interactive. */}
                  <div className="flex h-full w-full items-center justify-center">
                    <Checkbox checked={false} readOnly className="size-3.5 opacity-60 !outline-none" />
                  </div>
                </td>
                <td className="sticky left-0 z-10 h-9 min-w-60 border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1 md:sticky md:left-12">
                  <QuickAddIssueRoot
                    layout={EIssueLayoutTypes.SPREADSHEET}
                    isQuickAddOpen={isAddingTask}
                    setIsQuickAddOpen={setIsAddingTask}
                    quickAddCallback={quickAddCallback}
                    isEpic={isEpic}
                  />
                </td>
                {spreadsheetColumnsList.map((property) => (
                  <WithDisplayPropertiesHOC
                    key={property}
                    displayProperties={displayProperties}
                    displayPropertyKey={property}
                    shouldRenderProperty={() => shouldRenderColumn(property)}
                  >
                    <td className="h-9 min-w-36 border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1" />
                  </WithDisplayPropertiesHOC>
                ))}
                {customFields.map((field) => (
                  <td
                    key={field.id}
                    className="h-9 min-w-36 border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1"
                  />
                ))}
                <td className="h-9 border-b-[0.5px] border-subtle bg-surface-1" />
              </tr>
            )}
            <tr>
              <td className="sticky left-0 z-[11] h-9 w-12 min-w-12 border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1 md:sticky" />
              <td className="sticky left-0 z-10 h-9 min-w-60 border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1 md:sticky md:left-12">
                <SpreadsheetAddIssueButton isEpic={isEpic} onClick={() => setIsAddingTask(true)} />
              </td>
              {spreadsheetColumnsList.map((property) => (
                <WithDisplayPropertiesHOC
                  key={property}
                  displayProperties={displayProperties}
                  displayPropertyKey={property}
                  shouldRenderProperty={() => shouldRenderColumn(property)}
                >
                  <td className="h-9 min-w-36 border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1" />
                </WithDisplayPropertiesHOC>
              ))}
              {customFields.map((field) => (
                <td
                  key={field.id}
                  className="h-9 min-w-36 border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1"
                />
              ))}
              <td className="h-9 border-b-[0.5px] border-subtle bg-surface-1" />
            </tr>
          </>
        )}
        {/* Notion-style per-column aggregation row, pinned to the bottom. */}
        <SpreadsheetFooter
          issueIds={issueIds}
          displayProperties={displayProperties}
          spreadsheetColumnsList={spreadsheetColumnsList}
          customFields={customFields}
        />
      </tfoot>
    </table>
  );
});

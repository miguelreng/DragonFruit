/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import type { IIssueDisplayProperties, IProjectCustomField, TIssue } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { CheckIcon } from "@/components/icons/propel-shim";
// helpers
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import useLocalStorage from "@/hooks/use-local-storage";
// local imports
import { WithDisplayPropertiesHOC } from "../../properties/with-display-properties-HOC";
import {
  AGGREGATION_LABELS,
  computeAggregation,
  getAvailableAggregations,
  type TAggregationType,
} from "./aggregation";

// Key used for the always-present leading "Tasks" column (not a display property).
const NAME_COLUMN_KEY = "__name__";

type TAggregationMap = Record<string, TAggregationType>;

type FooterCellProps = {
  label: string;
  value: string;
  options: TAggregationType[];
  selected: TAggregationType;
  onSelect: (aggregation: TAggregationType) => void;
};

const FooterCell = observer(function FooterCell({ label, value, options, selected, onSelect }: FooterCellProps) {
  const hasValue = selected !== "none" && value !== "";
  return (
    <CustomMenu
      placement="top-end"
      closeOnSelect
      maxHeight="lg"
      customButtonClassName="clickable !w-full h-full"
      customButtonTabIndex={-1}
      customButton={
        <div className="group/footer flex h-9 w-full items-center justify-end gap-1.5 px-page-x text-13">
          {hasValue ? (
            <>
              <span className="truncate font-normal text-tertiary">{label}</span>
              <span className="font-medium text-secondary">{value}</span>
            </>
          ) : (
            <span className="font-normal text-placeholder opacity-0 transition group-hover/footer:opacity-100">
              {AGGREGATION_LABELS.none}
            </span>
          )}
        </div>
      }
    >
      {options.map((option) => (
        <CustomMenu.MenuItem key={option} onClick={() => onSelect(option)}>
          <div className="flex w-full items-center justify-between gap-2">
            <span className={cn(option === "none" && "text-tertiary")}>{AGGREGATION_LABELS[option]}</span>
            {selected === option && <CheckIcon className="h-3 w-3 flex-shrink-0" />}
          </div>
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
});

type Props = {
  issueIds: string[];
  displayProperties: IIssueDisplayProperties;
  spreadsheetColumnsList: (keyof IIssueDisplayProperties)[];
  customFields: IProjectCustomField[];
};

export const SpreadsheetFooter = observer(function SpreadsheetFooter(props: Props) {
  const { issueIds, displayProperties, spreadsheetColumnsList, customFields } = props;
  // router
  const { projectId, viewId } = useParams();
  // store hooks
  const { issueMap } = useIssues();

  // Chosen aggregation per column, remembered per (project, view).
  const { storedValue, setValue } = useLocalStorage<TAggregationMap>(
    `spreadsheet-aggregations:${projectId?.toString() ?? "default"}:${viewId?.toString() ?? "default"}`,
    { [NAME_COLUMN_KEY]: "count_all" }
  );
  const aggregations = storedValue ?? {};

  const setAggregation = (key: string, aggregation: TAggregationType) => {
    setValue({ ...aggregations, [key]: aggregation });
  };

  // Resolve the loaded issues once for every cell to share.
  const issues = useMemo(
    () => issueIds.map((id) => issueMap[id]).filter((issue): issue is TIssue => !!issue),
    [issueIds, issueMap]
  );

  const nameAggregation = aggregations[NAME_COLUMN_KEY] ?? "none";

  return (
    <tr>
      {/* Empty cell under the select column, to keep the footer aligned with
          the header/rows' dedicated checkbox column. */}
      <td className="sticky bottom-0 left-0 z-[16] h-9 w-12 min-w-12 border-t-[0.5px] border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1" />
      {/* Leading column mirrors the header's "Tasks" cell — pinned both to the
          bottom (footer) and to the left, just right of the checkbox column. */}
      <td className="sticky bottom-0 left-12 z-[15] h-9 min-w-60 border-t-[0.5px] border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1">
        <FooterCell
          label={AGGREGATION_LABELS[nameAggregation]}
          value={computeAggregation(issues, "state", nameAggregation === "none" ? "none" : "count_all")}
          options={["none", "count_all"]}
          selected={nameAggregation}
          onSelect={(aggregation) => setAggregation(NAME_COLUMN_KEY, aggregation)}
        />
      </td>
      {spreadsheetColumnsList.map((property) => {
        const selected = aggregations[property] ?? "none";
        return (
          <WithDisplayPropertiesHOC
            key={property}
            displayProperties={displayProperties}
            displayPropertyKey={property}
            shouldRenderProperty={() => shouldRenderColumn(property)}
          >
            <td className="sticky bottom-0 z-[11] h-9 min-w-36 border-t-[0.5px] border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1 text-13">
              <FooterCell
                label={AGGREGATION_LABELS[selected]}
                value={computeAggregation(issues, property, selected)}
                options={getAvailableAggregations(property)}
                selected={selected}
                onSelect={(aggregation) => setAggregation(property, aggregation)}
              />
            </td>
          </WithDisplayPropertiesHOC>
        );
      })}
      {/* Custom-field columns have no aggregation — keep the row aligned. */}
      {customFields.map((field) => (
        <td
          key={field.id}
          className="sticky bottom-0 z-[11] h-9 min-w-36 border-t-[0.5px] border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1"
        />
      ))}
      {/* Trailing cell under the "add column" (+) header. */}
      <td className="sticky bottom-0 z-[11] h-9 border-t-[0.5px] border-b-[0.5px] border-subtle bg-surface-1" />
    </tr>
  );
});

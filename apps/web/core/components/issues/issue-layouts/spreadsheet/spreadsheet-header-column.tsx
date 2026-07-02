/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
//types
import { observer } from "mobx-react";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
//components
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
import { WithDisplayPropertiesHOC } from "../properties/with-display-properties-HOC";
import { ColumnResizeHandle } from "./column-resize-handle";
import { HeaderColumn } from "./columns/header-column";

interface Props {
  displayProperties: IIssueDisplayProperties;
  property: keyof IIssueDisplayProperties;
  isEstimateEnabled: boolean;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  onColumnResize: (key: string, width: number) => void;
  isEpic?: boolean;
}
export const SpreadsheetHeaderColumn = observer(function SpreadsheetHeaderColumn(props: Props) {
  const { displayProperties, displayFilters, property, handleDisplayFilterUpdate, onColumnResize, isEpic = false } =
    props;

  //hooks
  const tableHeaderCellRef = useRef<HTMLTableCellElement | null>(null);

  const shouldRenderProperty = shouldRenderColumn(property);

  return (
    <WithDisplayPropertiesHOC
      displayProperties={displayProperties}
      displayPropertyKey={property}
      shouldRenderProperty={() => shouldRenderProperty}
    >
      <th
        // Right border only — `border` on all sides double-lined against the
        // neighbor's border. Matches the body cells' single `border-r`.
        className="group/header relative h-9 min-w-36 items-center border-r-[0.5px] border-subtle bg-layer-1 py-1 text-13 font-medium"
        ref={tableHeaderCellRef}
        tabIndex={0}
      >
        <HeaderColumn
          displayFilters={displayFilters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
          property={property}
          onClose={() => {
            tableHeaderCellRef?.current?.focus();
          }}
          isEpic={isEpic}
        />
        <ColumnResizeHandle onResize={(width) => onColumnResize(property, width)} />
      </th>
    </WithDisplayPropertiesHOC>
  );
});

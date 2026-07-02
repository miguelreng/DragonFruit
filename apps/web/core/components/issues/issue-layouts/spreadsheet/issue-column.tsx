/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useRef } from "react";
import { observer } from "mobx-react";
// types
import type { IIssueDisplayProperties, TIssue } from "@plane/types";
// components
import { SPREADSHEET_COLUMNS } from "@/plane-web/components/issues/issue-layouts/utils";
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
import { WithDisplayPropertiesHOC } from "../properties/with-display-properties-HOC";

type Props = {
  displayProperties: IIssueDisplayProperties;
  issueDetail: TIssue;
  disableUserActions: boolean;
  property: keyof IIssueDisplayProperties;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  isEstimateEnabled: boolean;
};

export const IssueColumn = observer(function IssueColumn(props: Props) {
  const { displayProperties, issueDetail, disableUserActions, property, updateIssue } = props;
  const tableCellRef = useRef<HTMLTableCellElement | null>(null);

  const shouldRenderProperty = shouldRenderColumn(property);

  const Column = SPREADSHEET_COLUMNS[property];

  const handleUpdateIssue = useCallback(
    async (issue: TIssue, data: Partial<TIssue>) => {
      if (updateIssue) await updateIssue(issue.project_id, issue.id, data);
    },
    [updateIssue]
  );

  // The HOC's predicate prop expects a function — memoizing keeps its identity
  // stable so we don't churn the HOC's own observer subscriptions per render.
  const shouldRenderPredicate = useMemo(() => () => shouldRenderProperty, [shouldRenderProperty]);
  const handleClose = useCallback(() => tableCellRef.current?.focus(), []);

  if (!Column) return null;

  return (
    <WithDisplayPropertiesHOC
      displayProperties={displayProperties}
      displayPropertyKey={property}
      shouldRenderProperty={shouldRenderPredicate}
    >
      <td
        tabIndex={0}
        // No bottom border here — each column draws its own `border-b`, so adding
        // one on the <td> too would double the horizontal divider. Property cells
        // open a dropdown on click, so they don't get a focus box (only the task
        // name cell does).
        className="h-9 min-w-36 border-r-[0.5px] border-subtle text-13 outline-none"
        ref={tableCellRef}
      >
        <Column issue={issueDetail} onChange={handleUpdateIssue} disabled={disableUserActions} onClose={handleClose} />
      </td>
    </WithDisplayPropertiesHOC>
  );
});

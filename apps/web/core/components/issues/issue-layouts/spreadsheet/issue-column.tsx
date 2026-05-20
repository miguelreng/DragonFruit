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
        className="h-9 min-w-36 border-r-[1px] border-subtle text-13 after:absolute after:bottom-[-1px] after:w-full after:border after:border-subtle"
        ref={tableCellRef}
      >
        <Column issue={issueDetail} onChange={handleUpdateIssue} disabled={disableUserActions} onClose={handleClose} />
      </td>
    </WithDisplayPropertiesHOC>
  );
});

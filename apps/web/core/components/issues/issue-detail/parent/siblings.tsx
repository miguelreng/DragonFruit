/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import type { TIssue } from "@plane/types";
// components
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// types
import { IssueParentSiblingItem } from "./sibling-item";

export type TIssueParentSiblings = {
  workspaceSlug: string;
  currentIssue: TIssue;
  parentIssue: TIssue;
};

export const IssueParentSiblings = observer(function IssueParentSiblings(props: TIssueParentSiblings) {
  const { workspaceSlug, currentIssue, parentIssue } = props;
  const { t } = useTranslation();
  // hooks
  const {
    fetchSubIssues,
    subIssues: { subIssuesByIssueId },
  } = useIssueDetail();

  const { isLoading } = useSWR(
    parentIssue && parentIssue.project_id
      ? `ISSUE_PARENT_CHILD_ISSUES_${workspaceSlug}_${parentIssue.project_id}_${parentIssue.id}`
      : null,
    parentIssue && parentIssue.project_id
      ? () => fetchSubIssues(workspaceSlug, parentIssue.project_id!, parentIssue.id)
      : null
  );

  const subIssueIds = (parentIssue && subIssuesByIssueId(parentIssue.id)) || undefined;
  // the current work item is a child of the same parent — it is not its own sibling
  const siblingIds = (subIssueIds ?? []).filter((issueId) => issueId !== currentIssue.id);

  if (isLoading) return <div className="px-2 py-1 text-left text-13 text-tertiary">{t("common.loading")}</div>;

  if (siblingIds.length === 0) return <div className="px-2 py-1 text-left text-13 text-tertiary">No sibling tasks</div>;

  return (
    <div className="max-h-32 overflow-y-auto">
      {siblingIds.map((issueId) => (
        <IssueParentSiblingItem key={issueId} workspaceSlug={workspaceSlug} issueId={issueId} />
      ))}
    </div>
  );
});

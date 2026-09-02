/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// ui
import { CustomMenu } from "@dragonfruit/ui";
// helpers
import { generateWorkItemLink } from "@dragonfruit/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";

type TIssueParentSiblingItem = {
  workspaceSlug: string;
  issueId: string;
};

export const IssueParentSiblingItem = observer(function IssueParentSiblingItem(props: TIssueParentSiblingItem) {
  const { workspaceSlug, issueId } = props;
  // hooks
  const { getProjectById } = useProject();
  const { getProjectStates } = useProjectState();
  const {
    issue: { getIssueById },
  } = useIssueDetail();

  // derived values
  const issueDetail = (issueId && getIssueById(issueId)) || undefined;
  if (!issueDetail) return <></>;

  const projectDetails = (issueDetail.project_id && getProjectById(issueDetail.project_id)) || undefined;
  const stateColor = getProjectStates(issueDetail.project_id)?.find(
    (state) => state?.id === issueDetail.state_id
  )?.color;

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: issueDetail?.project_id,
    issueId: issueDetail?.id,
    projectIdentifier: projectDetails?.identifier,
    sequenceId: issueDetail?.sequence_id,
  });

  return (
    <CustomMenu.MenuItem
      key={issueDetail.id}
      onClick={() => window.open(workItemLink, "_blank", "noopener,noreferrer")}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stateColor }} aria-hidden="true" />
        <span className="truncate text-secondary">{issueDetail.name}</span>
      </div>
    </CustomMenu.MenuItem>
  );
});

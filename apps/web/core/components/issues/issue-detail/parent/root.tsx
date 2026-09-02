/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
import { GitBranch as ParentPropertyIcon, MinusCircle, MoreHorizontal } from "@/components/icons/lucide-shim";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssue } from "@plane/types";
// component
// ui
import { ControlLink, CustomMenu } from "@plane/ui";
// helpers
import { generateWorkItemLink } from "@plane/utils";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
// types
import type { TIssueOperations } from "../root";
import { IssueParentSiblings } from "./siblings";

export type TIssueParentDetail = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issue: TIssue;
  issueOperations: TIssueOperations;
};

export const IssueParentDetail = observer(function IssueParentDetail(props: TIssueParentDetail) {
  const { workspaceSlug, projectId, issueId, issue, issueOperations } = props;
  // router
  const router = useRouter();
  const { t } = useTranslation();
  // hooks
  const { issueMap } = useIssues();
  const { getProjectStates } = useProjectState();
  const { handleRedirection } = useIssuePeekOverviewRedirection();
  const { isMobile } = usePlatformOS();
  const { getProjectIdentifierById } = useProject();

  // derived values
  const parentIssue = issueMap?.[issue.parent_id || ""] || undefined;
  const isParentEpic = parentIssue?.is_epic;
  const projectIdentifier = getProjectIdentifierById(parentIssue?.project_id);

  const issueParentState = getProjectStates(parentIssue?.project_id)?.find(
    (state) => state?.id === parentIssue?.state_id
  );
  const stateColor = issueParentState?.color || undefined;

  if (!parentIssue) return <></>;

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: parentIssue?.project_id,
    issueId: parentIssue.id,
    projectIdentifier,
    sequenceId: parentIssue.sequence_id,
    isEpic: isParentEpic,
  });

  const handleParentIssueClick = () => {
    if (isParentEpic) router.push(workItemLink);
    else handleRedirection(workspaceSlug, parentIssue, isMobile);
  };

  return (
    <div className="mb-5 inline-flex max-w-full items-center gap-1 rounded-lg border border-subtle bg-layer-1 py-0.5 pr-0.5 pl-2 text-11">
      <span className="flex shrink-0 items-center gap-1 text-tertiary">
        <ParentPropertyIcon className="size-3 shrink-0" aria-hidden="true" />
        {t("common.parent")}
      </span>
      <span className="mx-0.5 h-3 w-px shrink-0 bg-layer-3" aria-hidden="true" />

      <Tooltip tooltipContent={parentIssue.name} position="top" isMobile={isMobile}>
        <ControlLink
          href={workItemLink}
          onClick={handleParentIssueClick}
          className="t-colors flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-secondary hover:bg-layer-transparent-hover hover:text-primary"
        >
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stateColor }} aria-hidden="true" />
          <span className="truncate">{parentIssue.name}</span>
        </ControlLink>
      </Tooltip>

      <CustomMenu
        placement="bottom-end"
        ariaLabel={t("common.parent")}
        maxHeight="lg"
        optionsClassName="w-64 max-w-[calc(100vw-2rem)] p-1"
        // the peek drawer clips overflow, so the fixed popper has to escape it
        portalElement={document.body}
        customButtonClassName="grid shrink-0 place-items-center"
        customButton={
          <span className="t-colors grid size-5 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-primary">
            <MoreHorizontal weight="Bold" className="size-3.5" />
          </span>
        }
      >
        <div className="px-2 pt-1 pb-1.5 text-11 font-medium tracking-wide text-tertiary uppercase">
          {t("issue.sibling.label")}
        </div>

        <IssueParentSiblings workspaceSlug={workspaceSlug} currentIssue={issue} parentIssue={parentIssue} />

        <div className="my-1 h-px bg-layer-3" aria-hidden="true" />

        <CustomMenu.MenuItem
          onClick={() => issueOperations.update(workspaceSlug, projectId, issueId, { parent_id: null })}
          className="flex items-center gap-2 text-danger-primary"
        >
          <MinusCircle className="size-3.5 shrink-0" />
          <span>{t("issue.remove.parent.label")}</span>
        </CustomMenu.MenuItem>
      </CustomMenu>
    </div>
  );
});

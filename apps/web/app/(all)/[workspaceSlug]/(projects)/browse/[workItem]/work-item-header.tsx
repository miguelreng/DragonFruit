/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane ui
import { WorkItemsIcon } from "@/components/icons/propel-shim";
import { getIconButtonStyling } from "@plane/propel/icon-button";
import { Tooltip } from "@plane/propel/tooltip";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Breadcrumbs, FavoriteStar, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { IssueDetailQuickActions } from "@/components/issues/issue-detail/issue-detail-quick-actions";
// hooks
import { useFavorite } from "@/hooks/store/use-favorite";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

export const WorkItemDetailsHeader = observer(function WorkItemDetailsHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug, workItem } = useParams();
  // store hooks
  const { getProjectById, loader } = useProject();
  const {
    issue: { getIssueById, getIssueIdByIdentifier },
  } = useIssueDetail();
  const { entityMap: favoriteEntityMap, addFavorite, removeFavoriteEntity } = useFavorite();
  const { isMobile } = usePlatformOS();
  // derived values
  const issueId = getIssueIdByIdentifier(workItem?.toString());
  const issueDetails = issueId ? getIssueById(issueId.toString()) : undefined;
  const projectId = issueDetails ? issueDetails?.project_id : undefined;
  const projectDetails = projectId ? getProjectById(projectId?.toString()) : undefined;

  const issueIdString = issueId?.toString() ?? "";
  const isFavorite = !!favoriteEntityMap[issueIdString];

  // Mirrors the peek drawer's star (components/issues/peek-overview/header.tsx):
  // "issue" favorites carry the name twice — the top-level one is the server-side
  // fallback title if the task is deleted, entity_data.name feeds the optimistic
  // sidebar row.
  const handleToggleFavorite = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!workspaceSlug || !projectId || !issueIdString) return;
    try {
      if (isFavorite) await removeFavoriteEntity(workspaceSlug.toString(), issueIdString);
      else
        await addFavorite(workspaceSlug.toString(), {
          entity_type: "issue",
          entity_identifier: issueIdString,
          project_id: projectId.toString(),
          name: issueDetails?.name ?? "",
          entity_data: { name: issueDetails?.name ?? "" },
        });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: isFavorite ? "Task removed from favorites." : "Task added to favorites.",
      });
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: isFavorite ? "Task could not be removed from favorites." : "Task could not be added to favorites.",
      });
    }
  };

  if (!workspaceSlug || !projectId || !issueId) return null;
  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="Tasks"
                href={`/${workspaceSlug}/projects/${projectId}/issues/`}
                icon={<WorkItemsIcon className="h-4 w-4 text-tertiary" />}
              />
            }
          />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={projectDetails && issueDetails ? `${projectDetails.identifier}-${issueDetails.sequence_id}` : ""}
              />
            }
          />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem>
        {!issueDetails?.archived_at && (
          <Tooltip tooltipContent={isFavorite ? "Remove from favorites" : "Add to favorites"} isMobile={isMobile}>
            {/* Same chip as the copy-link and ⋯ buttons beside it (and as the peek drawer's star). */}
            <FavoriteStar
              selected={isFavorite}
              onClick={handleToggleFavorite}
              buttonClassName={getIconButtonStyling("secondary", "lg")}
            />
          </Tooltip>
        )}
        {projectId && issueId && (
          <IssueDetailQuickActions
            workspaceSlug={workspaceSlug?.toString()}
            projectId={projectId?.toString()}
            issueId={issueId?.toString()}
          />
        )}
      </Header.RightItem>
    </Header>
  );
});

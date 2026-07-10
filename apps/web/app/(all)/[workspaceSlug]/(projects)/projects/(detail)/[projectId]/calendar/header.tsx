/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// icons
import { Circle } from "@/components/icons/lucide-shim";
// plane imports
import {
  EUserPermissions,
  EUserPermissionsLevel,
  IS_FAVORITE_MENU_OPEN,
  SPACE_BASE_PATH,
  SPACE_BASE_URL,
  WORK_ITEM_TRACKER_ELEMENTS,
} from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { NewTabIcon } from "@/components/icons/propel-shim";
import { Tooltip } from "@plane/propel/tooltip";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
import { Breadcrumbs, FavoriteStar, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { HeaderFilters } from "@/components/issues/filters";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

export const ProjectCalendarHeader = observer(function ProjectCalendarHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { currentProjectDetails, loader, addProjectToFavorites, removeProjectFromFavorites } = useProject();
  const { toggleCreateIssueModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();
  const { isMobile } = usePlatformOS();

  const { setValue: toggleFavoriteMenu, storedValue: isFavoriteMenuOpen } = useLocalStorage<boolean>(
    IS_FAVORITE_MENU_OPEN,
    false
  );

  const handleToggleFavorite = async () => {
    if (!workspaceSlug || !projectId || !currentProjectDetails) return;
    if (currentProjectDetails.is_favorite) {
      await removeProjectFromFavorites(workspaceSlug.toString(), projectId.toString());
    } else {
      await addProjectToFavorites(workspaceSlug.toString(), projectId.toString(), EIssueLayoutTypes.CALENDAR);
      if (!isFavoriteMenuOpen) toggleFavoriteMenu(true);
    }
  };

  const SPACE_APP_URL = (SPACE_BASE_URL.trim() === "" ? window.location.origin : SPACE_BASE_URL) + SPACE_BASE_PATH;
  const publishedURL = `${SPACE_APP_URL}/issues/${currentProjectDetails?.anchor}`;

  const canUserCreateIssue = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-1.5">
          <Breadcrumbs onBack={() => router.back()} isLoading={loader === "init-loader"} className="flex-grow-0">
            <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink label="Calendar" href={`/${workspaceSlug}/projects/${projectId}/calendar/`} isLast />
              }
              isLast
            />
          </Breadcrumbs>
          {currentProjectDetails && (
            <Tooltip
              isMobile={isMobile}
              tooltipContent={currentProjectDetails.is_favorite ? "Remove from favorites" : "Add to favorites"}
              position="bottom"
            >
              <FavoriteStar
                buttonClassName="size-5"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleFavorite();
                }}
                selected={!!currentProjectDetails.is_favorite}
              />
            </Tooltip>
          )}
        </div>
        {currentProjectDetails?.anchor ? (
          <a
            href={publishedURL}
            className="group flex items-center gap-1.5 rounded-lg bg-accent-primary/10 px-2.5 py-1 text-11 font-medium text-accent-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Circle className="h-1.5 w-1.5 fill-accent-primary" strokeWidth={2} />
            {t("workspace_projects.network.public.title")}
            <NewTabIcon className="hidden h-3 w-3 group-hover:block" strokeWidth={2} />
          </a>
        ) : (
          <></>
        )}
      </Header.LeftItem>
      <Header.RightItem>
        <div className="hidden gap-2 md:flex">
          <HeaderFilters
            projectId={projectId}
            currentProjectDetails={currentProjectDetails}
            workspaceSlug={workspaceSlug}
            displayFiltersLayout={EIssueLayoutTypes.CALENDAR}
            showLayoutSelection={false}
          />
        </div>
        {canUserCreateIssue && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              toggleCreateIssueModal(true, EIssuesStoreType.PROJECT);
            }}
            data-ph-element={WORK_ITEM_TRACKER_ELEMENTS.HEADER_ADD_BUTTON.WORK_ITEMS}
          >
            <div className="block sm:hidden">{t("issue.label", { count: 1 })}</div>
            <div className="hidden sm:block">{t("issue.add.label")}</div>
          </Button>
        )}
      </Header.RightItem>
    </Header>
  );
});

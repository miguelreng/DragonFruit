/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// ui
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PanelRight } from "@/components/icons/lucide-shim";
import { useTranslation } from "@plane/i18n";
import { YourWorkIcon } from "@plane/propel/icons";
import type { IUserProfileProjectSegregation, TBaseIssue } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { isOpenIssue, useMyTasksData } from "@/components/home/sections/use-my-tasks";
import { ProfileIssuesFilter } from "@/components/profile/profile-issues-filter";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { Button } from "@plane/propel/button";

type TUserProfileHeader = {
  userProjectsData: IUserProfileProjectSegregation | undefined;
  type?: string | undefined;
  showProfileIssuesFilter?: boolean;
};

export const UserProfileHeader = observer(function UserProfileHeader(props: TUserProfileHeader) {
  const { userProjectsData, showProfileIssuesFilter } = props;
  const { workspaceSlug, userId } = useParams();
  // store hooks
  const { toggleProfileSidebar, profileSidebarCollapsed } = useAppTheme();
  const { data: currentUser } = useUser();
  const { workspaceUserInfo } = useUserPermissions();
  const { getStateById } = useProjectState();
  const { t } = useTranslation();

  // Open-task count, shared with the My tasks widget via the same SWR cache.
  const { data: myTasks } = useMyTasksData(workspaceSlug?.toString(), userId?.toString());
  const openTaskCount = (Array.isArray(myTasks?.results) ? (myTasks!.results as TBaseIssue[]) : []).filter((issue) =>
    isOpenIssue(issue, getStateById)
  ).length;

  if (!workspaceUserInfo) return null;

  const userName = `${userProjectsData?.user_data?.first_name} ${userProjectsData?.user_data?.last_name}`;

  const isCurrentUser = currentUser?.id === userId;

  const breadcrumbLabel = isCurrentUser ? t("profile.page_label") : `${userName} ${t("profile.work")}`;

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={breadcrumbLabel}
                disableTooltip
                icon={<YourWorkIcon className="h-4 w-4 text-tertiary" />}
              />
            }
          />
        </Breadcrumbs>
        {openTaskCount > 0 && (
          <span className="rounded-full bg-layer-2 px-1.5 py-px text-11 font-medium text-tertiary">
            {openTaskCount}
          </span>
        )}
      </Header.LeftItem>
      <Header.RightItem>
        <div className="hidden md:flex md:items-center">{showProfileIssuesFilter && <ProfileIssuesFilter />}</div>
        <div className="shrink-0 md:hidden">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              toggleProfileSidebar();
            }}
            appendIcon={
              <PanelRight className={!profileSidebarCollapsed ? "text-accent-primary" : "text-secondary"} />
            }
          ></Button>
        </div>
      </Header.RightItem>
    </Header>
  );
});

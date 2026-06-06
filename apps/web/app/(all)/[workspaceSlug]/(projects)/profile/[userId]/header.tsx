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
import type { IUserProfileProjectSegregation } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { ProfileIssuesFilter } from "@/components/profile/profile-issues-filter";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { Button } from "@plane/propel/button";

type TUserProfileHeader = {
  userProjectsData: IUserProfileProjectSegregation | undefined;
  type?: string | undefined;
  showProfileIssuesFilter?: boolean;
};

export const UserProfileHeader = observer(function UserProfileHeader(props: TUserProfileHeader) {
  const { userProjectsData, showProfileIssuesFilter } = props;
  const { userId } = useParams();
  // store hooks
  const { toggleProfileSidebar, profileSidebarCollapsed } = useAppTheme();
  const { data: currentUser } = useUser();
  const { workspaceUserInfo } = useUserPermissions();
  const { t } = useTranslation();

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

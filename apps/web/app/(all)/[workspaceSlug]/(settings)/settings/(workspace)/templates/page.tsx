/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// section components
import { ProjectTemplatesSection } from "@/components/settings/workspace/templates/project-templates-section";
import { WorkItemTemplatesSection } from "@/components/settings/workspace/templates/work-item-templates-section";
import { PageTemplatesSection } from "@/components/settings/workspace/templates/page-templates-section";
// local
import { TemplatesWorkspaceSettingsHeader } from "./header";

function TemplatesSettingsPage() {
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();
  const params = useParams();
  const workspaceSlug = String(params?.workspaceSlug ?? "");

  const canEdit = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const pageTitle = useMemo(
    () =>
      currentWorkspace?.name
        ? `${currentWorkspace.name} - ${t("workspace_settings.settings.templates.title")}`
        : undefined,
    [currentWorkspace?.name, t]
  );

  if (workspaceUserInfo && !canEdit) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<TemplatesWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className={cn("flex w-full flex-col gap-y-7", { "opacity-60": !canEdit })}>
        <PageTemplatesSection workspaceSlug={workspaceSlug} canEdit={canEdit} />

        {/* ── Task templates ── */}
        <WorkItemTemplatesSection workspaceSlug={workspaceSlug} canEdit={canEdit} />

        {/* ── Project templates ── */}
        <ProjectTemplatesSection workspaceSlug={workspaceSlug} canEdit={canEdit} />
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(TemplatesSettingsPage);

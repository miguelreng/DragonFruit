/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTheme } from "next-themes";
// plane imports
import { EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EUserProjectRoles } from "@plane/types";
// assets
import darkPagesAsset from "@/app/assets/empty-state/disabled-feature/pages-dark.webp?url";
import lightPagesAsset from "@/app/assets/empty-state/disabled-feature/pages-light.webp?url";
// components
import { Whiteboard } from "@/components/icons/lucide-shim";
import { PageHead } from "@/components/core/page-title";
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
import { WorkspaceDocsRoot } from "@/components/docs/workspace-docs-root";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import type { Route } from "./+types/page";

function ProjectWhiteboardsPage({ params }: Route.ComponentProps) {
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = params;
  // theme hook
  const { resolvedTheme } = useTheme();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getProjectById, currentProjectDetails } = useProject();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project?.name} - Whiteboards` : undefined;
  const canPerformEmptyStateActions = allowPermissions([EUserProjectRoles.ADMIN], EUserPermissionsLevel.PROJECT);
  const resolvedPath = resolvedTheme === "light" ? lightPagesAsset : darkPagesAsset;

  if (currentProjectDetails?.page_view === false)
    return (
      <div className="flex h-full w-full items-center justify-center">
        <DetailedEmptyState
          title={t("disabled_project.empty_state.page.title")}
          description={t("disabled_project.empty_state.page.description")}
          assetPath={resolvedPath}
          primaryButton={{
            text: t("disabled_project.empty_state.page.primary_button.text"),
            onClick: () => {
              router.push(`/${workspaceSlug}/settings/projects/${projectId}/features`);
            },
            disabled: !canPerformEmptyStateActions,
          }}
        />
      </div>
    );

  // Same component as the Docs tab (same grid cards + header), scoped to
  // whiteboards. `pageType` makes the create button default to whiteboards.
  return (
    <>
      <PageHead title={pageTitle} />
      <WorkspaceDocsRoot
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        pageType="whiteboard"
        pageTypes={["whiteboard"]}
        headerLabel="Whiteboards"
        headerIcon={<Whiteboard className="h-4 w-4 text-tertiary" />}
        labels={{
          emptyTitle: "No whiteboards yet",
          emptyDescription: "Use the New button to create your first whiteboard.",
        }}
      />
    </>
  );
}

export default observer(ProjectWhiteboardsPage);

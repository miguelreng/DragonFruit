/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { Outlet } from "react-router";
// components
import { TabNavigationRoot } from "@/components/navigation/tab-navigation-root";
import { AppRailExpandToggle } from "@/components/sidebar/app-rail-expand-toggle";
// hooks
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";
// layouts
import { ProjectAuthWrapper } from "@/layouts/auth-layout/project-wrapper";
// local imports
import type { Route } from "./+types/layout";

function ProjectLayout({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug, projectId } = params;
  const pathname = usePathname();
  // preferences
  const { preferences: projectPreferences } = useProjectNavigationPreferences();

  // A doc/page detail is a single-item view, so it runs in "focus mode": no tab
  // band and no recessed sheet, the same flat shell accordion mode uses. The
  // page's own header is the only chrome; section nav stays in the breadcrumb +
  // left rail. (Cycle/module/view "details" are filtered lists, so they keep the
  // tab band.)
  const isFocusedDetail = /\/projects\/[^/]+\/pages\/[^/]+/.test(pathname);

  // Accordion mode (and focused detail) keep the original flat layout (no tab band).
  if (projectPreferences.navigationMode !== "TABBED" || isFocusedDetail) {
    return (
      <ProjectAuthWrapper workspaceSlug={workspaceSlug} projectId={projectId}>
        <Outlet />
      </ProjectAuthWrapper>
    );
  }

  // Tabbed mode: a recessed band holds the folder tabs; the body is a rounded
  // white sheet the active tab fuses into, with the band colour showing through
  // the body's top corners.
  return (
    <div className="flex h-full flex-col overflow-hidden bg-layer-3">
      {/* Compact 40px folder tabs (h-10), nudged down (mt-2) so the tab labels
          still center on the shared 28px header baseline while the tabs stay
          short and fused to the body below. The folder shape's height tracks
          this band's height (outerRect.height), so the band height IS the tab
          height — keep them compact via h-10, align via mt-2. */}
      <div className="z-20 mt-2 flex h-10 w-full shrink-0 items-center gap-2 px-page-x">
        <AppRailExpandToggle withDivider />
        <div className="flex h-full min-w-0 flex-1 items-center">
          <TabNavigationRoot workspaceSlug={workspaceSlug} projectId={projectId} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-t-2xl bg-surface-1">
        <ProjectAuthWrapper workspaceSlug={workspaceSlug} projectId={projectId}>
          <Outlet />
        </ProjectAuthWrapper>
      </div>
    </div>
  );
}

export default observer(ProjectLayout);

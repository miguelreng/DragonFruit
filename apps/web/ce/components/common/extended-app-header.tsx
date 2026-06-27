/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { IconButton } from "@plane/propel/icon-button";
// components
import { PanelLeft } from "@/components/icons/lucide-shim";
import { AppRailExpandToggle } from "@/components/sidebar/app-rail-expand-toggle";
// hooks
import { useAppRailVisibility } from "@/lib/app-rail";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";

export const ExtendedAppHeader = observer(function ExtendedAppHeader(props: { header: ReactNode }) {
  const { header } = props;
  // params
  const { projectId, workItem, pageId } = useParams();
  // preferences
  const { preferences: projectPreferences } = useProjectNavigationPreferences();
  // store hooks
  const { openMobileDrawer } = useAppRailVisibility();
  // derived values
  // Single-item detail pages (a work item, a doc/page) run in "focus mode" —
  // their tab band is removed, so the rail toggle relocates here, into the
  // item's own header, instead.
  const shouldShowSidebarToggleButton =
    projectPreferences.navigationMode === "ACCORDION" || (!projectId && !workItem) || !!workItem || !!pageId;

  return (
    <>
      {/* Mobile-only trigger for the slide-over navigation drawer. */}
      <IconButton
        size="base"
        variant="ghost"
        icon={PanelLeft}
        onClick={openMobileDrawer}
        aria-label="Open navigation"
        className="md:hidden"
      />
      {/* When the rail is collapsed to icons, its expand toggle relocates here, to
          the left of the page title. In tabbed project mode the folder-tab band
          hosts it instead, so skip it here to avoid a duplicate. The trailing
          divider only earns its keep when there's a title beside it (e.g. a focus
          page) — on the title-less home header it would dangle into empty space.
          `h-14` makes the toggle carry the shared 56px header baseline (centerline
          28px) so it lines up with every other header's toggle even on the home
          header, whose row is otherwise collapsed (min-h-0) to avoid a ghost bar
          when the rail is expanded and no toggle renders. */}
      {shouldShowSidebarToggleButton && <AppRailExpandToggle withDivider={!!header} className="h-14" />}
      <div className="w-full">{header}</div>
    </>
  );
});

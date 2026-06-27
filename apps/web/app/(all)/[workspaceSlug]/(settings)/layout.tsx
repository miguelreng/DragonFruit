/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
// components
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProjectsAppPowerKProvider } from "@/components/power-k/projects-app-provider";
import { AppRailExpandToggle } from "@/components/sidebar/app-rail-expand-toggle";

export default function SettingsLayout() {
  return (
    <>
      <ProjectsAppPowerKProvider />
      <div className="relative flex size-full overflow-hidden rounded-lg border border-subtle">
        <main className="relative flex size-full flex-col overflow-hidden">
          {/* Settings has no page header, so the collapsed app rail's expand
              toggle has nowhere to relocate. Dock it at the top-left here. */}
          <AppRailExpandToggle className="shrink-0 px-3 pt-3 pb-1" />
          {/* Content */}
          <div className="min-h-0 flex-1">
            <ContentWrapper className="w-full bg-surface-1 md:flex">
              <div className="size-full overflow-hidden">
                <Outlet />
              </div>
            </ContentWrapper>
          </div>
        </main>
      </div>
    </>
  );
}

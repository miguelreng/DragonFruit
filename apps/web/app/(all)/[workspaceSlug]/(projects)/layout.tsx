/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { Outlet } from "react-router";
import { WikiExplainListener } from "@/components/editor/wiki-explain-listener";
import { WikiToolsListener } from "@/components/editor/wiki-tools-listener";
import { ProjectsAppPowerKProvider } from "@/components/power-k/projects-app-provider";

function WorkspaceLayout() {
  const pathname = usePathname();
  // Fade the page content in when navigating between top-level sections (the
  // sidebar menu items). Keyed on the section segment — not the full path — so
  // switching tabs or moving within a section doesn't remount/refetch the page;
  // only genuine section changes replay the fade. Opacity-only (no transform)
  // so it never establishes a containing block over fixed/absolute overlays.
  const section = pathname?.split("/")[2] ?? "home";
  return (
    <>
      <ProjectsAppPowerKProvider />
      <div className="shadow-sm t-resize relative flex h-full w-full flex-col overflow-hidden rounded-[18px] bg-surface-1">
        <div id="full-screen-portal" className="absolute inset-0 w-full" />
        <div className="relative flex size-full gap-2 overflow-hidden">
          <main className="relative flex h-full w-full flex-col overflow-hidden bg-surface-1">
            <WikiExplainListener />
            <WikiToolsListener />
            <div key={section} className="animate-fade-in flex h-full w-full flex-col overflow-hidden">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

export default observer(WorkspaceLayout);

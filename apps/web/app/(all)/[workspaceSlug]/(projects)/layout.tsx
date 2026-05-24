/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Outlet } from "react-router";
import { AgentDispatchListener } from "@/components/agent/agent-dispatch-listener";
import { ProjectsAppPowerKProvider } from "@/components/power-k/projects-app-provider";

function WorkspaceLayout() {
  return (
    <>
      <ProjectsAppPowerKProvider />
      <AgentDispatchListener />
      <div className="shadow-sm t-resize relative flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-subtle bg-surface-1">
        <div id="full-screen-portal" className="absolute inset-0 w-full" />
        <div className="relative flex size-full gap-2 overflow-hidden">
          <main className="relative flex h-full w-full flex-col overflow-hidden bg-surface-1">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}

export default observer(WorkspaceLayout);

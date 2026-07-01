/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Outlet } from "react-router";
// components
import { AppHeader } from "@/components/core/app-header";
// local components
import { WorkflowsHeader } from "./header";

function WorkflowsLayout() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <AppHeader header={<WorkflowsHeader />} />
      {/* Full-height builder — the canvas + inspector manage their own scroll. */}
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

export default observer(WorkflowsLayout);

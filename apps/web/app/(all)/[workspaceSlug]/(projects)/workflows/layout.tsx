/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Outlet } from "react-router";

// The AppHeader lives inside WorkflowsRoot (docs pattern) so the gallery can
// put its count + create CTA in the header and the builder its breadcrumb.
function WorkflowsLayout() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <Outlet />
    </div>
  );
}

export default observer(WorkflowsLayout);

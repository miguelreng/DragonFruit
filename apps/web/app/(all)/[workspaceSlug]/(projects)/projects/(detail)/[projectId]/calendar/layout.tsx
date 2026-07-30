/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";

// CalendarRoot renders its own AppHeader toolbar (shared with the workspace
// calendar), so this layout doesn't add a second one.
export default function ProjectCalendarLayout() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface-1">
      <Outlet />
    </div>
  );
}

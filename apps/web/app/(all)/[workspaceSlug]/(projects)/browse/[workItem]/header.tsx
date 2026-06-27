/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { AppHeader } from "@/components/core/app-header";
// local components
import { WorkItemDetailsHeader } from "./work-item-header";

/**
 * A work item is a single-item detail view, so it runs in "focus mode": the
 * project tab band is dropped and the work item's own header (breadcrumb back to
 * Tasks + actions) is the only top strip. Section navigation stays available via
 * that breadcrumb and the left app rail; when the rail is collapsed its expand
 * toggle relocates into this header (see ExtendedAppHeader).
 */
export const ProjectWorkItemDetailsHeader = observer(function ProjectWorkItemDetailsHeader() {
  return <AppHeader header={<WorkItemDetailsHeader />} />;
});

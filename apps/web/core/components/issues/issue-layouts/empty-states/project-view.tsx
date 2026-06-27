/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { EmptyStateIcon } from "@/components/empty-state/empty-state-icon";

export const ProjectViewEmptyState = observer(function ProjectViewEmptyState() {
  return (
    // TODO: Add translation
    <EmptyStateDetailed
      asset={<EmptyStateIcon name="tasks" />}
      title="View tasks will appear here"
      description="Tasks help you track individual pieces of work. With tasks, keep track of what's going on, who is working on it, and what's done."
    />
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
// plane imports
import { PROJECT_TRACKER_ELEMENTS } from "@dragonfruit/constants";
import { Button, getButtonStyling } from "@dragonfruit/propel/button";
import { cn } from "@dragonfruit/utils";
// components
import { EmptyStateIcon } from "@/components/empty-state/empty-state-icon";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";

function ProjectSettingsPage() {
  // store hooks
  const { toggleCreateProjectModal } = useCommandPalette();
  // derived values
  return (
    <div className="mx-auto flex h-full max-w-[480px] flex-col items-center justify-center gap-4">
      <EmptyStateIcon name="projects" />
      <div className="text-16 font-semibold text-tertiary">No projects yet</div>
      <div className="text-center text-13 text-tertiary">
        Projects act as the foundation for goal-driven work. They let you manage your teams, tasks, and everything you
        need to get things done.
      </div>
      <div className="flex gap-2">
        <Link href="https://plane.so/" target="_blank" className={cn(getButtonStyling("secondary", "base"))}>
          Learn more about projects
        </Link>
        <Button
          onClick={() => toggleCreateProjectModal(true)}
          data-ph-element={PROJECT_TRACKER_ELEMENTS.EMPTY_STATE_CREATE_PROJECT_BUTTON}
        >
          Start your first project
        </Button>
      </div>
    </div>
  );
}

export default observer(ProjectSettingsPage);

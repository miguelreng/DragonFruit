/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
// plane helpers
import { useOutsideClickDetector } from "@plane/hooks";
import { ScrollArea } from "@plane/propel/scrollarea";
// components
import { WorkspaceMenuRoot } from "@/components/workspace/sidebar/workspace-menu-root";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import useSize from "@/hooks/use-window-size";
import { AppSidebarToggleButton } from "./sidebar-toggle-button";

type TSidebarWrapperProps = {
  title: string;
  children: React.ReactNode;
  quickActions?: React.ReactNode;
};

export const SidebarWrapper = observer(function SidebarWrapper(props: TSidebarWrapperProps) {
  const { children, quickActions } = props;
  // store hooks
  const { toggleSidebar, sidebarCollapsed } = useAppTheme();
  const windowSize = useSize();
  // refs
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClickDetector(ref, () => {
    if (sidebarCollapsed === false && window.innerWidth < 768) {
      toggleSidebar();
    }
  });

  useEffect(() => {
    if (windowSize[0] < 768 && !sidebarCollapsed) toggleSidebar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSize]);

  return (
    <>
      <div ref={ref} className="flex h-full w-full animate-fade-in flex-col">
        {/* Workspace switcher row — matches the page AppHeader (h-11, border-b) so the
            two header strips sit on the same baseline across the sidebar/content seam. */}
        <div className="flex h-11 w-full flex-shrink-0 items-center gap-1 border-b border-subtle pl-0 pr-3">
          <WorkspaceMenuRoot variant="top-navigation" />
          <div className="flex flex-shrink-0 items-center gap-2">
            <AppSidebarToggleButton />
          </div>
        </div>
        {/* Quick actions */}
        {quickActions && <div className="flex flex-col gap-3 px-3 pt-3">{quickActions}</div>}

        <ScrollArea
          orientation="vertical"
          scrollType="hover"
          size="sm"
          rootClassName="size-full overflow-x-hidden overflow-y-auto"
          viewportClassName="flex flex-col gap-3 overflow-x-hidden h-full w-full overflow-y-auto px-3 pt-3 pb-0.5"
        >
          {children}
        </ScrollArea>
      </div>
    </>
  );
});

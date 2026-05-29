/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
// plane helpers
import { useOutsideClickDetector } from "@plane/hooks";
import { ScrollArea } from "@plane/propel/scrollarea";
import { cn } from "@plane/utils";
// components
import { Settings } from "@/components/icons/lucide-shim";
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
  // routing
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
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

  const slug = workspaceSlug?.toString() ?? "";
  const settingsHref = `/${slug}/settings/`;
  // Highlight whenever the user is anywhere under /settings/* — workspace
  // general, members, agents, mcp, etc. all count as "in settings".
  const isSettingsActive = !!slug && pathname?.startsWith(`/${slug}/settings`);

  return (
    <div ref={ref} className="flex h-full w-full animate-fade-in flex-col">
      {/* Workspace switcher row — matches the page AppHeader (h-11, border-b) so the
          two header strips sit on the same baseline across the sidebar/content seam. */}
      <div className="flex h-11 w-full flex-shrink-0 items-center gap-1 border-b border-subtle pr-3 pl-0">
        <WorkspaceMenuRoot variant="top-navigation" />
        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          <AppSidebarToggleButton />
        </div>
      </div>
      {/* Quick actions */}
      {quickActions && <div className="flex flex-col gap-3 px-3 pt-3">{quickActions}</div>}

      <ScrollArea
        orientation="vertical"
        scrollType="hover"
        size="sm"
        rootClassName="flex-1 min-h-0 overflow-x-hidden overflow-y-auto"
        viewportClassName="flex flex-col gap-3 overflow-x-hidden h-full w-full overflow-y-auto px-3 pt-3 pb-0.5"
      >
        {children}
      </ScrollArea>

      {/* Fixed footer pinned to the bottom of the sidebar. The
          ScrollArea above takes `flex-1` so this strip never scrolls
          away — it's always one click from anywhere in the app. */}
      <div className="flex flex-shrink-0 items-center border-t border-subtle px-3 py-2">
        <Link
          href={settingsHref}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 transition-colors outline-none",
            isSettingsActive
              ? "bg-[#fff7f8] text-primary dark:bg-danger-subtle"
              : "text-secondary hover:bg-[#fffafb] active:bg-[#fff7f8] dark:hover:bg-danger-subtle-hover dark:active:bg-danger-subtle-active"
          )}
          aria-label="Workspace settings"
          aria-current={isSettingsActive ? "page" : undefined}
        >
          <Settings className="size-4 flex-shrink-0" />
          <span className="text-13 font-medium">Settings</span>
        </Link>
      </div>
    </div>
  );
});

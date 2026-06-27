/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import {
  AgentChatDrawer,
  REPLY_TO_SELECTION_EVENT,
  setPendingReplyContext,
  type ReplyToSelectionDetail,
} from "@/components/agent-chat";
import { cn } from "@plane/utils";
import { AppRailRoot, MobileRailDrawer } from "@/components/navigation";
import { ScrollShadowController } from "@/components/core/scroll-shadow-controller";
import { PanelRight } from "@/components/icons/lucide-shim";
import { isTypingInInput } from "@/components/power-k/core/shortcut-handler";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import useSize from "@/hooks/use-window-size";
import { useAppRailVisibility } from "@/lib/app-rail";

// Matches Tailwind's `md` breakpoint — below this the rail becomes a drawer.
const MOBILE_BREAKPOINT = 768;

export const WorkspaceContentWrapper = observer(function WorkspaceContentWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use the context to determine if app rail should render
  const {
    isEnabled: isAppRailEnabled,
    isMobileDrawerOpen,
    openMobileDrawer,
    closeMobileDrawer,
  } = useAppRailVisibility();
  const { agentChatOpen, toggleAgentChat, atlasSidebarCollapsed, toggleAtlasSidebar } = useAppTheme();
  const [windowWidth] = useSize();
  const pathname = usePathname();
  const isMobile = windowWidth < MOBILE_BREAKPOINT;

  // Close the drawer whenever the route changes so navigating away dismisses it.
  useEffect(() => {
    if (isMobileDrawerOpen) closeMobileDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Cmd/Ctrl+Shift+A toggles the docked Atlas sidebar.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (typeof event.key !== "string" || isTypingInInput(event.target)) return;

      const isAskAtlasShortcut = (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "a";
      if (!isAskAtlasShortcut) return;

      event.preventDefault();
      // Desktop: Atlas is permanently docked, so the shortcut collapses it to a
      // rail / expands it back. Mobile: it opens the dismissible overlay.
      if (window.innerWidth >= MOBILE_BREAKPOINT) {
        toggleAtlasSidebar();
      } else {
        toggleAgentChat(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleAgentChat, toggleAtlasSidebar]);

  // Editor → Atlas bridges. The page editor lives in `packages/editor` and
  // can't reach the host stores, so it dispatches window events: "reply to
  // selection" (bubble menu) pins the highlighted passage as context, and the
  // `/agent` slash command just opens Atlas. Both live here (always mounted)
  // because the drawer mounts lazily and would miss the event that opens it.
  useEffect(() => {
    const onReplyToSelection = (event: Event) => {
      const detail = (event as CustomEvent<ReplyToSelectionDetail>).detail;
      if (!detail?.text) return;
      setPendingReplyContext({ text: detail.text, from: detail.from, to: detail.to });
      toggleAgentChat(true);
    };
    const onAgentInvoke = () => toggleAgentChat(true);
    window.addEventListener(REPLY_TO_SELECTION_EVENT, onReplyToSelection);
    window.addEventListener("dragonfruit:agent-invoke", onAgentInvoke);
    return () => {
      window.removeEventListener(REPLY_TO_SELECTION_EVENT, onReplyToSelection);
      window.removeEventListener("dragonfruit:agent-invoke", onAgentInvoke);
    };
  }, [toggleAgentChat]);

  return (
    <div className="bg-gray-200 relative flex size-full gap-2 overflow-hidden p-2 transition-all duration-300 ease-in-out">
      <ScrollShadowController />
      {isAppRailEnabled &&
        (isMobile ? (
          <MobileRailDrawer open={isMobileDrawerOpen} onOpen={openMobileDrawer} onClose={closeMobileDrawer}>
            <AppRailRoot isMobile />
          </MobileRailDrawer>
        ) : (
          <AppRailRoot />
        ))}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative flex size-full min-h-0 gap-0.5 overflow-hidden">
          <div className="shadow-sm relative min-h-0 flex-grow overflow-hidden rounded-[18px] border border-subtle bg-surface-1 transition-all duration-300 ease-in-out">
            {children}
          </div>
          {agentChatOpen && (
            <div
              className={cn(
                "shadow-sm absolute top-0 right-0 z-30 h-full overflow-hidden rounded-[18px] border border-subtle bg-surface-1 shadow-raised-300",
                "w-[min(560px,calc(100%-24px))]",
                // Desktop: docked sibling of the content. Collapses to a slim
                // rail with the same width curve as the left app rail (250ms,
                // standard ease) — the panel reveals/hides as the width animates.
                "md:relative md:z-auto md:flex-shrink-0 md:shadow-sm md:transition-[width] md:duration-[250ms] md:ease-[cubic-bezier(0.22,1,0.36,1)]",
                atlasSidebarCollapsed ? "md:w-[3.25rem]" : "md:w-[350px]"
              )}
              data-open="true"
              // Stable hook for focus (zen) mode: globals.css lifts the open
              // drawer above the zen canvas, and the editor's Esc handler
              // skips exiting while focus is inside it.
              data-atlas-drawer="true"
            >
              {/* The drawer stays mounted across collapse, so expanding is a
                  pure width reveal (matching the left rail) with no entrance
                  replay and the chat state preserved. It keeps its full width
                  so it doesn't reflow while the container animates; the rail
                  overlay covers the clipped panel while collapsed. */}
              <div
                className={cn(
                  "h-full w-full md:w-[350px]",
                  // Covered by the rail while collapsed — `invisible` also pulls
                  // the chat controls out of the tab order / a11y tree.
                  atlasSidebarCollapsed && !isMobile && "pointer-events-none invisible"
                )}
                aria-hidden={atlasSidebarCollapsed && !isMobile ? true : undefined}
              >
                <AgentChatDrawer
                  dismissible={isMobile}
                  onCollapse={isMobile ? undefined : () => toggleAtlasSidebar(true)}
                />
              </div>
              {atlasSidebarCollapsed && !isMobile && (
                <AtlasSidebarRail onExpand={() => toggleAtlasSidebar(false)} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Collapsed Atlas sidebar — a slim, full-height rail that expands the panel
 * back on click (accordion-style). The same sidebar-toggle icon used to
 * collapse sits up top; the brand mark anchors the bottom. The whole rail is
 * one large click target.
 */
function AtlasSidebarRail({ onExpand }: { onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label="Expand Atlas"
      title="Expand Atlas"
      className="t-press group absolute inset-0 z-10 flex flex-col items-center bg-surface-1 pb-3 text-tertiary"
    >
      {/* Toggle sits in a 56px zone so its centerline (28px) matches the
          expanded Atlas header baseline — no vertical jump on expand. */}
      <span className="flex h-14 items-center">
        <span className="grid size-7 place-items-center rounded-md transition-colors group-hover:bg-layer-1 group-hover:text-secondary">
          <PanelRight className="size-4" />
        </span>
      </span>
      <span className="mt-auto grid size-9 place-items-center">
        <img src="/atlas-dragon.svg" alt="Atlas" className="size-5 dark:invert" />
      </span>
    </button>
  );
}

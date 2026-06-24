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
import { AppRailRoot, MobileRailDrawer } from "@/components/navigation";
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
  const { agentChatOpen, toggleAgentChat } = useAppTheme();
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
      // Open-only: Atlas is a permanent docked sidebar and is never closed via
      // the shortcut (on mobile it opens the overlay).
      toggleAgentChat(true);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleAgentChat]);

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
      {isAppRailEnabled &&
        (isMobile ? (
          <MobileRailDrawer open={isMobileDrawerOpen} onOpen={openMobileDrawer} onClose={closeMobileDrawer}>
            <AppRailRoot isMobile />
          </MobileRailDrawer>
        ) : (
          <AppRailRoot />
        ))}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative flex size-full min-h-0 gap-2 overflow-hidden">
          <div className="shadow-sm relative min-h-0 flex-grow overflow-hidden rounded-[18px] border border-subtle bg-surface-1 transition-all duration-300 ease-in-out">
            {children}
          </div>
          {agentChatOpen && (
            <div
              className="shadow-sm t-panel-slide is-open absolute top-0 right-0 z-30 h-full w-[min(560px,calc(100%-24px))] overflow-hidden rounded-[18px] border border-subtle bg-surface-1 shadow-raised-300 transition-all duration-300 ease-in-out md:relative md:z-auto md:w-[400px] md:flex-shrink-0 md:shadow-sm"
              data-open="true"
              // Stable hook for focus (zen) mode: globals.css lifts the open
              // drawer above the zen canvas, and the editor's Esc handler
              // skips exiting while focus is inside it.
              data-atlas-drawer="true"
            >
              <AgentChatDrawer dismissible={isMobile} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

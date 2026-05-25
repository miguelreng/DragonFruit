/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useEffect } from "react";
import { observer } from "mobx-react";
import { Sparkles } from "@/components/icons/lucide-shim";
import { AgentChatDrawer } from "@/components/agent-chat";
import { AppRailRoot } from "@/components/navigation";
import { isTypingInInput } from "@/components/power-k/core/shortcut-handler";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useAppRailVisibility } from "@/lib/app-rail";
import { IconButton } from "@plane/propel/icon-button";
import { Tooltip } from "@plane/propel/tooltip";

export const WorkspaceContentWrapper = observer(function WorkspaceContentWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use the context to determine if app rail should render
  const { isEnabled: isAppRailEnabled } = useAppRailVisibility();
  const { agentChatOpen, toggleAgentChat } = useAppTheme();

  const openAgentChat = useCallback(() => {
    toggleAgentChat(true);
  }, [toggleAgentChat]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (typeof event.key !== "string" || isTypingInInput(event.target)) return;

      const isAskCopilotShortcut =
        (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "a";
      if (!isAskCopilotShortcut) return;

      event.preventDefault();
      openAgentChat();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openAgentChat]);

  return (
    <div className="bg-gray-200 relative flex size-full gap-2 overflow-hidden p-2 transition-all duration-300 ease-in-out">
      {isAppRailEnabled && <AppRailRoot />}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative flex size-full min-h-0 gap-2 overflow-hidden">
          <div className="shadow-sm relative min-h-0 flex-grow overflow-hidden rounded-[18px] border border-subtle bg-surface-1 transition-all duration-300 ease-in-out">
            {children}
          </div>
          {agentChatOpen && (
            <div className="shadow-sm min-[1920px]:shadow-sm absolute top-0 right-0 z-30 h-full w-[min(560px,calc(100%-24px))] overflow-hidden rounded-[18px] border border-subtle bg-surface-1 shadow-raised-300 transition-all duration-300 ease-in-out min-[1920px]:relative min-[1920px]:z-auto min-[1920px]:w-[420px] min-[1920px]:flex-shrink-0">
              <AgentChatDrawer />
            </div>
          )}
          {!agentChatOpen && (
            <div className="absolute right-4 bottom-4 z-20">
              <Tooltip tooltipContent="Ask Copilot (Cmd+Shift+A)" position="left">
                <IconButton
                  type="button"
                  variant="secondary"
                  size="xl"
                  icon={Sparkles}
                  aria-label="Ask Copilot"
                  aria-keyshortcuts="Meta+Shift+A Control+Shift+A"
                  onClick={openAgentChat}
                  className="size-10 rounded-full border-strong bg-layer-2 text-accent-primary shadow-raised-300 hover:bg-layer-2-hover hover:text-accent-secondary"
                  iconClassName="size-4"
                />
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

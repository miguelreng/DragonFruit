/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { AgentChatDrawer } from "@/components/agent-chat";
import { AppRailRoot } from "@/components/navigation";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useAppRailVisibility } from "@/lib/app-rail";

export const WorkspaceContentWrapper = observer(function WorkspaceContentWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use the context to determine if app rail should render
  const { isEnabled: isAppRailEnabled } = useAppRailVisibility();
  const { agentChatOpen } = useAppTheme();

  return (
    <div className="bg-gray-200 relative flex size-full gap-2 overflow-hidden p-2 transition-all duration-300 ease-in-out">
      {isAppRailEnabled && <AppRailRoot />}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative flex size-full min-h-0 gap-2 overflow-hidden">
          <div className="shadow-sm relative min-h-0 flex-grow overflow-hidden rounded-[18px] border border-subtle bg-surface-1 transition-all duration-300 ease-in-out">
            {children}
          </div>
          {agentChatOpen && (
            <div className="shadow-sm flex-shrink-0 overflow-hidden rounded-[18px] border border-subtle bg-surface-1 transition-all duration-300 ease-in-out">
              <AgentChatDrawer />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// plane imports
import { cn } from "@plane/utils";
import { AgentChatDrawer } from "@/components/agent-chat";
import { AppRailRoot } from "@/components/navigation";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useAppRailVisibility } from "@/lib/app-rail";
// local imports
import { TopNavigationRoot } from "../navigations";

export const WorkspaceContentWrapper = observer(function WorkspaceContentWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use the context to determine if app rail should render
  const { shouldRenderAppRail } = useAppRailVisibility();
  // The "Talk to AI" panel lives here, as a sibling of the main
  // content area — *inside* the dark `#1c1c1e` frame but outside the
  // brown content container. That makes the dark frame show through
  // as a horizontal gap between the two, the same way `pr-2` already
  // creates the right-edge gap on the main content.
  const { agentChatOpen } = useAppTheme();

  return (
    <div className="relative flex size-full flex-col overflow-hidden bg-[#1c1c1e] transition-all duration-300 ease-in-out">
      <TopNavigationRoot />
      <div className="relative flex size-full overflow-hidden">
        {/* Conditionally render AppRailRoot based on context */}
        {shouldRenderAppRail && <AppRailRoot />}
        <div
          className={cn(
            "relative size-full flex-grow overflow-hidden pr-2 pb-2 pl-2 transition-all duration-300 ease-in-out",
            {
              "pl-0!": shouldRenderAppRail,
            }
          )}
        >
          {/* Main brown/warm content surface. Its `pr-2` becomes the
              horizontal gap to the AI panel when the panel is open —
              the dark frame between them shows through that padding. */}
          {children}
        </div>
        {/* Right-side AI panel. Fixed width column; the main content
            above is `flex-grow` so it shrinks to make room without
            covering anything. The panel's outer wrapper carries the
            same `pb-2 pr-2` gap as the content area so the dark
            frame border shows through identically on all sides. */}
        {agentChatOpen && (
          <div className="flex-shrink-0 pr-2 pb-2 transition-all duration-300 ease-in-out">
            <AgentChatDrawer />
          </div>
        )}
      </div>
    </div>
  );
});

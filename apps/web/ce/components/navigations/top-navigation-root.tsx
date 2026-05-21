/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { observer } from "mobx-react";
import { Link } from "react-router";
import { useParams } from "next/navigation";
import { cn } from "@plane/utils";
import { Sparkles } from "@/components/icons/lucide-shim";
import { TopNavPowerK } from "@/components/navigation";
import { HelpMenuRoot } from "@/components/workspace/sidebar/help-section/root";
import { UserMenuRoot } from "@/components/workspace/sidebar/user-menu-root";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useAppRailPreferences } from "@/hooks/use-navigation-preferences";
import { NotificationsBell } from "./notifications-bell";
import dragonfruitLogoWhite from "@/app/assets/plane-logos/logo-white.svg?url";
export const TopNavigationRoot = observer(function TopNavigationRoot() {
  // router
  const { workspaceSlug } = useParams();
  // The top bar is always dark in both light and dark page themes, so the
  // logo is always the white variant. See `use-top-bar-theme.ts`.

  // store hooks
  const { preferences } = useAppRailPreferences();
  const { agentChatOpen, toggleAgentChat } = useAppTheme();

  const showLabel = preferences.displayMode === "icon_with_label";

  return (
    <div
      className={cn(
        "z-[27] flex min-h-10 w-full items-center bg-[#1c1c1e] px-3.5 text-white/80 transition-all duration-300",
        {
          "px-2": !showLabel,
        }
      )}
    >
      {/* DragonFruit logo */}
      <div className="flex flex-1 shrink-0 items-center">
        <Link
          to={`/${workspaceSlug?.toString() ?? ""}/`}
          className="inline-flex items-center"
          aria-label="DragonFruit home"
        >
          <img src={dragonfruitLogoWhite} alt="DragonFruit" className="h-6 w-auto" />
        </Link>
      </div>
      {/* Power K Search */}
      <div className="shrink-0">
        <TopNavPowerK />
      </div>
      {/* Additional Actions */}
      <div className="flex flex-1 shrink-0 items-center justify-end gap-1">
        {/* Talk to AI — toggles the right-side panel that sits as a
            sibling of the main content (rendered in WorkspaceContentWrapper).
            Active state highlights so the user can see the toggle is on. */}
        <button
          type="button"
          onClick={() => toggleAgentChat()}
          aria-label="Talk to AI"
          title="Talk to AI"
          aria-pressed={agentChatOpen}
          className={cn(
            "flex size-8 items-center justify-center rounded-md hover:bg-white/10",
            agentChatOpen && "bg-white/10 text-white"
          )}
        >
          <Sparkles className="size-4" />
        </button>
        <NotificationsBell />
        <HelpMenuRoot />
        <div className="flex size-8 items-center justify-center rounded-md hover:bg-white/10">
          <UserMenuRoot />
        </div>
      </div>
    </div>
  );
});

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
import { TopNavPowerK } from "@/components/navigation";
import { HelpMenuRoot } from "@/components/workspace/sidebar/help-section/root";
import { UserMenuRoot } from "@/components/workspace/sidebar/user-menu-root";
import { useAppRailPreferences } from "@/hooks/use-navigation-preferences";
import { useTopBarTheme } from "@/hooks/use-top-bar-theme";
import { NotificationsBell } from "./notifications-bell";
import dragonfruitLogoLight from "@/app/assets/plane-logos/logo.svg?url";
import dragonfruitLogoWhite from "@/app/assets/plane-logos/logo-white.svg?url";
export const TopNavigationRoot = observer(function TopNavigationRoot() {
  // router
  const { workspaceSlug } = useParams();
  // theme — frame inverts the page theme; logo follows
  const topBarTheme = useTopBarTheme();
  const isFrameDark = topBarTheme === "dark";
  const logoSrc = isFrameDark ? dragonfruitLogoWhite : dragonfruitLogoLight;

  // store hooks
  const { preferences } = useAppRailPreferences();

  const showLabel = preferences.displayMode === "icon_with_label";

  return (
    <div
      className={cn(
        "z-[27] flex min-h-10 w-full items-center bg-[#1c1c1e] px-3.5 text-white/80 transition-all duration-300 dark:bg-[#f0f0f2] dark:text-black/70",
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
          <img src={logoSrc} alt="DragonFruit" className="h-6 w-auto" />
        </Link>
      </div>
      {/* Power K Search */}
      <div className="shrink-0">
        <TopNavPowerK />
      </div>
      {/* Additional Actions */}
      <div className="flex flex-1 shrink-0 items-center justify-end gap-1">
        <NotificationsBell />
        <HelpMenuRoot />
        <div className="flex size-8 items-center justify-center rounded-md hover:bg-white/10 dark:hover:bg-black/10">
          <UserMenuRoot />
        </div>
      </div>
    </div>
  );
});

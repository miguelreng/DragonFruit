/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import {
  Box,
  Checklist,
  ChatRound,
  Document,
  Home,
} from "@solar-icons/react/ssr";
import { EUserWorkspaceRoles } from "@plane/types";
// hooks
import { useUser } from "@/hooks/store/user";
// local imports
import { SidebarUserMenuItem } from "./user-menu-item";

export const SidebarUserMenu = observer(function SidebarUserMenu() {
  // navigation
  const { workspaceSlug } = useParams();
  // store hooks
  const { data: currentUser } = useUser();

  const SIDEBAR_USER_MENU_ITEMS = [
    {
      key: "home",
      labelTranslationKey: "sidebar.home",
      href: `/${workspaceSlug.toString()}/`,
      access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
      Icon: Home,
    },
    {
      key: "dashboards",
      labelTranslationKey: "workspace_dashboards",
      href: `/${workspaceSlug.toString()}/dashboards/`,
      access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
      Icon: Box,
    },
    {
      key: "your-work",
      labelTranslationKey: "sidebar.your_work",
      href: `/${workspaceSlug.toString()}/profile/${currentUser?.id}/`,
      access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
      Icon: Checklist,
    },
    {
      key: "docs",
      labelTranslationKey: "sidebar.docs",
      href: `/${workspaceSlug.toString()}/docs/`,
      access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
      Icon: Document,
    },
    {
      key: "pi-chat",
      labelTranslationKey: "sidebar.pi_chat",
      href: `/${workspaceSlug.toString()}/pi-chat/`,
      access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
      Icon: ChatRound,
    },
  ];

  return (
    <div className="flex flex-col gap-0.5">
      {SIDEBAR_USER_MENU_ITEMS.map((item) => (
        <SidebarUserMenuItem key={item.key} item={item} />
      ))}
    </div>
  );
});

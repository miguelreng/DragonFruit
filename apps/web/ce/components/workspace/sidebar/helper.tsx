/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";
import {
  Archive,
  Calendar,
  Chart,
  Checklist,
  DocumentText,
  Home,
  Inbox,
  MagicStick,
  Pen,
  Bookmark,
  FolderWithFiles,
  RulerCrossPen,
  Repeat,
  Routing,
  StickerSquare,
} from "@solar-icons/react/ssr";
import { renderSolarSidebarIcon } from "@/components/sidebar/solar-icon";

export const getSidebarNavigationItemIcon = (key: string, className: string = "", isActive = false) => {
  const cls = cn("size-4 flex-shrink-0", className);
  switch (key) {
    case "home":
      return renderSolarSidebarIcon(Home, isActive, cls);
    case "inbox":
      return renderSolarSidebarIcon(Inbox, isActive, cls);
    case "projects":
      return renderSolarSidebarIcon(FolderWithFiles, isActive, cls);
    case "active_cycles":
      return renderSolarSidebarIcon(Repeat, isActive, cls);
    case "analytics":
      return renderSolarSidebarIcon(Chart, isActive, cls);
    case "your_work":
      return renderSolarSidebarIcon(Checklist, isActive, cls);
    case "drafts":
      return renderSolarSidebarIcon(Pen, isActive, cls);
    case "archives":
      return renderSolarSidebarIcon(Archive, isActive, cls);
    case "stickies":
      return renderSolarSidebarIcon(StickerSquare, isActive, cls);
    case "docs":
      return renderSolarSidebarIcon(DocumentText, isActive, cls);
    case "bookmarks":
      return renderSolarSidebarIcon(Bookmark, isActive, cls);
    case "whiteboards":
      return renderSolarSidebarIcon(RulerCrossPen, isActive, cls);
    case "calendar":
      return renderSolarSidebarIcon(Calendar, isActive, cls);
    case "workflows":
      return renderSolarSidebarIcon(Routing, isActive, cls);
    case "agents":
      return renderSolarSidebarIcon(MagicStick, isActive, cls);
  }
};

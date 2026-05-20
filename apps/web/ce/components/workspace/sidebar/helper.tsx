/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  AiBrain01Icon,
  Archive02Icon,
  BriefcaseIcon,
  Calendar01Icon,
  ChartBarLineIcon,
  File02Icon,
  Home01Icon,
  InboxIcon,
  PaintBoardIcon,
  PencilEdit01Icon,
  RepeatIcon,
  StickyNote02Icon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@plane/utils";

const SidebarNavIcon = ({ icon, className }: { icon: IconSvgElement; className: string }) => (
  <HugeiconsIcon icon={icon} className={className} color="currentColor" strokeWidth={1.5} size="1em" />
);

export const getSidebarNavigationItemIcon = (key: string, className: string = "") => {
  const cls = cn("size-4 flex-shrink-0", className);
  switch (key) {
    case "home":
      return <SidebarNavIcon icon={Home01Icon} className={cls} />;
    case "inbox":
      return <SidebarNavIcon icon={InboxIcon} className={cls} />;
    case "projects":
      return <SidebarNavIcon icon={BriefcaseIcon} className={cls} />;
    case "active_cycles":
      return <SidebarNavIcon icon={RepeatIcon} className={cls} />;
    case "analytics":
      return <SidebarNavIcon icon={ChartBarLineIcon} className={cls} />;
    case "your_work":
      return <SidebarNavIcon icon={UserAdd01Icon} className={cls} />;
    case "drafts":
      return <SidebarNavIcon icon={PencilEdit01Icon} className={cls} />;
    case "archives":
      return <SidebarNavIcon icon={Archive02Icon} className={cls} />;
    case "stickies":
      return <SidebarNavIcon icon={StickyNote02Icon} className={cls} />;
    case "docs":
      return <SidebarNavIcon icon={File02Icon} className={cls} />;
    case "whiteboards":
      return <SidebarNavIcon icon={PaintBoardIcon} className={cls} />;
    case "calendar":
      return <SidebarNavIcon icon={Calendar01Icon} className={cls} />;
    case "agents":
      return <SidebarNavIcon icon={AiBrain01Icon} className={cls} />;
  }
};

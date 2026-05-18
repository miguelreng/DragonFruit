/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {
  Archive,
  CalendarBlank,
  ChartBar,
  CircleHalfTilt,
  FileText,
  FlowArrow,
  House,
  Notebook,
  PaintBrush,
  Pencil,
  StackSimple,
  Tray,
  UserCirclePlus,
} from "@phosphor-icons/react";
import { Briefcase } from "@/components/icons/lucide-shim";
import { cn } from "@plane/utils";

export const getSidebarNavigationItemIcon = (key: string, className: string = "") => {
  const cls = cn("size-4 flex-shrink-0", className);
  switch (key) {
    case "home":
      return <House className={cls} />;
    case "inbox":
      return <Tray className={cls} />;
    case "projects":
      return <Briefcase className={cls} />;
    case "views":
      return <StackSimple className={cls} />;
    case "active_cycles":
      return <CircleHalfTilt className={cls} />;
    case "analytics":
      return <ChartBar className={cls} />;
    case "your_work":
      return <UserCirclePlus className={cls} />;
    case "drafts":
      return <Pencil className={cls} />;
    case "archives":
      return <Archive className={cls} />;
    case "stickies":
      return <Notebook className={cls} />;
    case "docs":
      return <FileText className={cls} />;
    case "diagrams":
      return <FlowArrow className={cls} />;
    case "whiteboards":
      return <PaintBrush className={cls} />;
    case "calendar":
      return <CalendarBlank className={cls} />;
  }
};

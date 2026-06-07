/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";

type TSidebarNavItem = {
  className?: string;
  isActive?: boolean;
  children?: React.ReactNode;
};

export function SidebarNavItem(props: TSidebarNavItem) {
  const { className, isActive, children } = props;
  return (
    <div
      className={cn(
        "group relative flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-lg px-2 py-1 outline-none",
        {
          "!bg-[#fff7f8] text-primary dark:!bg-danger-subtle sepia:!bg-[#dbccb3]": isActive,
          "text-secondary hover:bg-[#fffafb] active:bg-[#fff7f8] dark:hover:bg-danger-subtle-hover dark:active:bg-danger-subtle-active":
            !isActive,
        },
        className
      )}
    >
      {children}
    </div>
  );
}

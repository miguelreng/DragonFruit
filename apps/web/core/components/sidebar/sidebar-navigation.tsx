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
        isActive
          ? "!bg-[var(--neutral-600)] !text-[oklch(0.43_0_0)]"
          : "text-secondary hover:bg-layer-2-hover active:bg-layer-2-active dark:hover:bg-white/[0.04] dark:active:bg-white/[0.08]",
        className
      )}
    >
      {children}
    </div>
  );
}

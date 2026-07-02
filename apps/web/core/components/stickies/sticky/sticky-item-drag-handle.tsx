/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef } from "react";
// helper
import { cn } from "@plane/utils";

type Props = {
  isDragging?: boolean;
};

// Mirrors the editor's block drag handle (packages/editor/.../plugins/drag-handle.ts):
// two lucide vertical-ellipsis glyphs side by side form the 6-dot grip.
const VerticalEllipsis = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

export const StickyItemDragHandle = forwardRef<HTMLDivElement, Props>(function StickyItemDragHandle(props, ref) {
  const { isDragging } = props;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute top-1 left-1/2 z-10 flex -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-xs text-tertiary opacity-0 transition-[opacity,color] duration-150 group-hover/sticky:opacity-100 hover:text-primary",
        {
          "cursor-grabbing text-primary opacity-100": isDragging,
        }
      )}
    >
      <VerticalEllipsis />
      <VerticalEllipsis className="-ml-2.5" />
    </div>
  );
});

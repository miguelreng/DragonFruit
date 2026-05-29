/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef } from "react";
// ui
import { DragHandle } from "@plane/ui";
// helper
import { cn } from "@plane/utils";

type Props = {
  isDragging?: boolean;
};

export const StickyItemDragHandle = forwardRef<HTMLDivElement, Props>(function StickyItemDragHandle(props, ref) {
  const { isDragging } = props;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute top-1 left-1/2 z-10 flex -translate-x-1/2 rotate-90 cursor-grab touch-none items-center justify-center rounded-lg text-placeholder opacity-0 transition-[opacity,color,transform] duration-150 group-hover/sticky:opacity-100 hover:text-primary",
        {
          "cursor-grabbing text-primary opacity-100": isDragging,
        }
      )}
    >
      <DragHandle className="bg-transparent" />
    </div>
  );
});

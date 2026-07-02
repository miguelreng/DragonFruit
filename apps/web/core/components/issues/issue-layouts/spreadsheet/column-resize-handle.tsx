/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { cn } from "@plane/utils";

/** Minimum column width a user can drag to. */
const MIN_COLUMN_WIDTH = 80;

type Props = {
  /** Called continuously while dragging with the new (clamped) column width in px. */
  onResize: (width: number) => void;
};

/**
 * A thin drag handle pinned to the right edge of a header cell. The parent
 * <th>/<td> must be `relative`. Reads the current cell width on mousedown and
 * reports the new width as the pointer moves. It's invisible at rest (so the
 * header's own border shows through) and only tints while actively resizing.
 */
export function ColumnResizeHandle({ onResize }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Don't let the drag bubble into the header's sort menu / selection.
      event.preventDefault();
      event.stopPropagation();
      const cell = event.currentTarget.closest("th, td") as HTMLElement | null;
      const startX = event.clientX;
      const startWidth = cell?.offsetWidth ?? 0;
      setIsDragging(true);

      const handleMove = (moveEvent: MouseEvent) => {
        const next = Math.max(MIN_COLUMN_WIDTH, startWidth + (moveEvent.clientX - startX));
        onResize(next);
      };
      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setIsDragging(false);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
      // Keep the resize cursor + suppress text selection for the whole drag.
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [onResize]
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute top-0 right-0 z-20 h-full w-1 cursor-col-resize select-none",
        // Only tint while resizing — at rest the header's own border shows.
        isDragging && "bg-accent-primary/40"
      )}
    />
  );
}

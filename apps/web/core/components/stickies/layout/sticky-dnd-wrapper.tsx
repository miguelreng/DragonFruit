/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import type {
  DropTargetRecord,
  DragLocationHistory,
} from "@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types";
import type { ElementDragPayload } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { attachInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { observer } from "mobx-react";
// plane types
import type { InstructionType } from "@plane/types";
// plane ui
import { DropIndicator } from "@plane/ui";
// plane utils
import { cn } from "@plane/utils";
// components
import { StickyNote } from "../sticky";
// helpers
import { getInstructionFromPayload } from "./sticky.helpers";

type Props = {
  stickyId: string;
  workspaceSlug: string;
  itemWidth: string;
  isLastChild: boolean;
  isInFirstRow: boolean;
  handleDrop: (self: DropTargetRecord, source: ElementDragPayload, location: DragLocationHistory) => void;
  handleLayout: () => void;
  className?: string;
};

export const StickyDNDWrapper = observer(function StickyDNDWrapper(props: Props) {
  const { stickyId, workspaceSlug, itemWidth, isLastChild, isInFirstRow, handleDrop, handleLayout, className } = props;
  // states
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<InstructionType | undefined>(undefined);
  // refs
  const elementRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const previousRectRef = useRef<DOMRect | null>(null);
  // Capture latest values without re-running the dnd setup mid-drag.
  // Re-registering the draggable while a drag is in flight cancels it.
  const handleDropRef = useRef(handleDrop);
  const isLastChildRef = useRef(isLastChild);
  handleDropRef.current = handleDrop;
  isLastChildRef.current = isLastChild;

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const previousRect = previousRectRef.current;
    const nextRect = element.getBoundingClientRect();
    previousRectRef.current = nextRect;

    if (!previousRect || isDragging) return;

    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

    element.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }], {
      duration: 220,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    });
  });

  useEffect(() => {
    const element = elementRef.current;
    const dragHandle = dragHandleRef.current;
    if (!element || !dragHandle) return;

    const initialData = { id: stickyId, type: "sticky", parentId: null, isGroup: false, isChild: false };

    return combine(
      draggable({
        element,
        dragHandle,
        getInitialData: () => initialData,
        onDragStart: () => {
          setIsDragging(true);
        },
        onDrop: () => {
          setIsDragging(false);
        },
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          // Snapshot the live card as the drag image. Re-mounting a fresh
          // <StickyNote> via createRoot here paints on a later tick, so the
          // browser captures the native drag image blank. Cloning the on-screen
          // node is synchronous, so the actual card visibly follows the cursor.
          const node = elementRef.current;
          setCustomNativeDragPreview({
            getOffset: pointerOutsideOfPreview({ x: "16px", y: "12px" }),
            render: ({ container }) => {
              if (!node) return () => undefined;
              const clone = node.cloneNode(true) as HTMLElement;
              clone.style.margin = "0";
              const preview = document.createElement("div");
              preview.className =
                "max-h-[220px] overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/10 rotate-[1.5deg]";
              preview.appendChild(clone);
              container.appendChild(preview);
              return () => undefined;
            },
            nativeSetDragImage,
          });
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source.data?.type === "sticky" && source.data?.id !== stickyId,
        getData: ({ input, element: targetElement }) => {
          const lastChild = isLastChildRef.current;

          return attachInstruction(initialData, {
            input,
            element: targetElement,
            currentLevel: 1,
            indentPerLevel: 0,
            mode: lastChild ? "last-in-group" : "standard",
            block: ["make-child"],
          });
        },
        onDrag: ({ self, source, location }) => {
          const nextInstruction = getInstructionFromPayload(self, source, location);
          setInstruction(nextInstruction);
        },
        onDragLeave: () => {
          setInstruction(undefined);
        },
        onDrop: ({ self, source, location }) => {
          setInstruction(undefined);
          handleDropRef.current(self, source, location);
        },
      })
    );
  }, [stickyId, workspaceSlug]);

  return (
    <div
      ref={elementRef}
      className={cn(
        "box-border flex flex-col motion-safe:transition-[opacity,transform,filter] motion-safe:duration-200 motion-safe:ease-out",
        {
          "z-[1] scale-[0.985] opacity-30 grayscale-[0.2]": isDragging,
        },
        className
      )}
      style={{
        width: itemWidth,
      }}
    >
      {/* Zero-footprint indicators: h-0 containers keep masonry column tops aligned while
          visible indicators overlay the pb-4 gap between cards instead of taking up space. */}
      {!isInFirstRow && (
        <div className="relative h-0">
          <div className="absolute inset-x-0 -top-[9px]">
            <DropIndicator
              classNames="rounded-full motion-safe:transition-colors"
              isVisible={instruction === "reorder-above"}
            />
          </div>
        </div>
      )}
      <StickyNote
        key={stickyId || "new"}
        workspaceSlug={workspaceSlug}
        stickyId={stickyId}
        handleLayout={handleLayout}
        dragHandleRef={dragHandleRef}
        isDragging={isDragging}
      />
      <div className="relative h-0">
        <div className="absolute inset-x-0 top-[7px]">
          <DropIndicator
            classNames="rounded-full motion-safe:transition-colors"
            isVisible={instruction === "reorder-below"}
          />
        </div>
      </div>
    </div>
  );
});

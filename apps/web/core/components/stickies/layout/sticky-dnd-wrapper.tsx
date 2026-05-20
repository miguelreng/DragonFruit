/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
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
import { createRoot } from "react-dom/client";
// plane types
import type { InstructionType } from "@plane/types";
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
  isInLastRow: boolean;
  handleDrop: (self: DropTargetRecord, source: ElementDragPayload, location: DragLocationHistory) => void;
  handleLayout: () => void;
};

export const StickyDNDWrapper = observer(function StickyDNDWrapper(props: Props) {
  const { stickyId, workspaceSlug, itemWidth, isLastChild, handleDrop, handleLayout } = props;
  // states
  const [isDragging, setIsDragging] = useState(false);
  const [_instruction, setInstruction] = useState<InstructionType | undefined>(undefined);
  // refs
  const elementRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  // Capture latest values without re-running the dnd setup mid-drag.
  // Re-registering the draggable while a drag is in flight cancels it.
  const handleDropRef = useRef(handleDrop);
  const isLastChildRef = useRef(isLastChild);
  handleDropRef.current = handleDrop;
  isLastChildRef.current = isLastChild;

  useEffect(() => {
    const element = elementRef.current;
    const dragHandle = dragHandleRef.current;
    if (!element || !dragHandle) return;

    const initialData = { id: stickyId, type: "sticky" };

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
          setCustomNativeDragPreview({
            getOffset: pointerOutsideOfPreview({ x: "-200px", y: "0px" }),
            render: ({ container }) => {
              const root = createRoot(container);
              root.render(
                <div className="scale-50">
                  <div className="-m-2 max-h-[150px]">
                    <StickyNote
                      className={"w-[290px]"}
                      workspaceSlug={workspaceSlug.toString()}
                      stickyId={stickyId}
                      showToolbar={false}
                    />
                  </div>
                </div>
              );
              return () => root.unmount();
            },
            nativeSetDragImage,
          });
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source.data?.type === "sticky" && source.data?.id !== stickyId,
        getData: ({ input, element }) => {
          const lastChild = isLastChildRef.current;

          return attachInstruction(initialData, {
            input,
            element,
            currentLevel: 1,
            indentPerLevel: 0,
            mode: lastChild ? "last-in-group" : "standard",
            block: ["make-child"],
          });
        },
        onDrag: ({ self, source, location }) => {
          const instruction = getInstructionFromPayload(self, source, location);
          setInstruction(instruction);
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
      className="box-border flex flex-col p-[8px]"
      style={{
        width: itemWidth,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {/* {!isInFirstRow && <DropIndicator isVisible={instruction === "reorder-above"} />} */}
      <StickyNote
        key={stickyId || "new"}
        workspaceSlug={workspaceSlug}
        stickyId={stickyId}
        handleLayout={handleLayout}
        dragHandleRef={dragHandleRef}
      />
      {/* {!isInLastRow && <DropIndicator isVisible={instruction === "reorder-below"} />} */}
    </div>
  );
});

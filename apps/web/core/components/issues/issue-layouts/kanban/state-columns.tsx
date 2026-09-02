/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { TwitterPicker } from "react-color";
// plane imports
import { EUserPermissionsLevel } from "@plane/constants";
import { useOutsideClickDetector } from "@plane/hooks";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EUserProjectRoles } from "@plane/types";
import { Popover } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { PlusIcon } from "@/components/icons/propel-shim";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserPermissions } from "@/hooks/store/user";

// Drag payloads carry this type so kanban's card/column drop targets can
// tell a column drag apart from a card drag. Must NOT include an `id` key —
// getSourceFromDropPayload treats any payload with an id as a card drag.
export const KANBAN_STATE_COLUMN_DRAG_TYPE = "KANBAN_STATE_COLUMN";

// Group assigned to states created from the board. "unstarted" renders the
// neutral todo-circle icon and puts no workflow semantics on the column.
const NEW_COLUMN_STATE_GROUP = "unstarted";

// Starting color for a column added from the board; the swatch in the
// composer opens a picker to change it before creating.
const NEW_COLUMN_STATE_COLOR = "#8B5CF6";

/**
 * Whether the current user can edit the state columns (rename, add,
 * reorder) of the given project's kanban. Mirrors the project settings
 * States page, which is admin-only.
 */
export const useKanbanStateColumnsEditable = (groupBy: string | null | undefined): boolean => {
  const { workspaceSlug, projectId } = useParams();
  const { allowPermissions } = useUserPermissions();
  if (groupBy !== "state" || !workspaceSlug || !projectId) return false;
  return allowPermissions(
    [EUserProjectRoles.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug.toString(),
    projectId.toString()
  );
};

type TKanbanStateColumnWrapperProps = {
  stateId: string;
  isEditable: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/**
 * Column wrapper that accepts horizontal drops of other state columns.
 * On drop, the dragged state's sequence is rewritten to sit between its
 * new neighbors — the board orders state columns by sequence alone, so
 * this is a free reorder across state groups.
 */
export const KanbanStateColumnWrapper = observer(function KanbanStateColumnWrapper(
  props: TKanbanStateColumnWrapperProps
) {
  const { stateId, isEditable, className, style, children } = props;
  // refs
  const columnRef = useRef<HTMLDivElement | null>(null);
  // states
  const [closestEdge, setClosestEdge] = useState<string | null>(null);
  // router
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { getProjectStates, moveStatePosition } = useProjectState();

  useEffect(() => {
    const element = columnRef.current;
    if (!element || !isEditable || !workspaceSlug || !projectId) return;

    return dropTargetForElements({
      element,
      canDrop: ({ source }) =>
        source.data?.type === KANBAN_STATE_COLUMN_DRAG_TYPE && source.data?.stateId !== stateId,
      getData: ({ input, element: el }) =>
        attachClosestEdge(
          { type: KANBAN_STATE_COLUMN_DRAG_TYPE, stateId },
          { input, element: el, allowedEdges: ["left", "right"] }
        ),
      onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
      onDragLeave: () => setClosestEdge(null),
      onDrop: ({ self, source }) => {
        setClosestEdge(null);
        const sourceStateId = source.data?.stateId;
        const edge = extractClosestEdge(self.data);
        if (typeof sourceStateId !== "string" || sourceStateId === stateId || !edge) return;

        // Board order is sequence-only; insert the dragged state between
        // its new neighbors.
        const orderedStates = (getProjectStates(projectId.toString()) ?? [])
          .slice()
          .sort((a, b) => a.sequence - b.sequence)
          .filter((state) => state.id !== sourceStateId);
        const targetIndex = orderedStates.findIndex((state) => state.id === stateId);
        if (targetIndex === -1) return;

        const insertIndex = edge === "left" ? targetIndex : targetIndex + 1;
        const previousState = orderedStates[insertIndex - 1];
        const nextState = orderedStates[insertIndex];

        let sequence = 65535;
        if (previousState && nextState) sequence = (previousState.sequence + nextState.sequence) / 2;
        else if (previousState) sequence = previousState.sequence + 65535;
        else if (nextState) sequence = nextState.sequence / 2;

        moveStatePosition(workspaceSlug.toString(), projectId.toString(), sourceStateId, { sequence }).catch(() => {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message: "The column could not be moved. Please try again.",
          });
        });
      },
    });
  }, [isEditable, stateId, workspaceSlug, projectId, getProjectStates, moveStatePosition]);

  return (
    <div ref={columnRef} className={className} style={style}>
      {/* drop position indicators */}
      {closestEdge === "left" && (
        <div className="absolute -left-2.5 top-2 bottom-2 z-[3] w-[3px] rounded-full bg-accent-primary" />
      )}
      {closestEdge === "right" && (
        <div className="absolute -right-2.5 top-2 bottom-2 z-[3] w-[3px] rounded-full bg-accent-primary" />
      )}
      {children}
    </div>
  );
});

/**
 * Trailing "Add column" affordance on state-grouped boards. Expands into
 * a draft column that already looks like a real one — same 350px body,
 * 6 % tint, header pill at 20 % — where only the name and color are being
 * edited. Picking a color repaints the whole draft column live, so what
 * you see is the column you are about to create. Enter or a click outside
 * creates the state, Escape cancels.
 */
export const KanbanAddStateColumn = observer(function KanbanAddStateColumn() {
  // refs
  const composerRef = useRef<HTMLDivElement | null>(null);
  // states
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(NEW_COLUMN_STATE_COLOR);
  // router
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { createState } = useProjectState();

  const handleClose = () => {
    setIsOpen(false);
    setName("");
    setColor(NEW_COLUMN_STATE_COLOR);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const pickedColor = color;
    handleClose();
    if (!trimmedName || !workspaceSlug || !projectId) return;
    try {
      await createState(workspaceSlug.toString(), projectId.toString(), {
        name: trimmedName,
        color: pickedColor,
        group: NEW_COLUMN_STATE_GROUP,
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "The column could not be created. Please try again.",
      });
    }
  };

  // Commit on click-away rather than on the input's blur, so opening the
  // color picker (rendered inside the draft column) doesn't create it.
  useOutsideClickDetector(composerRef, () => {
    if (isOpen) void handleCreate();
  });

  if (!isOpen)
    return (
      <div className="flex w-[280px] flex-shrink-0 flex-col pt-2.5">
        <button
          type="button"
          className={cn(
            "flex w-fit items-center gap-1.5 rounded-lg px-2 py-0.5 text-11 font-semibold uppercase text-placeholder",
            "transition-colors hover:bg-layer-1 hover:text-secondary"
          )}
          onClick={() => setIsOpen(true)}
        >
          <span className="grid size-4 flex-shrink-0 place-items-center">
            <PlusIcon width={14} strokeWidth={2} />
          </span>
          Add column
        </button>
      </div>
    );

  return (
    // Mirrors a live column in default.tsx: w-[350px] rounded-xl p-2 body
    // tinted 6 % of the state color, header pill tinted 20 %.
    <div
      ref={composerRef}
      className="relative flex w-[350px] flex-shrink-0 flex-col rounded-xl p-2"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 6%, transparent)` }}
    >
      <div className="w-full flex-shrink-0 pb-1">
        <div className="relative flex w-full flex-shrink-0 flex-row items-center gap-1 pt-0.5 pb-1.5">
          <div
            // No overflow-hidden here (unlike the real header pill, which
            // clips long titles): it would clip the color picker popover,
            // which renders inside the swatch.
            className="inline-flex min-w-0 max-w-full flex-row items-center gap-1.5 rounded-lg px-2 py-0.5"
            style={{
              backgroundColor: `color-mix(in srgb, ${color} 20%, var(--background-color-layer-1))`,
              color,
            }}
          >
            <div className="relative size-4 flex-shrink-0">
              <Popover
                button={
                  <span
                    className="grid size-4 cursor-pointer place-items-center rounded-full border border-white/40"
                    style={{ backgroundColor: color }}
                    title="Pick a color"
                  />
                }
                panelClassName="mt-2 w-auto"
              >
                <TwitterPicker color={color} onChange={(value) => setColor(value.hex)} triangle="hide" />
              </Popover>
            </div>
            <input
              id="kanban-new-column-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
                if (e.key === "Escape") handleClose();
              }}
              placeholder="Column name"
              // field-sizing keeps the input as wide as its text, so the
              // pill hugs the name the way a real column header pill does
              // instead of stretching across the column.
              className={cn(
                "min-w-0 bg-transparent text-11 font-semibold uppercase outline-none",
                "field-sizing-content max-w-[230px]",
                "placeholder:font-medium placeholder:normal-case placeholder:text-placeholder"
              )}
              maxLength={100}
              autoFocus
            />
            <div className="flex-shrink-0 text-11 font-semibold">0</div>
          </div>
        </div>
      </div>
      {/* Empty body, so the draft occupies the same footprint as the column
          it becomes. */}
      <div className="min-h-[120px] flex-1" />
    </div>
  );
});

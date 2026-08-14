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
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EUserProjectRoles } from "@plane/types";
import { Input, Popover } from "@plane/ui";
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
 * a small inline composer with a color swatch + name input and creates a
 * new project state, which appears as the last column.
 */
export const KanbanAddStateColumn = observer(function KanbanAddStateColumn() {
  // states
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#8B5CF6");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // router
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { createState } = useProjectState();

  const handleClose = () => {
    setIsOpen(false);
    setName("");
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || isSubmitting || !workspaceSlug || !projectId) return;
    setIsSubmitting(true);
    try {
      await createState(workspaceSlug.toString(), projectId.toString(), {
        name: trimmedName,
        color,
        group: NEW_COLUMN_STATE_GROUP,
      });
      handleClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "The column could not be created. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex w-[280px] flex-shrink-0 flex-col pt-0.5">
      {isOpen ? (
        <div
          className="flex items-center gap-2 rounded-xl border border-subtle bg-surface-1 p-2"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
            if (e.key === "Escape") handleClose();
          }}
        >
          <Popover
            button={
              <span
                className="grid size-5 flex-shrink-0 cursor-pointer place-items-center rounded-lg"
                style={{ backgroundColor: color }}
              />
            }
            panelClassName="mt-2"
          >
            <TwitterPicker color={color} onChange={(value) => setColor(value.hex)} />
          </Popover>
          <Input
            id="kanban-new-column-name"
            type="text"
            placeholder="Column name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full"
            maxLength={100}
            autoFocus
          />
          <Button variant="primary" size="sm" disabled={!name.trim() || isSubmitting} onClick={() => void handleCreate()}>
            Add
          </Button>
          <Button variant="secondary" size="sm" disabled={isSubmitting} onClick={handleClose}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2 py-1 text-11 font-semibold uppercase text-placeholder",
            "transition-colors hover:bg-layer-1 hover:text-secondary"
          )}
          onClick={() => setIsOpen(true)}
        >
          <PlusIcon width={14} strokeWidth={2} />
          Add column
        </button>
      )}
    </div>
  );
});

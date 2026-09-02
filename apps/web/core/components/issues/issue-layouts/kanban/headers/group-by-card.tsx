/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// icons
import { Collapse, Expand } from "@/components/icons/lucide-shim";
import { Circle } from "@/components/icons/lucide-shim";
import { PlusIcon, StateGroupIcon } from "@/components/icons/propel-shim";
import { EIconSize } from "@dragonfruit/constants";
import { TOAST_TYPE, setToast } from "@dragonfruit/propel/toast";
import type { TIssue, ISearchIssueResponse, TIssueKanbanFilters, TIssueGroupByOptions } from "@dragonfruit/types";
// ui
import { CustomMenu } from "@dragonfruit/ui";
// components
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
// constants
import { useProjectState } from "@/hooks/store/use-project-state";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { CreateUpdateEpicModal } from "@/plane-web/components/epics/epic-modal";
// types
// DragonFruit-web
import { WorkFlowGroupTree } from "@/plane-web/components/workflow";
import { getStateGroupThemeFromHeaderTitle } from "../../utils";
import { KANBAN_STATE_COLUMN_DRAG_TYPE, useKanbanStateColumnsEditable } from "../state-columns";

interface IHeaderGroupByCard {
  sub_group_by: TIssueGroupByOptions | undefined;
  group_by: TIssueGroupByOptions | undefined;
  column_id: string;
  icon?: React.ReactNode;
  title: string;
  count: number;
  collapsedGroups: TIssueKanbanFilters;
  handleCollapsedGroups: (toggle: "group_by" | "sub_group_by", value: string) => void;
  issuePayload: Partial<TIssue>;
  disableIssueCreation?: boolean;
  addIssuesToView?: (issueIds: string[]) => Promise<TIssue>;
  isEpic?: boolean;
}

export const HeaderGroupByCard = observer(function HeaderGroupByCard(props: IHeaderGroupByCard) {
  const {
    group_by,
    sub_group_by,
    column_id,
    icon,
    title,
    count,
    collapsedGroups,
    handleCollapsedGroups,
    issuePayload,
    disableIssueCreation,
    addIssuesToView,
    isEpic = false,
  } = props;
  const verticalAlignPosition = sub_group_by ? false : collapsedGroups?.group_by.includes(column_id);
  const stateGroupTheme = getStateGroupThemeFromHeaderTitle(group_by, title);
  // states
  const [isOpen, setIsOpen] = React.useState(false);
  const [openExistingIssueListModal, setOpenExistingIssueListModal] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [draftName, setDraftName] = React.useState(title);
  // refs
  const pillRef = React.useRef<HTMLDivElement | null>(null);
  const isRenamingRef = React.useRef(false);
  // hooks
  const storeType = useIssueStoreType();
  const { updateState } = useProjectState();
  const isStateColumnEditable = useKanbanStateColumnsEditable(group_by);
  // router
  const { workspaceSlug, projectId, moduleId, cycleId } = useParams();

  // Keep the rename draft in sync when the state is renamed elsewhere.
  React.useEffect(() => {
    if (!isRenamingRef.current) setDraftName(title);
  }, [title]);

  // State columns can be dragged by their header pill to reorder the board.
  // Only wired on the plain kanban (not swimlanes) — the column wrapper in
  // default.tsx carries the matching drop targets.
  React.useEffect(() => {
    const element = pillRef.current;
    if (!element || !isStateColumnEditable || sub_group_by !== null) return;
    return draggable({
      element,
      canDrag: () => !isRenamingRef.current,
      getInitialData: () => ({ type: KANBAN_STATE_COLUMN_DRAG_TYPE, stateId: column_id }),
    });
  }, [isStateColumnEditable, sub_group_by, column_id]);

  const startRenaming = () => {
    if (!isStateColumnEditable || verticalAlignPosition) return;
    setDraftName(title);
    isRenamingRef.current = true;
    setIsRenaming(true);
  };

  const commitRename = async () => {
    isRenamingRef.current = false;
    setIsRenaming(false);
    const trimmedName = draftName.trim();
    if (!trimmedName || trimmedName === title || !workspaceSlug || !projectId) {
      setDraftName(title);
      return;
    }
    try {
      await updateState(workspaceSlug.toString(), projectId.toString(), column_id, { name: trimmedName });
    } catch {
      setDraftName(title);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "The column could not be renamed. Please try again.",
      });
    }
  };

  const cancelRename = () => {
    isRenamingRef.current = false;
    setIsRenaming(false);
    setDraftName(title);
  };

  const renderExistingIssueModal = moduleId || cycleId;
  const ExistingIssuesListModalPayload = moduleId ? { module: moduleId.toString() } : { cycle: true };

  const handleAddIssuesToView = async (data: ISearchIssueResponse[]) => {
    if (!workspaceSlug || !projectId) return;

    const issues = data.map((i) => i.id);

    try {
      await addIssuesToView?.(issues);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Tasks added to the cycle successfully.",
      });
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Selected tasks could not be added to the cycle. Please try again.",
      });
    }
  };

  return (
    <>
      {isEpic ? (
        <CreateUpdateEpicModal isOpen={isOpen} onClose={() => setIsOpen(false)} data={issuePayload} />
      ) : (
        <CreateUpdateIssueModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          data={issuePayload}
          storeType={storeType}
        />
      )}

      {renderExistingIssueModal && (
        <ExistingIssuesListModal
          workspaceSlug={workspaceSlug?.toString()}
          projectId={projectId?.toString()}
          isOpen={openExistingIssueListModal}
          handleClose={() => setOpenExistingIssueListModal(false)}
          searchParams={ExistingIssuesListModalPayload}
          handleOnSubmit={handleAddIssuesToView}
        />
      )}
      <div
        className={`relative flex flex-shrink-0 gap-1 pt-0.5 pb-1.5 ${
          verticalAlignPosition ? `w-[44px] flex-col items-center` : `w-full flex-row items-center`
        }`}
      >
        {/*
          Pill-style header (ClickUp-inspired): icon + UPPERCASE label + count
          all wrapped in a single rounded chip on a tinted surface. Replaces
          Plane's default of three inline elements with no enclosing shape.
          Action buttons (minimize, plus) sit outside the pill on the right.
          When the column carries a `--state-color` CSS variable (kanban
          grouped by state) the pill tints itself with a 20 % mix of that
          color over canvas, so each state gets its own visual identity. For
          non-state groupings the var is undefined and the mix falls back to
          neutral `bg-layer-1`.
        */}
        <div
          ref={pillRef}
          className={`inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-layer-1 ${
            verticalAlignPosition ? `flex-col px-1 py-1.5` : `flex-row overflow-hidden px-2 py-0.5`
          } ${isStateColumnEditable && sub_group_by === null && !isRenaming ? "cursor-grab" : ""}`}
          style={{
            ...(stateGroupTheme
              ? {
                  backgroundColor: `color-mix(in srgb, ${stateGroupTheme.color} 20%, var(--background-color-layer-1))`,
                  color: stateGroupTheme.color,
                }
              : {
                  backgroundColor:
                    "color-mix(in srgb, var(--state-color, transparent) 20%, var(--background-color-layer-1))",
                }),
          }}
        >
          <div className="flex size-4 flex-shrink-0 items-center justify-center overflow-hidden rounded-xs">
            {stateGroupTheme ? (
              <StateGroupIcon
                stateGroup={stateGroupTheme.stateGroup}
                color={stateGroupTheme.color}
                size={EIconSize.LG}
              />
            ) : icon ? (
              icon
            ) : (
              <Circle width={14} strokeWidth={2} />
            )}
          </div>
          {isRenaming ? (
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") cancelRename();
              }}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full min-w-0 bg-transparent text-11 font-semibold uppercase outline-none"
              style={stateGroupTheme ? { color: stateGroupTheme.color } : undefined}
              maxLength={100}
              autoFocus
            />
          ) : (
            <div
              className={`line-clamp-1 inline-block truncate overflow-hidden text-11 font-semibold uppercase ${
                verticalAlignPosition ? `max-h-[400px] vertical-lr` : ``
              }`}
              style={stateGroupTheme ? { color: stateGroupTheme.color } : undefined}
              onDoubleClick={startRenaming}
            >
              {title}
            </div>
          )}
          <div
            className={`flex-shrink-0 text-11 font-semibold ${verticalAlignPosition ? `pt-0.5` : ``}`}
            style={stateGroupTheme ? { color: stateGroupTheme.color } : undefined}
          >
            {count || 0}
          </div>
        </div>

        <div
          className={
            verticalAlignPosition
              ? "flex flex-shrink-0 flex-col items-center gap-1"
              : "ml-auto flex flex-shrink-0 items-center gap-1"
          }
        >
          <WorkFlowGroupTree groupBy={group_by} groupId={column_id} />

          {sub_group_by === null && (
            <button type="button"
              className="flex h-[20px] w-[20px] flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-layer-transparent transition-all hover:bg-layer-transparent-hover"
              onClick={() => handleCollapsedGroups("group_by", column_id)}
            >
              {verticalAlignPosition ? (
                <Expand className="size-3.5" color="currentColor" size="1em" />
              ) : (
                <Collapse className="size-3.5" color="currentColor" size="1em" />
              )}
            </button>
          )}

          {!disableIssueCreation &&
            (renderExistingIssueModal ? (
              <CustomMenu
                customButton={
                  <span className="flex h-[20px] w-[20px] flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-layer-transparent transition-all hover:bg-layer-transparent-hover">
                    <PlusIcon height={14} width={14} strokeWidth={2} />
                  </span>
                }
                placement="bottom-end"
              >
                <CustomMenu.MenuItem
                  onClick={() => {
                    setIsOpen(true);
                  }}
                >
                  <span className="flex items-center justify-start gap-2">Create task</span>
                </CustomMenu.MenuItem>
                <CustomMenu.MenuItem
                  onClick={() => {
                    setOpenExistingIssueListModal(true);
                  }}
                >
                  <span className="flex items-center justify-start gap-2">Add an existing task</span>
                </CustomMenu.MenuItem>
              </CustomMenu>
            ) : (
              <button type="button"
                className="flex h-[20px] w-[20px] flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-layer-transparent transition-all hover:bg-layer-transparent-hover"
                onClick={() => {
                  setIsOpen(true);
                }}
              >
                <PlusIcon width={14} strokeWidth={2} />
              </button>
            ))}
        </div>
      </div>
    </>
  );
});

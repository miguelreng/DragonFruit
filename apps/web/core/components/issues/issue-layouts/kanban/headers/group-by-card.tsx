/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// icons
import { CollapseIcon, ExpandIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Circle } from "@/components/icons/lucide-shim";
import { PlusIcon, StateGroupIcon } from "@plane/propel/icons";
import { EIconSize } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue, ISearchIssueResponse, TIssueKanbanFilters, TIssueGroupByOptions } from "@plane/types";
// ui
import { CustomMenu } from "@plane/ui";
// components
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
// constants
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { CreateUpdateEpicModal } from "@/plane-web/components/epics/epic-modal";
// types
// DragonFruit-web
import { WorkFlowGroupTree } from "@/plane-web/components/workflow";
import { getStateGroupThemeFromHeaderTitle } from "../../utils";

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
  // hooks
  const storeType = useIssueStoreType();
  // router
  const { workspaceSlug, projectId, moduleId, cycleId } = useParams();

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
          className={`inline-flex min-w-0 items-center gap-1.5 rounded-md bg-layer-1 ${
            verticalAlignPosition ? `flex-col px-1 py-1.5` : `flex-row overflow-hidden px-2 py-0.5`
          }`}
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
          <div
            className={`line-clamp-1 inline-block truncate overflow-hidden text-11 font-semibold uppercase ${
              verticalAlignPosition ? `max-h-[400px] vertical-lr` : ``
            }`}
            style={stateGroupTheme ? { color: stateGroupTheme.color } : undefined}
          >
            {title}
          </div>
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
            <button
              className="flex h-[20px] w-[20px] flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm bg-layer-transparent transition-all hover:bg-layer-transparent-hover"
              onClick={() => handleCollapsedGroups("group_by", column_id)}
            >
              {verticalAlignPosition ? (
                <HugeiconsIcon icon={ExpandIcon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
              ) : (
                <HugeiconsIcon icon={CollapseIcon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
              )}
            </button>
          )}

          {!disableIssueCreation &&
            (renderExistingIssueModal ? (
              <CustomMenu
                customButton={
                  <span className="flex h-[20px] w-[20px] flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm bg-layer-transparent transition-all hover:bg-layer-transparent-hover">
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
              <button
                className="flex h-[20px] w-[20px] flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm bg-layer-transparent transition-all hover:bg-layer-transparent-hover"
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

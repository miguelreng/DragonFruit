/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Dispatch, MouseEvent, MutableRefObject, SetStateAction } from "react";
import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { GitBranch, MoreHorizontal } from "@/components/icons/lucide-shim";
import { SPREADSHEET_SELECT_GROUP } from "@plane/constants";
// plane helpers
import { useOutsideClickDetector } from "@plane/hooks";
import { ChevronRightIcon } from "@/components/icons/propel-shim";
// types
import { Tooltip } from "@plane/propel/tooltip";
import type { IIssueDisplayProperties, IProjectCustomField, TIssue } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// ui
import { ControlLink, ERowVariant, Row } from "@plane/ui";
import { cn, generateWorkItemLink } from "@plane/utils";
// components
import { MultipleSelectEntityAction } from "@/components/core/multiple-select";
import RenderIfVisible from "@/components/core/render-if-visible-HOC";
// helper
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { usePlatformOS } from "@/hooks/use-platform-os";
// local components
import type { TRenderQuickActions } from "../list/list-view-types";
import { isIssueNew } from "../utils";
import { CustomFieldColumn } from "./custom-field-column";
import { IssueColumn } from "./issue-column";

interface Props {
  displayProperties: IIssueDisplayProperties;
  isEstimateEnabled: boolean;
  quickActions: TRenderQuickActions;
  canEditProperties: (projectId: string | undefined) => boolean;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  portalElement: React.MutableRefObject<HTMLDivElement | null>;
  nestingLevel: number;
  issueId: string;
  isScrolled: MutableRefObject<boolean>;
  containerRef: MutableRefObject<HTMLTableElement | null>;
  spreadsheetColumnsList: (keyof IIssueDisplayProperties)[];
  customFields: IProjectCustomField[];
  spacingLeft?: number;
  selectionHelpers: TSelectionHelper;
  shouldRenderByDefault?: boolean;
  isEpic?: boolean;
}

export const SpreadsheetIssueRow = observer(function SpreadsheetIssueRow(props: Props) {
  const {
    displayProperties,
    issueId,
    isEstimateEnabled,
    nestingLevel,
    portalElement,
    updateIssue,
    quickActions,
    canEditProperties,
    isScrolled,
    containerRef,
    spreadsheetColumnsList,
    customFields,
    spacingLeft = 6,
    selectionHelpers,
    shouldRenderByDefault,
    isEpic = false,
  } = props;
  // states
  const [isExpanded, setExpanded] = useState<boolean>(false);
  // store hooks
  const { subIssues: subIssuesStore } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);
  const { issueMap } = useIssues();

  // derived values
  const issue = issueMap[issueId];
  const subIssues = subIssuesStore.subIssuesByIssueId(issueId);
  const isIssueSelected = selectionHelpers.getIsEntitySelected(issueId);
  const isIssueActive = selectionHelpers.getIsEntityActive(issueId);

  if (!issue) return null;

  return (
    <>
      {/* first column/ issue name and key column */}
      <RenderIfVisible
        as="tr"
        root={containerRef}
        placeholderChildren={
          <td
            colSpan={100}
            className="border-[0.5px] border-transparent border-b-subtle"
            style={{ height: "calc(2.25rem - 1px)" }}
          />
        }
        classNames={cn("bg-surface-1 transition-[background-color]", {
          "group selected-issue-row": isIssueSelected,
          "border-[0.5px] border-strong-1": isIssueActive,
        })}
        verticalOffset={100}
        shouldRecordHeights={false}
        defaultValue={shouldRenderByDefault || isIssueNew(issue)}
      >
        <IssueRowDetails
          issueId={issueId}
          displayProperties={displayProperties}
          quickActions={quickActions}
          canEditProperties={canEditProperties}
          nestingLevel={nestingLevel}
          spacingLeft={spacingLeft}
          isEstimateEnabled={isEstimateEnabled}
          updateIssue={updateIssue}
          portalElement={portalElement}
          isScrolled={isScrolled}
          isExpanded={isExpanded}
          setExpanded={setExpanded}
          spreadsheetColumnsList={spreadsheetColumnsList}
          customFields={customFields}
          selectionHelpers={selectionHelpers}
          isEpic={isEpic}
        />
      </RenderIfVisible>

      {isExpanded &&
        !isEpic &&
        subIssues?.map((subIssueId: string) => (
          <SpreadsheetIssueRow
            key={subIssueId}
            issueId={subIssueId}
            displayProperties={displayProperties}
            quickActions={quickActions}
            canEditProperties={canEditProperties}
            nestingLevel={nestingLevel + 1}
            spacingLeft={spacingLeft + 12}
            isEstimateEnabled={isEstimateEnabled}
            updateIssue={updateIssue}
            portalElement={portalElement}
            isScrolled={isScrolled}
            containerRef={containerRef}
            spreadsheetColumnsList={spreadsheetColumnsList}
            customFields={customFields}
            selectionHelpers={selectionHelpers}
            shouldRenderByDefault={isExpanded}
          />
        ))}
    </>
  );
});

interface IssueRowDetailsProps {
  displayProperties: IIssueDisplayProperties;
  isEstimateEnabled: boolean;
  quickActions: TRenderQuickActions;
  canEditProperties: (projectId: string | undefined) => boolean;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  portalElement: React.MutableRefObject<HTMLDivElement | null>;
  nestingLevel: number;
  issueId: string;
  isScrolled: MutableRefObject<boolean>;
  isExpanded: boolean;
  setExpanded: Dispatch<SetStateAction<boolean>>;
  spreadsheetColumnsList: (keyof IIssueDisplayProperties)[];
  customFields: IProjectCustomField[];
  spacingLeft?: number;
  selectionHelpers: TSelectionHelper;
  isEpic?: boolean;
}

const IssueRowDetails = observer(function IssueRowDetails(props: IssueRowDetailsProps) {
  const {
    displayProperties,
    issueId,
    isEstimateEnabled,
    nestingLevel,
    portalElement,
    updateIssue,
    quickActions,
    canEditProperties,
    isExpanded,
    setExpanded,
    spreadsheetColumnsList,
    customFields,
    spacingLeft = 6,
    selectionHelpers,
    isEpic = false,
  } = props;
  // states
  const [isMenuActive, setIsMenuActive] = useState(false);
  // refs
  const cellRef = useRef(null);
  const menuActionRef = useRef<HTMLButtonElement | null>(null);
  // router
  const { workspaceSlug, projectId } = useParams();
  // hooks
  const { getProjectIdentifierById } = useProject();
  const { getIsIssuePeeked, peekIssue } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);
  const { handleRedirection } = useIssuePeekOverviewRedirection(isEpic);
  const { isMobile } = usePlatformOS();

  // handlers
  const handleIssuePeekOverview = (issue: TIssue) =>
    handleRedirection(workspaceSlug?.toString(), issue, isMobile, nestingLevel);

  const { subIssues: subIssuesStore, issue } = useIssueDetail();

  const issueDetail = issue.getIssueById(issueId);

  const subIssueIndentation = `${spacingLeft}px`;

  useOutsideClickDetector(menuActionRef, () => setIsMenuActive(false));

  const customActionButton = (
    <button
      type="button"
      ref={menuActionRef}
      className={`flex h-full w-full cursor-pointer items-center rounded-lg p-1 text-placeholder hover:bg-layer-1 ${
        isMenuActive ? "bg-layer-1 text-primary" : "text-secondary"
      }`}
      onClick={() => setIsMenuActive(!isMenuActive)}
    >
      <MoreHorizontal className="h-3.5 w-3.5" />
    </button>
  );
  if (!issueDetail) return null;

  const handleToggleExpand = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (nestingLevel >= 3) {
      handleIssuePeekOverview(issueDetail);
    } else {
      setExpanded((prevState) => {
        if (!prevState && workspaceSlug && issueDetail && issueDetail.project_id)
          subIssuesStore.fetchSubIssues(workspaceSlug.toString(), issueDetail.project_id, issueDetail.id);
        return !prevState;
      });
    }
  };

  const disableUserActions = !canEditProperties(issueDetail.project_id ?? undefined);
  const subIssuesCount = issueDetail?.sub_issues_count ?? 0;
  const isIssueSelected = selectionHelpers.getIsEntitySelected(issueDetail.id);
  const projectIdentifier = getProjectIdentifierById(issueDetail.project_id);

  const canSelectIssues = !disableUserActions && !selectionHelpers.isSelectionDisabled;

  const workItemLink = generateWorkItemLink({
    workspaceSlug: workspaceSlug?.toString(),
    projectId: issueDetail?.project_id,
    issueId,
    projectIdentifier,
    sequenceId: issueDetail?.sequence_id,
    isEpic,
  });

  return (
    <>
      {/* Dedicated select column — its own frozen cell at the far left, always
          visible (ClickUp/Notion-style) so the checkbox column anchors the row. */}
      <td className="relative left-0 z-[11] h-9 w-12 min-w-12 border-r-[0.5px] border-b-[0.5px] border-subtle bg-surface-1 group-[.selected-issue-row]:bg-accent-primary/5 group-[.selected-issue-row]:hover:bg-accent-primary/10 md:sticky">
        {projectId && canSelectIssues && (
          <Tooltip
            tooltipContent={
              <>
                Only tasks within the current
                <br />
                project can be selected.
              </>
            }
            disabled={issueDetail.project_id === projectId}
          >
            <div className="flex h-full w-full items-center justify-center">
              <MultipleSelectEntityAction
                className={cn("opacity-60 transition-opacity hover:opacity-100", {
                  "opacity-100": isIssueSelected,
                })}
                groupId={SPREADSHEET_SELECT_GROUP}
                id={issueDetail.id}
                selectionHelpers={selectionHelpers}
                disabled={issueDetail.project_id !== projectId}
              />
            </div>
          </Tooltip>
        )}
      </td>
      {/* Title column, frozen to the right of the select column. */}
      <td
        id={`issue-${issueId}`}
        ref={cellRef}
        tabIndex={0}
        // Bright-pink selection box when the task (name) cell is focused/selected.
        className="group/list-block relative left-0 z-10 max-w-lg overflow-hidden bg-surface-1 outline-none transition duration-150 focus:z-[1] focus:rounded-[3px] focus:ring-2 focus:ring-inset focus:ring-[#ec4899] md:sticky md:left-12"
      >
        <ControlLink
          href={workItemLink}
          onClick={() => handleIssuePeekOverview(issueDetail)}
          className="outline-none"
          disabled={!!issueDetail?.tempId}
        >
          <Row
            // HUGGING + an explicit px-page-x so the title lines up with the
            // header label (the header's Tasks cell uses the same inset).
            variant={ERowVariant.HUGGING}
            className={cn(
              // Tightened the row from h-11 (44px) → h-9 (36px) for a denser
              // spreadsheet — scanning a long task list, the extra 8px per row
              // was wasted breathing room. Cells in IssueColumn match.
              "group clickable z-10 flex h-9 w-full cursor-pointer items-center border-r-[0.5px] border-subtle bg-transparent px-page-x text-13 group-[.selected-issue-row]:bg-accent-primary/5 after:absolute group-[.selected-issue-row]:hover:bg-accent-primary/10",
              {
                "border-b-[0.5px]": !getIsIssuePeeked(issueDetail.id),
                "border border-accent-strong hover:border-accent-strong":
                  getIsIssuePeeked(issueDetail.id) && nestingLevel === peekIssue?.nestingLevel,
              }
            )}
          >
            {/* Workitem section — min-w-0 so the title truncates within a resized
                column instead of overflowing into the next cell. */}
            <div className="flex min-w-0 flex-grow items-center gap-0.5 py-1">
              {/* sub issues indentation */}
              {nestingLevel !== 0 && <div style={{ width: subIssueIndentation }} />}

              {/* sub-issues chevron. Bumped color from `text-placeholder`
                  (very faded) to `text-secondary` with a subtle hover bg so
                  it reads as a real disclosure control, not decoration. */}
              {subIssuesCount > 0 && !isEpic && (
                <button
                  type="button"
                  className="grid size-5 flex-shrink-0 place-items-center rounded-xs text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                  onClick={handleToggleExpand}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? "Collapse subtasks" : "Expand subtasks"}
                >
                  <ChevronRightIcon
                    className={cn("size-4 transition-transform", {
                      "rotate-90": isExpanded,
                    })}
                    strokeWidth={2.5}
                  />
                </button>
              )}

              <div className="my-auto flex h-full w-full items-center justify-between gap-2 truncate">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <div className="min-w-0 truncate">
                    <Tooltip tooltipContent={issueDetail.name} isMobile={isMobile}>
                      <div
                        className="cursor-pointer truncate text-left text-13 text-primary focus:outline-none"
                        tabIndex={-1}
                      >
                        {issueDetail.name}
                      </div>
                    </Tooltip>
                  </div>
                  {/* ClickUp-style inline subtask count chip after the title.
                      Doubles as expand/collapse — the small chevron on the
                      left is easy to miss, so the count chip itself toggles
                      the same `isExpanded` state. */}
                  {subIssuesCount > 0 && !isEpic && (
                    <Tooltip
                      tooltipContent={
                        isExpanded
                          ? "Hide subtasks"
                          : `${subIssuesCount} subtask${subIssuesCount === 1 ? "" : "s"} — click to expand`
                      }
                      isMobile={isMobile}
                    >
                      <button
                        type="button"
                        onClick={handleToggleExpand}
                        aria-expanded={isExpanded}
                        className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-lg bg-layer-1 px-1 py-0.5 text-11 font-medium text-tertiary transition-colors hover:bg-layer-2 hover:text-primary"
                      >
                        <GitBranch className="size-3" strokeWidth={2} />
                        {subIssuesCount}
                      </button>
                    </Tooltip>
                  )}
                </div>
                <div
                  role="presentation"
                  className={`opacity-0 transition-opacity group-hover:opacity-100 ${isMenuActive ? "!opacity-100" : ""}`}
                  // Click absorber — the inner quickActions buttons carry the
                  // real semantics; this wrapper exists only to stop the row
                  // click from bubbling up to the <ControlLink> and triggering
                  // peek navigation.
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {quickActions({
                    issue: issueDetail,
                    parentRef: cellRef,
                    customActionButton,
                    portalElement: portalElement.current,
                  })}
                </div>
              </div>
            </div>
          </Row>
        </ControlLink>
      </td>
      {/* Rest of the columns */}
      {spreadsheetColumnsList.map((property) => (
        <IssueColumn
          key={property}
          displayProperties={displayProperties}
          issueDetail={issueDetail}
          disableUserActions={disableUserActions}
          property={property}
          updateIssue={updateIssue}
          isEstimateEnabled={isEstimateEnabled}
        />
      ))}
      {/* Custom-field value cells — inline editors keyed by field id. */}
      {customFields.map((field) => (
        <td
          key={field.id}
          className="h-9 min-w-36 border-r-[0.5px] border-b-[0.5px] border-subtle text-13 outline-none group-[.selected-issue-row]:bg-accent-primary/5"
        >
          <CustomFieldColumn
            customField={field}
            issue={issueDetail}
            disabled={disableUserActions}
            updateIssue={updateIssue}
          />
        </td>
      ))}
      {/* Trailing cell under the "add column" (+) header. */}
      <td className="h-9 border-b-[0.5px] border-subtle bg-surface-1 group-[.selected-issue-row]:bg-accent-primary/5" />
    </>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MutableRefObject } from "react";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachInstruction, extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { observer } from "mobx-react";
// plane helpers
import { useOutsideClickDetector } from "@plane/hooks";
// types
import type { IIssueDisplayProperties, TIssue, TIssueMap } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// components
import { DropIndicator } from "@plane/ui";
import RenderIfVisible from "@/components/core/render-if-visible-HOC";
import { ListLoaderItemRow } from "@/components/ui/loader/layouts/list-layout-loader";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { usePlatformOS } from "@/hooks/use-platform-os";
// types
import { HIGHLIGHT_CLASS, getIssueBlockId, isIssueNew } from "../utils";
import { IssueBlock } from "./block";
import type { TRenderQuickActions } from "./list-view-types";

type Props = {
  issueId: string;
  issuesMap: TIssueMap;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  canEditProperties: (projectId: string | undefined) => boolean;
  displayProperties: IIssueDisplayProperties | undefined;
  nestingLevel: number;
  spacingLeft?: number;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  selectionHelpers: TSelectionHelper;
  groupId: string;
  isDragAllowed: boolean;
  canDropOverIssue: boolean;
  isParentIssueBeingDragged?: boolean;
  isLastChild?: boolean;
  // True when this row is the last subtask in its parent's children list.
  // Drives the tree-branch visual in IssueBlock — last sibling stops the
  // vertical line at the row's midpoint instead of extending it down to a
  // (non-existent) next sibling.
  isLastSibling?: boolean;
  shouldRenderByDefault?: boolean;
  isEpic?: boolean;
};

export const IssueBlockRoot = observer(function IssueBlockRoot(props: Props) {
  const {
    issueId,
    issuesMap,
    groupId,
    updateIssue,
    quickActions,
    canEditProperties,
    displayProperties,
    nestingLevel,
    spacingLeft = 14,
    containerRef,
    isDragAllowed,
    canDropOverIssue,
    isParentIssueBeingDragged = false,
    isLastChild = false,
    isLastSibling = false,
    selectionHelpers,
    shouldRenderByDefault,
    isEpic = false,
  } = props;
  // states
  const [isExpanded, setExpanded] = useState<boolean>(false);
  const [instruction, setInstruction] = useState<"DRAG_OVER" | "DRAG_BELOW" | undefined>(undefined);
  const [isCurrentBlockDragging, setIsCurrentBlockDragging] = useState(false);
  // ref
  const issueBlockRef = useRef<HTMLDivElement | null>(null);
  // hooks
  const { isMobile } = usePlatformOS();
  // store hooks
  const { subIssues: subIssuesStore } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);

  const isSubIssue = nestingLevel !== 0;

  // Track the LAST subtask row's height so the tree-branch vertical can clip
  // exactly at its midpoint (where the elbow's horizontal hook taps in)
  // instead of a fixed 22px guess that fails for multi-line task names or
  // when extra properties bump the row height. Re-measures via
  // ResizeObserver, so resizing the window or expanding inline properties
  // keeps the clip accurate.
  const [lastChildMidpoint, setLastChildMidpoint] = useState(22);

  useEffect(() => {
    const blockElement = issueBlockRef.current;

    if (!blockElement) return;

    return combine(
      dropTargetForElements({
        element: blockElement,
        canDrop: ({ source }) => source?.data?.id !== issueId && !isSubIssue && canDropOverIssue,
        getData: ({ input, element }) => {
          const data = { id: issueId, type: "ISSUE" };

          // attach instruction for last in list
          return attachInstruction(data, {
            input,
            element,
            currentLevel: 0,
            indentPerLevel: 0,
            mode: isLastChild ? "last-in-group" : "standard",
          });
        },
        onDrag: ({ self }) => {
          const extractedInstruction = extractInstruction(self?.data)?.type;
          // check if the highlight is to be shown above or below
          setInstruction(
            extractedInstruction
              ? extractedInstruction === "reorder-below" && isLastChild
                ? "DRAG_BELOW"
                : "DRAG_OVER"
              : undefined
          );
        },
        onDragLeave: () => {
          setInstruction(undefined);
        },
        onDrop: () => {
          setInstruction(undefined);
        },
      })
    );
  }, [issueId, isLastChild, issueBlockRef, isSubIssue, canDropOverIssue, setInstruction]);

  useOutsideClickDetector(issueBlockRef, () => {
    issueBlockRef?.current?.classList?.remove(HIGHLIGHT_CLASS);
  });

  const subIssues = subIssuesStore.subIssuesByIssueId(issueId);

  // Re-anchor the tree-branch clip whenever the last subtask's row moves
  // or resizes. We need to land at the ROW's midpoint, not the IssueBlockRoot
  // wrapper's midpoint — the wrapper also contains the row's border-b and
  // (when the last child itself is expanded) its own children area, so
  // `wrapper.height / 2` lands in the wrong place.
  //
  // Strategy: find the `.group/list-block` element (the actual <Row>) inside
  // the last subtask, get its midpoint in viewport coords, subtract from the
  // children-wrapper's bottom. The result is the exact CSS `bottom` value
  // the line needs to hit the row's midpoint.
  //
  // useLayoutEffect (not useEffect) so the measurement happens before paint
  // — otherwise the user sees a one-frame flash of the 22px fallback before
  // we correct it.
  useLayoutEffect(() => {
    if (!isExpanded || !subIssues || subIssues.length === 0) return;
    const lastId = subIssues[subIssues.length - 1];
    const lastEl = document.getElementById(getIssueBlockId(lastId, groupId));
    if (!lastEl) return;
    // The <Row> inside the last subtask carries this Tailwind group class —
    // see block.tsx where the Row is rendered. Selector escapes the slash.
    const rowEl = lastEl.querySelector(".group\\/list-block") as HTMLElement | null;
    const wrapperEl = lastEl.parentElement;
    if (!rowEl || !wrapperEl) return;
    const update = () => {
      const wrapperRect = wrapperEl.getBoundingClientRect();
      const rowRect = rowEl.getBoundingClientRect();
      if (rowRect.height <= 0) return;
      // bottom-from-wrapper-bottom = (wrapper.bottom_y) - (row.midpoint_y)
      const bottomValue = wrapperRect.bottom - (rowRect.top + rowRect.height / 2);
      setLastChildMidpoint(bottomValue);
    };
    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(rowEl);
    resizeObserver.observe(wrapperEl);
    return () => resizeObserver.disconnect();
  }, [isExpanded, subIssues, groupId]);

  if (!issueId || !issuesMap[issueId]?.created_at) return null;
  return (
    <div className="relative" ref={issueBlockRef} id={getIssueBlockId(issueId, groupId)}>
      <DropIndicator classNames={"absolute top-0 z-[2]"} isVisible={instruction === "DRAG_OVER"} />
      <RenderIfVisible
        key={`${issueId}`}
        root={containerRef}
        classNames={`relative ${isLastChild && !isExpanded ? "" : "border-b border-b-subtle"}`}
        verticalOffset={100}
        defaultValue={shouldRenderByDefault || (issuesMap[issueId] ? isIssueNew(issuesMap[issueId]) : false)}
        placeholderChildren={<ListLoaderItemRow shouldAnimate={false} renderForPlaceHolder defaultPropertyCount={4} />}
        shouldRecordHeights={isMobile}
      >
        <IssueBlock
          issueId={issueId}
          issuesMap={issuesMap}
          groupId={groupId}
          updateIssue={updateIssue}
          quickActions={quickActions}
          canEditProperties={canEditProperties}
          displayProperties={displayProperties}
          isExpanded={isExpanded}
          setExpanded={setExpanded}
          nestingLevel={nestingLevel}
          spacingLeft={spacingLeft}
          isLastSibling={isLastSibling}
          selectionHelpers={selectionHelpers}
          canDrag={!isSubIssue && isDragAllowed}
          isCurrentBlockDragging={isParentIssueBeingDragged || isCurrentBlockDragging}
          setIsCurrentBlockDragging={setIsCurrentBlockDragging}
          isEpic={isEpic}
        />
      </RenderIfVisible>

      {isExpanded && !isEpic && (subIssues?.length ?? 0) > 0 && (
        // Wrap all child rows in a relatively-positioned container so we can
        // paint the tree-branch vertical as ONE continuous DOM element across
        // every sibling. The previous per-row approach (upper-L + lower
        // extension on each row) tried to stitch together a continuous line
        // out of pieces, but the row's variable inner-content height made
        // every offset calculation brittle — visible breaks would re-appear
        // at zoom levels other than 100% or when a subtask name wrapped to
        // two lines. One line, one element, no stitching.
        <div className="relative">
          {/*
            The single vertical. Stops 22px short of the bottom (≈ half of
            `min-h-11`, the row's minimum height) so it terminates at the
            LAST subtask's midpoint where that row's curved elbow taps in,
            instead of dangling below the last child. The `left` calc lines
            it up with the elbow's x-position: the elbow is at `-12px` of
            the inner div, which itself sits at `var(--padding-page-x) +
            ${spacingLeft + 12}px` from this wrapper's edge — net is
            `var(--padding-page-x) + ${spacingLeft}px`.
          */}
          <div
            aria-hidden
            className="pointer-events-none absolute border-l border-strong"
            style={{
              left: `calc(var(--padding-page-x) + ${spacingLeft}px)`,
              top: 0,
              // Measured last-child midpoint, kept in sync via ResizeObserver
              // — see the useEffect above. Falls back to 22px on first paint
              // (matches the row's `min-h-11` of 44px / 2).
              bottom: `${lastChildMidpoint}px`,
            }}
          />
          {subIssues?.map((subIssueId, index) => (
            <IssueBlockRoot
              key={`${subIssueId}`}
              issueId={subIssueId}
              issuesMap={issuesMap}
              updateIssue={updateIssue}
              quickActions={quickActions}
              canEditProperties={canEditProperties}
              displayProperties={displayProperties}
              nestingLevel={nestingLevel + 1}
              spacingLeft={spacingLeft + 12}
              containerRef={containerRef}
              selectionHelpers={selectionHelpers}
              groupId={groupId}
              isDragAllowed={isDragAllowed}
              canDropOverIssue={canDropOverIssue}
              isParentIssueBeingDragged={isParentIssueBeingDragged || isCurrentBlockDragging}
              // Still threaded so each leaf row knows whether to draw the
              // curved elbow vs. plain. (The continuous vertical itself lives
              // on the wrapper above — the leaf only draws the corner.)
              isLastSibling={index === (subIssues?.length ?? 0) - 1}
              shouldRenderByDefault={isExpanded}
            />
          ))}
        </div>
      )}
      {isLastChild && <DropIndicator classNames={"absolute z-[2]"} isVisible={instruction === "DRAG_BELOW"} />}
    </div>
  );
});

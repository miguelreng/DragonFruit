/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MutableRefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
// components
import type { TIssue, IIssueDisplayProperties, TIssueMap, TGroupedIssues } from "@plane/types";
// hooks
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
// types
import { IssueBlockRoot } from "./block-root";
import type { TRenderQuickActions } from "./list-view-types";

interface Props {
  issueIds: TGroupedIssues | any;
  issuesMap: TIssueMap;
  groupId: string;
  canEditProperties: (projectId: string | undefined) => boolean;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  displayProperties: IIssueDisplayProperties | undefined;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  isDragAllowed: boolean;
  canDropOverIssue: boolean;
  selectionHelpers: TSelectionHelper;
  isEpic?: boolean;
}

// Approximate row height before measurement kicks in. Rows have a min-height
// of 44px (h-11) and grow when sub-issues expand; the virtualizer will measure
// real heights via measureElement on first paint.
const ESTIMATED_ROW_HEIGHT = 44;
// Number of rows to pre-render outside the viewport on each side. Small enough
// to keep render cost low, large enough that fast scrolls don't show blank
// space.
const OVERSCAN = 6;
// Above this many rows in a group, switch on virtualization. Below this it's
// cheaper to render everything than to pay the virtualizer's bookkeeping cost
// + the scrollMargin measurement work.
const VIRTUALIZE_THRESHOLD = 30;

export function IssueBlocksList(props: Props) {
  const {
    issueIds,
    issuesMap,
    groupId,
    updateIssue,
    quickActions,
    displayProperties,
    canEditProperties,
    containerRef,
    selectionHelpers,
    isDragAllowed,
    canDropOverIssue,
    isEpic = false,
  } = props;

  if (!issueIds || issueIds.length === 0) {
    return <div className="relative h-full w-full" />;
  }

  // Short groups bypass virtualization — the virtualizer's scrollMargin
  // measurement effect would add overhead with no payoff for ~30 rows.
  if (issueIds.length < VIRTUALIZE_THRESHOLD) {
    return (
      <div className="relative h-full w-full">
        {issueIds.map((issueId: string, index: number) => (
          <IssueBlockRoot
            key={issueId}
            issueId={issueId}
            issuesMap={issuesMap}
            updateIssue={updateIssue}
            quickActions={quickActions}
            canEditProperties={canEditProperties}
            displayProperties={displayProperties}
            nestingLevel={0}
            spacingLeft={0}
            containerRef={containerRef}
            selectionHelpers={selectionHelpers}
            groupId={groupId}
            isLastChild={index === issueIds.length - 1}
            isDragAllowed={isDragAllowed}
            canDropOverIssue={canDropOverIssue}
            isEpic={isEpic}
          />
        ))}
      </div>
    );
  }

  return (
    <VirtualizedBlocks
      issueIds={issueIds}
      issuesMap={issuesMap}
      groupId={groupId}
      updateIssue={updateIssue}
      quickActions={quickActions}
      displayProperties={displayProperties}
      canEditProperties={canEditProperties}
      containerRef={containerRef}
      selectionHelpers={selectionHelpers}
      isDragAllowed={isDragAllowed}
      canDropOverIssue={canDropOverIssue}
      isEpic={isEpic}
    />
  );
}

function VirtualizedBlocks(props: Props) {
  const {
    issueIds,
    issuesMap,
    groupId,
    updateIssue,
    quickActions,
    displayProperties,
    canEditProperties,
    containerRef,
    selectionHelpers,
    isDragAllowed,
    canDropOverIssue,
    isEpic = false,
  } = props;

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // scrollMargin tells the virtualizer where this list's content begins in
  // the scroll container's coordinate space. Without it, every grouped list
  // would think it starts at scrollTop = 0 and render the wrong items.
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const scroll = containerRef.current;
    if (!wrapper || !scroll) return;

    const compute = () => {
      const wrapperRect = wrapper.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      const offset = wrapperRect.top - scrollRect.top + scroll.scrollTop;
      setScrollMargin((prev) => (Math.abs(prev - offset) > 1 ? offset : prev));
    };
    compute();

    const ro = new ResizeObserver(compute);
    ro.observe(wrapper);
    ro.observe(scroll);

    // Re-measure when prior groups expand/collapse — that shifts our position
    // in the scroll container but doesn't trigger a ResizeObserver on us.
    const onScroll = () => compute();
    scroll.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      ro.disconnect();
      scroll.removeEventListener("scroll", onScroll);
    };
  }, [containerRef]);

  const virtualizer = useVirtualizer({
    count: issueIds.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin,
    measureElement: (el) => el.getBoundingClientRect().height,
    getItemKey: (index) => issueIds[index],
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Force the virtualizer to recompute when the list length changes (loadMore,
  // create, delete) — without this, newly appended items can fall outside the
  // measured range until the next scroll.
  useEffect(() => {
    virtualizer.measure();
  }, [issueIds.length, virtualizer]);

  return (
    <div ref={wrapperRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualItems.map((vi) => {
        const issueId = issueIds[vi.index];
        return (
          <div
            key={issueId}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start - scrollMargin}px)`,
            }}
          >
            <IssueBlockRoot
              issueId={issueId}
              issuesMap={issuesMap}
              updateIssue={updateIssue}
              quickActions={quickActions}
              canEditProperties={canEditProperties}
              displayProperties={displayProperties}
              nestingLevel={0}
              spacingLeft={0}
              containerRef={containerRef}
              selectionHelpers={selectionHelpers}
              groupId={groupId}
              isLastChild={vi.index === issueIds.length - 1}
              isDragAllowed={isDragAllowed}
              canDropOverIssue={canDropOverIssue}
              shouldRenderByDefault
              isEpic={isEpic}
            />
          </div>
        );
      })}
    </div>
  );
}

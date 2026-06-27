/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { STICKIES_PER_PAGE } from "@plane/constants";
import { ContentWrapper, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { STICKIES_VIEW_MODE_STORAGE_KEY, type ViewMode } from "@/components/core/view-mode-toggle";
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import useLocalStorage from "@/hooks/use-local-storage";
import { useSticky } from "@/hooks/use-stickies";
import { StickiesLayout } from "./stickies-list";

export const StickiesInfinite = observer(function StickiesInfinite() {
  const { workspaceSlug, projectId } = useParams();
  const projectIdStr = projectId ? projectId.toString() : undefined;
  // Project route → scope to the project; workspace route → scope to the workspace.
  const scopeKey = projectIdStr ?? workspaceSlug?.toString() ?? "";
  // hooks
  const { fetchWorkspaceStickies, fetchNextWorkspaceStickies, getWorkspaceStickyIds, loader, paginationInfo } =
    useSticky();
  //state
  const [elementRef, setElementRef] = useState<HTMLDivElement | null>(null);

  // ref
  const containerRef = useRef<HTMLDivElement>(null);
  // view mode (kept in sync with the header toggle via the shared local storage key)
  const { storedValue: storedViewMode } = useLocalStorage<ViewMode>(STICKIES_VIEW_MODE_STORAGE_KEY, "grid");
  const viewMode: ViewMode = storedViewMode ?? "grid";

  useSWR(
    workspaceSlug ? `WORKSPACE_STICKIES_${scopeKey}` : null,
    workspaceSlug ? () => fetchWorkspaceStickies(workspaceSlug.toString(), projectIdStr) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const handleLoadMore = () => {
    if (loader === "pagination") return;
    fetchNextWorkspaceStickies(workspaceSlug?.toString(), projectIdStr);
  };

  const hasNextPage = paginationInfo?.next_page_results && paginationInfo?.next_cursor !== undefined;
  const shouldObserve = hasNextPage && loader !== "pagination";
  const workspaceStickies = getWorkspaceStickyIds(scopeKey);
  useIntersectionObserver(containerRef, shouldObserve ? elementRef : null, handleLoadMore);

  return (
    <ContentWrapper
      ref={containerRef}
      // Reserve the scrollbar gutter on both edges (and trim the default
      // page padding to compensate) so the 16px scrollbar doesn't push the
      // right margin wider than the left — stickies stay centered.
      className="space-y-4 !px-1 [scrollbar-gutter:stable_both-edges]"
    >
      <StickiesLayout
        workspaceSlug={workspaceSlug.toString()}
        viewMode={viewMode}
        intersectionElement={
          hasNextPage &&
          workspaceStickies?.length >= STICKIES_PER_PAGE && (
            <div
              className={cn("box-border flex min-h-[300px] w-full p-2")}
              ref={setElementRef}
              id="intersection-element"
            >
              <div className="flex min-h-[300px] w-full rounded-lg">
                <Loader className="h-full w-full">
                  <Loader.Item height="100%" width="100%" />
                </Loader>
              </div>
            </div>
          )
        }
      />
    </ContentWrapper>
  );
});

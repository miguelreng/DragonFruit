/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type {
  DropTargetRecord,
  DragLocationHistory,
} from "@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types";
import type { ElementDragPayload } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

// plane imports
import { EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { PlusIcon } from "@plane/propel/icons";
import { EUserWorkspaceRoles } from "@plane/types";
import { cn } from "@plane/utils";
// assets
import darkStickiesAsset from "@/app/assets/empty-state/stickies/stickies-dark.webp?url";
import lightStickiesAsset from "@/app/assets/empty-state/stickies/stickies-light.webp?url";
import darkStickiesSearchAsset from "@/app/assets/empty-state/stickies/stickies-search-dark.webp?url";
import lightStickiesSearchAsset from "@/app/assets/empty-state/stickies/stickies-search-light.webp?url";
// components
import type { ViewMode } from "@/components/core/view-mode-toggle";
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
import { SimpleEmptyState } from "@/components/empty-state/simple-empty-state-root";
import { StickiesEmptyState } from "@/components/home/widgets/empty-states/stickies";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useSticky } from "@/hooks/use-stickies";
// local imports
import { useStickyOperations } from "../sticky/use-operations";
import { StickiesLoader } from "./stickies-loader";
import { StickyDNDWrapper } from "./sticky-dnd-wrapper";
import { getInstructionFromPayload } from "./sticky.helpers";

type TStickiesLayout = {
  workspaceSlug: string;
  intersectionElement?: React.ReactNode | null;
  viewMode?: ViewMode;
};

type TProps = TStickiesLayout & {
  columnCount: number;
};

// Local storage key shared by the stickies page header toggle and the layout.
export const STICKIES_VIEW_MODE_STORAGE_KEY = "stickies_view_mode";

const handleStickyLayout = () => {};

const getStickyColumnCount = (width: number | null): number => {
  if (width === null) return 3;
  if (width < 640) return 1;
  if (width < 1024) return 2;
  if (width < 1440) return 3;
  return 4;
};

export const StickiesList = observer(function StickiesList(props: TProps) {
  const { workspaceSlug, intersectionElement, columnCount, viewMode = "grid" } = props;
  // navigation
  const pathname = usePathname();
  // theme hook
  const { resolvedTheme } = useTheme();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getWorkspaceStickyIds, toggleShowNewSticky, searchQuery, loader } = useSticky();
  const { allowPermissions } = useUserPermissions();
  // sticky operations
  const { stickyOperations } = useStickyOperations({ workspaceSlug: workspaceSlug?.toString() });
  // derived values
  const workspaceStickyIds = getWorkspaceStickyIds(workspaceSlug?.toString());
  const itemWidth = "100%";
  const isStickiesPage = pathname?.includes("stickies");
  const hasGuestLevelPermissions = allowPermissions(
    [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
    EUserPermissionsLevel.WORKSPACE
  );
  const stickiesResolvedPath = resolvedTheme === "light" ? lightStickiesAsset : darkStickiesAsset;
  const stickiesSearchResolvedPath = resolvedTheme === "light" ? lightStickiesSearchAsset : darkStickiesSearchAsset;

  const handleDrop = (self: DropTargetRecord, source: ElementDragPayload, location: DragLocationHistory) => {
    const dropTargets = location?.current?.dropTargets ?? [];
    if (!dropTargets || dropTargets.length <= 0) return;

    const dropTarget = dropTargets[0];
    if (!dropTarget?.data?.id || !source.data?.id) return;

    const instruction = getInstructionFromPayload(dropTarget, source, location);
    const droppedId = dropTarget.data.id;
    const sourceId = source.data.id;

    try {
      if (!instruction || !droppedId || !sourceId) return;
      stickyOperations.updatePosition(workspaceSlug, sourceId as string, droppedId as string, instruction);
    } catch (error) {
      console.error("Error reordering sticky:", error);
    }
  };

  if (loader === "init-loader") {
    return <StickiesLoader />;
  }

  if (loader === "loaded" && workspaceStickyIds.length === 0) {
    return (
      <div className="grid size-full place-items-center">
        {isStickiesPage ? (
          <>
            {searchQuery ? (
              <SimpleEmptyState
                title={t("stickies.empty_state.search.title")}
                description={t("stickies.empty_state.search.description")}
                assetPath={stickiesSearchResolvedPath}
              />
            ) : (
              <DetailedEmptyState
                title={t("stickies.empty_state.general.title")}
                description={t("stickies.empty_state.general.description")}
                assetPath={stickiesResolvedPath}
                primaryButton={{
                  prependIcon: <PlusIcon className="size-4" />,
                  text: t("stickies.empty_state.general.primary_button.text"),
                  onClick: () => {
                    toggleShowNewSticky(true);
                    stickyOperations.create();
                  },
                  disabled: !hasGuestLevelPermissions,
                }}
              />
            )}
          </>
        ) : (
          <StickiesEmptyState />
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className={cn("transition-opacity duration-300 ease-in-out", viewMode === "list" ? "flex flex-col" : "gap-4")}
        // Masonry: CSS multi-columns let stickies keep their natural heights.
        style={viewMode === "grid" ? { columnCount } : undefined}
      >
        {workspaceStickyIds.map((stickyId, index) => (
          <StickyDNDWrapper
            key={stickyId}
            stickyId={stickyId}
            workspaceSlug={workspaceSlug.toString()}
            itemWidth={itemWidth}
            handleDrop={handleDrop}
            isLastChild={index === workspaceStickyIds.length - 1}
            isInFirstRow={index === 0}
            isInLastRow={false}
            handleLayout={handleStickyLayout}
            className={cn("mb-4", { "break-inside-avoid": viewMode === "grid" })}
          />
        ))}
      </div>
      {intersectionElement}
    </>
  );
});

export function StickiesLayout(props: TStickiesLayout) {
  // states
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  // refs
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref?.current) return;

    setContainerWidth(ref?.current.offsetWidth);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(ref?.current);
    return () => resizeObserver.disconnect();
  }, []);

  const columnCount = getStickyColumnCount(containerWidth);

  return (
    <div ref={ref} className="size-full">
      <StickiesList {...props} columnCount={columnCount} />
    </div>
  );
}

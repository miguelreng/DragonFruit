/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
// plane imports
import type { EIssueLayoutTypes, IFavorite } from "@plane/types";
// components
import { getPageName } from "@plane/utils";
import {
  generateFavoriteItemLink,
  getFavoriteItemIcon,
  getFavoriteViewIcon,
} from "@/components/workspace/sidebar/favorites/favorite-items/common";
// helpers
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useProjectView } from "@/hooks/store/use-project-view";
// plane web hooks
import { EPageStoreType, usePage } from "@/plane-web/hooks/store";
import { useAdditionalFavoriteItemDetails } from "@/plane-web/hooks/use-additional-favorite-item-details";

export const useFavoriteItemDetails = (workspaceSlug: string, favorite: IFavorite) => {
  const {
    entity_identifier: favoriteItemId,
    entity_data: { logo_props: favoriteItemLogoProps },
    entity_type: favoriteItemEntityType,
  } = favorite;
  const favoriteItemName = favorite?.entity_data?.name || favorite?.name;
  // store hooks
  const { getViewById, fetchViews } = useProjectView();
  const { getProjectById } = useProject();
  const { getCycleById } = useCycle();
  const { getModuleById } = useModule();

  // Backfill for older view favorites that were created before we started
  // snapshotting `view_layout` into `entity_data`. When the sidebar mounts and
  // the view isn't in the store (parent project not opened this session),
  // pull the project's views once so `getViewById` resolves and the layout
  // icon renders. New favorites already include the snapshot, so this is
  // a one-time hydration for historic data.
  useEffect(() => {
    if (
      favoriteItemEntityType === "view" &&
      favorite.project_id &&
      favoriteItemId &&
      !getViewById(favoriteItemId) &&
      !favorite.entity_data?.view_layout
    ) {
      fetchViews(workspaceSlug, favorite.project_id).catch(() => {
        // Silent — the FallbackIcon still renders if the fetch fails.
      });
    }
    // We only want this to run when the favorite identity changes, not on
    // every store re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteItemEntityType, favoriteItemId, favorite.project_id]);
  // additional details
  const { getAdditionalFavoriteItemDetails } = useAdditionalFavoriteItemDetails();
  // derived values
  const pageDetail = usePage({
    pageId: favoriteItemId ?? "",
    storeType: EPageStoreType.PROJECT,
  });
  const viewDetails = getViewById(favoriteItemId ?? "");
  const cycleDetail = getCycleById(favoriteItemId ?? "");
  const moduleDetail = getModuleById(favoriteItemId ?? "");
  const currentProjectDetails = getProjectById(favorite.project_id ?? "");

  let itemIcon;
  let itemTitle;
  const itemLink = generateFavoriteItemLink(workspaceSlug.toString(), favorite);

  switch (favoriteItemEntityType) {
    case "project": {
      itemTitle = currentProjectDetails?.name ?? favoriteItemName;
      // If the favorite was created from the Tasks page, `view_layout` is
      // stashed in entity_data — render the layout icon to make it clear
      // this favorite points to "tasks in <layout>", not the project home.
      // Project favorites added from the project list (no layout snapshot)
      // keep the project emoji.
      const projectLayout = favorite.entity_data?.view_layout as EIssueLayoutTypes | undefined;
      itemIcon = projectLayout
        ? getFavoriteViewIcon(projectLayout)
        : getFavoriteItemIcon("project", currentProjectDetails?.logo_props || favoriteItemLogoProps);
      break;
    }
    case "page":
      itemTitle = getPageName(pageDetail?.name ?? favoriteItemName);
      itemIcon = getFavoriteItemIcon("page", pageDetail?.logo_props ?? favoriteItemLogoProps);
      break;
    case "view":
      itemTitle = viewDetails?.name ?? favoriteItemName;
      // For saved Views the layout (kanban / list / gantt / etc.) reads more
      // usefully than the emoji — see getFavoriteViewIcon's docstring. The
      // `display_filters.layout` field is typed `any` upstream, so we cast at
      // the boundary into the strict enum the icon component expects.
      // Fall back to the layout snapshot stored on the favorite itself when
      // `viewDetails` isn't loaded (e.g. the user hasn't opened this view's
      // parent project yet this session, so `fetchViews` hasn't run).
      itemIcon = getFavoriteViewIcon(
        (viewDetails?.display_filters?.layout ?? favorite.entity_data?.view_layout) as
          | EIssueLayoutTypes
          | undefined
      );
      break;
    case "cycle":
      itemTitle = cycleDetail?.name ?? favoriteItemName;
      itemIcon = getFavoriteItemIcon("cycle");
      break;
    case "module":
      itemTitle = moduleDetail?.name ?? favoriteItemName;
      itemIcon = getFavoriteItemIcon("module");
      break;
    default: {
      const additionalDetails = getAdditionalFavoriteItemDetails(workspaceSlug, favorite);
      itemTitle = additionalDetails.itemTitle;
      itemIcon = additionalDetails.itemIcon;
      break;
    }
  }

  return { itemIcon, itemTitle, itemLink };
};

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@/components/icons/propel-shim";
// plane imports
import { EIssueLayoutTypes } from "@plane/types";
import type { IFavorite, TLogoProps } from "@plane/types";
// components
import { IssueLayoutIcon } from "@/components/issues/issue-layouts/layout-icon";
// plane web constants
import { FAVORITE_ITEM_ICONS, FAVORITE_ITEM_LINKS } from "@/constants/sidebar-favorites";

export const getFavoriteItemIcon = (type: string, logo?: TLogoProps) => {
  const Icon = FAVORITE_ITEM_ICONS[type] || PageIcon;

  return (
    <>
      <div className="hidden size-5 items-center justify-center group-hover:flex">
        <Icon className="m-auto size-4 flex-shrink-0 stroke-[1.5]" />
      </div>
      <div className="flex size-5 items-center justify-center group-hover:hidden">
        {logo?.in_use ? (
          <Logo logo={logo} size={16} type={type === "project" ? "material" : "lucide"} />
        ) : (
          <Icon className="m-auto size-4 flex-shrink-0 stroke-[1.5]" />
        )}
      </div>
    </>
  );
};

/**
 * Saved Views are "shaped lists of tasks" — kanban, list, calendar, gantt,
 * spreadsheet. Their identity in the sidebar reads better as the layout icon
 * than as the user-picked emoji: scanning the favorites strip, the user can
 * tell at a glance which favorite is the timeline vs. the board vs. the list,
 * without having to remember which emoji they assigned to each. The emoji is
 * still visible on the view itself; the favorites strip is where layout-at-a-
 * glance is more useful than personalization.
 *
 * Falls back to the generic ViewsIcon when the view hasn't loaded yet (e.g.
 * sidebar renders before the project's views are fetched) or when the layout
 * isn't one of the known enum values.
 */
export const getFavoriteViewIcon = (layout?: EIssueLayoutTypes) => {
  const FallbackIcon = FAVORITE_ITEM_ICONS.view;
  const isKnownLayout =
    layout === EIssueLayoutTypes.LIST ||
    layout === EIssueLayoutTypes.KANBAN ||
    layout === EIssueLayoutTypes.CALENDAR ||
    layout === EIssueLayoutTypes.SPREADSHEET ||
    layout === EIssueLayoutTypes.GANTT;

  return (
    <div className="flex size-5 items-center justify-center">
      {isKnownLayout && layout ? (
        <IssueLayoutIcon layout={layout} className="m-auto size-[14px] flex-shrink-0 text-tertiary" />
      ) : (
        <FallbackIcon className="m-auto size-4 flex-shrink-0 stroke-[1.5]" />
      )}
    </div>
  );
};

export const generateFavoriteItemLink = (workspaceSlug: string, favorite: IFavorite, resolvedPageType?: string) => {
  // Docs folders are pages that never open in an editor — deep-link the Docs
  // gallery with the folder drilled in instead of the page route.
  // resolvedPageType is a caller-supplied fallback for stale entity_data payloads
  // that predate the page_type snapshot (older favorites may omit it).
  const effectivePageType = resolvedPageType ?? favorite.entity_data?.page_type;
  if (favorite.entity_type === "page" && effectivePageType === "folder")
    return `/${workspaceSlug}/docs/?folder=${favorite.entity_identifier}`;

  const entityLinkDetails = FAVORITE_ITEM_LINKS[favorite.entity_type];

  if (!entityLinkDetails) {
    console.error(`Unrecognized favorite entity type: ${favorite.entity_type}`);
    return `/${workspaceSlug}`;
  }

  // Project favorites that snapshotted a task layout (created via the star
  // on the Tasks page) restore that layout via a `?layout=` query param. The
  // Tasks page reads it once on mount and applies it to display filters. See
  // addProjectToFavorites for the write side.
  const favoriteLayout = favorite.entity_data?.view_layout;
  const opensProjectCalendar = favorite.entity_type === "project" && favoriteLayout === EIssueLayoutTypes.CALENDAR;
  const layoutQuery =
    favorite.entity_type === "project" && favoriteLayout && !opensProjectCalendar
      ? `?layout=${encodeURIComponent(favoriteLayout)}`
      : "";
  const openedFromFavoritesQuery =
    favorite.entity_type === "page" ? `${layoutQuery ? "&" : "?"}openFrom=favorites` : "";

  if (entityLinkDetails.itemLevel === "workspace") {
    return `/${workspaceSlug}/${entityLinkDetails.getLink(favorite)}${layoutQuery}${openedFromFavoritesQuery}`;
  } else if (entityLinkDetails.itemLevel === "project") {
    const projectLink = opensProjectCalendar ? "calendar" : entityLinkDetails.getLink(favorite);
    return `/${workspaceSlug}/projects/${favorite.project_id}/${projectLink}${layoutQuery}${openedFromFavoritesQuery}`;
  } else {
    return `/${workspaceSlug}`;
  }
};

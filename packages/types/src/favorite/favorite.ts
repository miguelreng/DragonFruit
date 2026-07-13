/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

export type IFavorite = {
  id: string;
  name: string;
  entity_type: string;
  /**
   * Layout snapshot stored on the favorite itself (top-level CharField on
   * the UserFavorite model). Written at create time only — POST `view_layout`
   * at the top of the body. On read it's projected back into
   * `entity_data.view_layout` by the serializer, so consumers should read
   * from there. Used by the Tasks-page star to remember which layout the
   * user was on so the sidebar can render the matching icon and the click
   * target can restore the layout.
   */
  view_layout?: string;
  entity_data: {
    id?: string;
    name: string;
    logo_props?: TLogoProps | undefined;
    /**
     * Mirror of the top-level `view_layout` field, projected by the API on
     * read so the sidebar can render the right icon uniformly across
     * entity types (project-with-layout favorites read from the favorite
     * row; saved-View favorites read from the View's own display_filters).
     * Loose-typed string so consumers don't need EIssueLayoutTypes.
     */
    view_layout?: string;
    /**
     * Page sub-type for entity_type "page" favorites, echoed by the API's
     * PageFavoriteLiteSerializer (and written by the client on create).
     * Docs folders ("folder") link to the Docs gallery instead of the page
     * editor and render a folder icon.
     */
    page_type?: string;
  };
  is_folder: boolean;
  sort_order: number;
  parent: string | null;
  entity_identifier?: string | null;
  children: IFavorite[];
  project_id: string | null;
  sequence: number;
  workspace_id: string;
};

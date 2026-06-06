/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TProjectBookmarkMetadata = {
  image_url?: string;
  og_image_url?: string;
  favicon_url?: string;
  site_name?: string;
  og_title?: string;
  og_description?: string;
  og_url?: string;
  source_app?: string;
  captured_text?: string;
  screenshot_source?: string;
  /** AI-generated tags awaiting the user's accept/dismiss. Kept separate from `tags`. */
  suggested_tags?: string[];
  [key: string]: unknown;
};

export type TProjectBookmark = {
  id: string;
  workspace_id: string;
  workspace_slug?: string;
  project_id: string;
  project_name?: string;
  created_by_id?: string;
  title: string;
  description: string;
  url: string;
  entity_type: string;
  entity_identifier: string | null;
  metadata: TProjectBookmarkMetadata;
  tags: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TProjectBookmarkCreatePayload = Partial<
  Pick<
    TProjectBookmark,
    "title" | "description" | "url" | "entity_type" | "entity_identifier" | "metadata" | "tags" | "sort_order"
  >
>;

export type TProjectBookmarkBulkImportResult = {
  bookmarks: TProjectBookmark[];
  created_count: number;
  skipped_count: number;
  errors: { index: number; error: unknown }[];
};

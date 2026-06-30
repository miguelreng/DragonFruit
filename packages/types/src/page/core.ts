/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";
import type { EPageAccess } from "../enums";
import type { TPageExtended } from "./extended";

/**
 * Page sub-type. "doc" is the collaborative rich-text editor;
 * "whiteboard" renders an Excalidraw canvas; "pdf" renders an uploaded PDF.
 */
export type TPageType = "doc" | "whiteboard" | "pdf";

export type TPagePdfViewProps = {
  asset_id: string;
  project_id: string;
  name: string;
  size: number;
  mime_type: "application/pdf";
};

export type TPageViewProps = Record<string, unknown> & {
  pdf?: TPagePdfViewProps;
};

export type TPage = {
  access: EPageAccess | undefined;
  archived_at: string | null | undefined;
  color: string | undefined;
  created_at: Date | undefined;
  created_by: string | undefined;
  description_json: object | undefined;
  description_html: string | undefined;
  /**
   * Short plain-text snippet (~280 chars) derived from `description_html`.
   * Only populated by the workspace pages list endpoint so the docs gallery
   * can render content previews without per-page fetches.
   */
  description_snippet?: string | undefined;
  id: string | undefined;
  is_favorite: boolean;
  is_brief?: boolean;
  /** True when this doc page was created by importing an external AI
   * conversation (Claude/ChatGPT/Gemini) via the browser extension. */
  is_captured_chat?: boolean;
  is_locked: boolean;
  label_ids: string[] | undefined;
  name: string | undefined;
  page_type?: TPageType;
  owned_by: string | undefined;
  project_ids?: string[] | undefined;
  updated_at: Date | undefined;
  updated_by: string | undefined;
  workspace: string | undefined;
  logo_props: TLogoProps | undefined;
  /**
   * Per-page view preferences (full_width, cover image id, etc.) persisted as
   * a JSONField on the API. Keep this loose so new keys can be added without
   * coordinating types across the FE/BE.
   */
  view_props?: TPageViewProps | undefined;
  deleted_at: Date | undefined;
} & TPageExtended;

/**
 * Workspace-scoped reusable Page skeleton. Body fields mirror `TPage` so
 * instantiating a template into a new page is a field-for-field copy.
 */
export type TPageTemplate = {
  id: string;
  name: string;
  description: string;
  logo_props: TLogoProps | undefined;
  owned_by: string | undefined;
  workspace: string | undefined;
  created_at: string | undefined;
  updated_at: string | undefined;
  created_by: string | undefined;
  updated_by: string | undefined;
};

export type TPageTemplateDetail = TPageTemplate & {
  description_html: string;
  description_json: object | undefined;
};

// page filters
export type TPageNavigationTabs = "all" | "public" | "private" | "archived";

export type TPageFiltersSortKey = "name" | "created_at" | "updated_at" | "opened_at";

export type TPageFiltersSortBy = "asc" | "desc";

export type TPageFilterProps = {
  created_at?: string[] | null;
  created_by?: string[] | null;
  favorites?: boolean;
  labels?: string[] | null;
};

export type TPageFilters = {
  searchQuery: string;
  sortKey: TPageFiltersSortKey;
  sortBy: TPageFiltersSortBy;
  filters?: TPageFilterProps;
};

export type TPageEmbedType = "mention" | "issue";

export type TPageVersion = {
  created_at: string;
  created_by: string;
  deleted_at: string | null;
  description_binary?: string | null;
  description_html?: string | null;
  description_json?: object;
  id: string;
  last_saved_at: string;
  owned_by: string;
  page: string;
  updated_at: string;
  updated_by: string;
  workspace: string;
};

/**
 * Body for `PATCH /pages/{id}/description/`. All three fields are independently
 * optional on the API (`PageBinaryUpdateSerializer`). Sending only the keys you
 * want to change avoids overwriting the others — important for whiteboard
 * pages, which only persist `description_json` and would otherwise blow away
 * the Yjs binary by sending `description_binary: ""`.
 */
export type TDocumentPayload = {
  description_binary?: string;
  description_html?: string;
  description_json?: object;
};

export type TWebhookConnectionQueryParams = {
  documentType: "project_page" | "team_page" | "workspace_page";
  projectId?: string;
  teamId?: string;
  workspaceSlug: string;
};

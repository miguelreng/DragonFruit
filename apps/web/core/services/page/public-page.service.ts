/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TPageType } from "@plane/types";
import { APIService } from "@/services/api.service";

export type TPublicWikiDoc = {
  id: string;
  name: string;
  description_html: string;
  mentions?: {
    users?: Record<string, string>;
    issues?: Record<string, string>;
  };
  updated_at: string;
};

export type TPublicPageResponse = {
  id: string;
  view_props?: Record<string, unknown>;
  workspace_slug: string;
  project_id: string | null;
  name: string;
  page_type: TPageType;
  description_html: string;
  description_json: Record<string, unknown> | null;
  embeds?: TPublicDocEmbed[];
  mentions?: {
    users?: Record<string, string>;
    issues?: Record<string, string>;
  };
  logo_props: Record<string, unknown> | null;
  owned_by?: {
    id: string;
    display_name: string;
    avatar_url: string;
  };
  updated_at: string;
  public_slug: string | null;
  /** Present only for published wiki folders: child docs in reader order. */
  wiki_docs?: TPublicWikiDoc[] | null;
  /** True when an unpublished wiki is served to a signed-in workspace member. */
  is_preview?: boolean;
};

export type TPublicDocEmbed = {
  embed_type: "whiteboard" | "sticky" | "task_view";
  entity_id: string;
  available: boolean;
  title: string;
  updated_at?: string;
  snapshot?: unknown;
  project_id?: string;
  issues?: {
    id: string;
    name: string;
    sequence_id: number;
    priority: string | null;
    state_id: string | null;
  }[];
};

export class PublicPageService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async retrieve(workspaceSlug: string, pageSlug: string): Promise<TPublicPageResponse> {
    return this.get(`/api/public/workspaces/${workspaceSlug}/pages/${encodeURIComponent(pageSlug)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error;
      });
  }
}

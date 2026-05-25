/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TPublicPageResponse = {
  id: string;
  workspace_slug: string;
  project_id: string | null;
  name: string;
  page_type: "doc" | "whiteboard";
  description_html: string;
  description_json: Record<string, unknown> | null;
  embeds?: TPublicDocEmbed[];
  logo_props: Record<string, unknown> | null;
  updated_at: string;
  public_slug: string | null;
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

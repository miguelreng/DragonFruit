/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type THomeSectionKey = "inbox" | "on_my_plate" | "favorites" | "agent_cost";

export type THomePreference = {
  key: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  sort_order: number;
};

export class HomePreferencesService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /**
   * Lists the current user's home preferences for the workspace. The
   * server auto-seeds any missing section keys on first call, so the
   * caller can rely on getting back rows for every section the home
   * view knows about.
   */
  async list(workspaceSlug: string): Promise<THomePreference[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/home-preferences/`)
      .then((res) => res?.data ?? [])
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /**
   * Patch a single preference row. The PATCH endpoint upserts whichever
   * fields are present in the payload. Used for both reordering
   * (sort_order) and toggling (is_enabled).
   */
  async update(workspaceSlug: string, key: string, payload: Partial<THomePreference>): Promise<THomePreference> {
    return this.patch(`/api/workspaces/${workspaceSlug}/home-preferences/${key}/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}

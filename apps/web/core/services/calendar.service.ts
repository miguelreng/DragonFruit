/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TCalendarAccount = {
  id: string;
  provider: "google";
  account_email: string;
  primary_calendar_id: string;
  is_active: boolean;
  scopes: string;
  created_at: string | null;
};

export type TCalendarEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  all_day: boolean;
  html_link: string;
  status: string;
};

export type TCalendarTask = {
  id: string;
  sequence_id: number;
  title: string;
  project_id: string | null;
  project_identifier: string;
  state_id: string | null;
  state_name: string;
  state_color: string;
  state_group: string;
  start: string | null;
  end: string | null;
  priority: string;
  completed: boolean;
};

export class CalendarService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async tasks(workspaceSlug: string, params: { from: string; to: string }): Promise<{ tasks: TCalendarTask[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/my-calendar-tasks/`, { params }).then((r) => r?.data);
  }

  async list(): Promise<TCalendarAccount[]> {
    return this.get(`/api/users/me/calendar-accounts/`).then((r) => r?.data);
  }

  async startGoogle(): Promise<{ authorize_url: string }> {
    return this.get(`/api/users/me/calendar-accounts/google/start/`).then((r) => r?.data);
  }

  async finishGoogle(code: string): Promise<TCalendarAccount> {
    return this.post(`/api/users/me/calendar-accounts/google/callback/`, { code }).then((r) => r?.data);
  }

  async disconnect(accountId: string): Promise<void> {
    await this.delete(`/api/users/me/calendar-accounts/${accountId}/`);
  }

  async events(accountId: string, params: { from: string; to: string }): Promise<{ events: TCalendarEvent[] }> {
    return this.get(`/api/users/me/calendar-accounts/${accountId}/events/`, { params }).then((r) => r?.data);
  }
}

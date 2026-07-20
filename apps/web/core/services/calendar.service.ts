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
  hangout_link: string;
  status: string;
  calendar_id?: string;
};

export type TGoogleCalendar = {
  id: string;
  summary: string;
  description: string;
  background_color: string;
  foreground_color: string;
  primary: boolean;
  selected: boolean;
  access_role: string;
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

  async finishGoogle(code: string, state?: string | null): Promise<TCalendarAccount> {
    return this.post(`/api/users/me/calendar-accounts/google/callback/`, { code, state }).then((r) => r?.data);
  }

  async disconnect(accountId: string): Promise<void> {
    await this.delete(`/api/users/me/calendar-accounts/${accountId}/`);
  }

  async calendars(accountId: string): Promise<{ calendars: TGoogleCalendar[] }> {
    return this.get(`/api/users/me/calendar-accounts/${accountId}/calendars/`).then((r) => r?.data);
  }

  async events(
    accountId: string,
    params: { from: string; to: string; calendar_id?: string }
  ): Promise<{ events: TCalendarEvent[] }> {
    return this.get(`/api/users/me/calendar-accounts/${accountId}/events/`, { params }).then((r) => r?.data);
  }

  async createEvent(
    accountId: string,
    payload: {
      calendar_id?: string;
      title: string;
      description?: string;
      all_day: boolean;
      start: string;
      end: string;
      time_zone?: string;
    }
  ): Promise<{ event: TCalendarEvent }> {
    return this.post(`/api/users/me/calendar-accounts/${accountId}/events/`, payload).then((r) => r?.data);
  }

  async updateEvent(
    accountId: string,
    payload: {
      event_id: string;
      calendar_id?: string;
      all_day: boolean;
      start: string;
      end: string;
      time_zone?: string;
      title?: string;
      description?: string;
      location?: string;
    }
  ): Promise<{ event: TCalendarEvent }> {
    return this.patch(`/api/users/me/calendar-accounts/${accountId}/events/`, payload).then((r) => r?.data);
  }

  async syncTasksToGoogle(
    workspaceSlug: string,
    payload: { account_id: string; calendar_id?: string; from: string; to: string }
  ): Promise<{ synced: number; failed: Array<{ issue_id: string; reason: string }> }> {
    return this.post(`/api/workspaces/${workspaceSlug}/calendar/google/sync-tasks/`, payload).then((r) => r?.data);
  }

  async importGoogleEvents(
    workspaceSlug: string,
    payload: { account_id: string; calendar_id?: string; project_id?: string; from: string; to: string }
  ): Promise<{ imported: number; skipped: number; failed: Array<{ event_id: string; reason: string }> }> {
    return this.post(`/api/workspaces/${workspaceSlug}/calendar/google/import-events/`, payload).then((r) => r?.data);
  }
}

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    CalendarAccountsListEndpoint,
    CalendarAccountCalendarsEndpoint,
    CalendarAccountDetailEndpoint,
    CalendarAccountEventsEndpoint,
    CalendarImportGoogleEventsEndpoint,
    CalendarSyncTasksToGoogleEndpoint,
    GoogleCalendarStartEndpoint,
    GoogleCalendarCallbackEndpoint,
    MyCalendarTasksEndpoint,
    UpcomingCalendarMeetingsEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/my-calendar-tasks/",
        MyCalendarTasksEndpoint.as_view(),
        name="workspace-my-calendar-tasks",
    ),
    path(
        "users/me/calendar-accounts/",
        CalendarAccountsListEndpoint.as_view(),
        name="calendar-accounts-list",
    ),
    path(
        "users/me/calendar-accounts/google/start/",
        GoogleCalendarStartEndpoint.as_view(),
        name="calendar-accounts-google-start",
    ),
    path(
        "users/me/calendar-accounts/google/callback/",
        GoogleCalendarCallbackEndpoint.as_view(),
        name="calendar-accounts-google-callback",
    ),
    path(
        "users/me/calendar-accounts/<uuid:account_id>/",
        CalendarAccountDetailEndpoint.as_view(),
        name="calendar-accounts-detail",
    ),
    path(
        "users/me/calendar-accounts/<uuid:account_id>/calendars/",
        CalendarAccountCalendarsEndpoint.as_view(),
        name="calendar-accounts-calendars",
    ),
    path(
        "users/me/calendar-accounts/<uuid:account_id>/events/",
        CalendarAccountEventsEndpoint.as_view(),
        name="calendar-accounts-events",
    ),
    path(
        "users/me/calendar/upcoming-meetings/",
        UpcomingCalendarMeetingsEndpoint.as_view(),
        name="calendar-upcoming-meetings",
    ),
    path(
        "workspaces/<str:slug>/calendar/google/sync-tasks/",
        CalendarSyncTasksToGoogleEndpoint.as_view(),
        name="workspace-calendar-google-sync-tasks",
    ),
    path(
        "workspaces/<str:slug>/calendar/google/import-events/",
        CalendarImportGoogleEventsEndpoint.as_view(),
        name="workspace-calendar-google-import-events",
    ),
]

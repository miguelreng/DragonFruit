# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    CalendarAccountsListEndpoint,
    CalendarAccountDetailEndpoint,
    CalendarAccountEventsEndpoint,
    GoogleCalendarStartEndpoint,
    GoogleCalendarCallbackEndpoint,
)


urlpatterns = [
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
        "users/me/calendar-accounts/<uuid:account_id>/events/",
        CalendarAccountEventsEndpoint.as_view(),
        name="calendar-accounts-events",
    ),
]

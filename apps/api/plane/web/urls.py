# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path
from plane.web.views import health_check, readiness_check, robots_txt

urlpatterns = [
    path("robots.txt", robots_txt),
    path("health/ready/", readiness_check),
    path("", health_check),
]

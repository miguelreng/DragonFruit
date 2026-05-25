# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.space.views import PublicPageBySlugEndpoint, PublicProjectPagesEndpoint

urlpatterns = [
    path(
        "workspaces/<str:workspace_slug>/projects/<uuid:project_id>/pages/",
        PublicProjectPagesEndpoint.as_view(),
        name="public-project-pages",
    ),
    path(
        "workspaces/<str:workspace_slug>/pages/<str:page_slug>/",
        PublicPageBySlugEndpoint.as_view(),
        name="public-page-by-slug",
    ),
]

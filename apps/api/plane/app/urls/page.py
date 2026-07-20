# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.app.views import (
    PageViewSet,
    PageFavoriteViewSet,
    PagesDescriptionViewSet,
    PageVersionEndpoint,
    PageDuplicateEndpoint,
    PageMoveEndpoint,
    PageBlockCommentEndpoint,
    PageBlockCommentDetailEndpoint,
    PageSaveAsTemplateEndpoint,
    PageTemplateDetailEndpoint,
    PageTemplateInstantiateEndpoint,
    PageTemplateListEndpoint,
    WorkspacePagesListEndpoint,
    CapturedChatIngestEndpoint,
    CapturedPageIngestEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/pages/",
        WorkspacePagesListEndpoint.as_view(),
        name="workspace-pages",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages-summary/",
        PageViewSet.as_view({"get": "summary"}),
        name="project-pages-summary",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/",
        PageViewSet.as_view({"get": "list", "post": "create"}),
        name="project-pages",
    ),
    # Ingest an AI conversation captured by the browser extension as a doc page.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/captured-chats/",
        CapturedChatIngestEndpoint.as_view(),
        name="project-captured-chats",
    ),
    # Ingest a whole page (Notion, etc.) scraped by the extension as a doc page.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/captured-pages/",
        CapturedPageIngestEndpoint.as_view(),
        name="project-captured-pages",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/",
        PageViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-pages",
    ),
    # favorite pages
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/favorite-pages/<uuid:page_id>/",
        PageFavoriteViewSet.as_view({"post": "create", "delete": "destroy"}),
        name="user-favorite-pages",
    ),
    # archived pages
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/archive/",
        PageViewSet.as_view({"post": "archive", "delete": "unarchive"}),
        name="project-page-archive-unarchive",
    ),
    # lock and unlock
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/lock/",
        PageViewSet.as_view({"post": "lock", "delete": "unlock"}),
        name="project-pages-lock-unlock",
    ),
    # private and public page
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/access/",
        PageViewSet.as_view({"post": "access"}),
        name="project-pages-access",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/description/",
        PagesDescriptionViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="page-description",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/versions/",
        PageVersionEndpoint.as_view(),
        name="page-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/versions/<uuid:pk>/",
        PageVersionEndpoint.as_view(),
        name="page-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/duplicate/",
        PageDuplicateEndpoint.as_view(),
        name="page-duplicate",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/move/",
        PageMoveEndpoint.as_view(),
        name="page-move",
    ),
    # Block-level comments on a page (Dragon Fruit)
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/block-comments/",
        PageBlockCommentEndpoint.as_view(),
        name="page-block-comments",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/block-comments/<uuid:comment_id>/",
        PageBlockCommentDetailEndpoint.as_view(),
        name="page-block-comment-detail",
    ),
    # Page templates (workspace-scoped; author = admin, browse = any member)
    path(
        "workspaces/<str:slug>/page-templates/",
        PageTemplateListEndpoint.as_view(),
        name="page-templates",
    ),
    path(
        "workspaces/<str:slug>/page-templates/<uuid:template_id>/",
        PageTemplateDetailEndpoint.as_view(),
        name="page-template-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/page-templates/<uuid:template_id>/instantiate/",
        PageTemplateInstantiateEndpoint.as_view(),
        name="page-template-instantiate",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/save-as-template/",
        PageSaveAsTemplateEndpoint.as_view(),
        name="page-save-as-template",
    ),
]

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import os
from copy import deepcopy
from datetime import datetime
from django.core.serializers.json import DjangoJSONEncoder

# Django imports
from django.db import connection, transaction
from django.db.models import (
    Exists,
    OuterRef,
    Q,
    Value,
    UUIDField,
    Count,
    Case,
    When,
    IntegerField,
)
from django.http import StreamingHttpResponse
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models.functions import Coalesce

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    PageSerializer,
    PageDetailSerializer,
    PageBinaryUpdateSerializer,
    WorkspacePageListSerializer,
)
from plane.db.models import (
    Page,
    PageLog,
    UserFavorite,
    ProjectMember,
    ProjectPage,
    Project,
    UserRecentVisit,
    WorkspaceMember,
)
from plane.utils.error_codes import ERROR_CODES

# Local imports
from ..base import BaseAPIView, BaseViewSet
from plane.bgtasks.page_transaction_task import page_transaction
from plane.bgtasks.page_version_task import track_page_version
from plane.bgtasks.recent_visited_task import recent_visited_task
from plane.bgtasks.copy_s3_object import copy_assets, copy_s3_objects_of_description_and_assets
from plane.bgtasks.landing_deploy_task import trigger_landing_deploy
from plane.app.permissions import ProjectPagePermission
from plane.utils.exception_logger import log_exception
from plane.app.buddy_notification import create_cursor_buddy_notification, is_cursor_buddy_request


def should_trigger_landing_deploy_on_publish(page, workspace_slug, project_id, next_access):
    essays_workspace_slug = os.environ.get("DRAGONFRUIT_ESSAYS_WORKSPACE_SLUG")
    essays_project_id = os.environ.get("DRAGONFRUIT_ESSAYS_PROJECT_ID")

    if not essays_workspace_slug or not essays_project_id:
        return False

    try:
        next_access = int(next_access)
    except (TypeError, ValueError):
        return False

    return (
        page.access != Page.PUBLIC_ACCESS
        and next_access == Page.PUBLIC_ACCESS
        and page.page_type == Page.PAGE_TYPE_DOC
        and workspace_slug == essays_workspace_slug
        and str(project_id) == essays_project_id
    )


def can_administer_project_page(user, workspace_slug, project_id, page):
    """Return whether a user may archive, restore, or delete a project page."""
    if page.owned_by_id == user.id:
        return True

    project_role = (
        ProjectMember.objects.filter(
            workspace__slug=workspace_slug,
            project_id=project_id,
            member=user,
            is_active=True,
        )
        .values_list("role", flat=True)
        .first()
    )
    if project_role == ROLE.ADMIN.value:
        return True
    return (
        project_role is not None
        and WorkspaceMember.objects.filter(
            workspace__slug=workspace_slug,
            member=user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()
    )


def unarchive_archive_page_and_descendants(page_id, archived_at):
    # Your SQL query
    sql = """
    WITH RECURSIVE descendants AS (
        SELECT id FROM pages WHERE id = %s
        UNION ALL
        SELECT pages.id FROM pages, descendants WHERE pages.parent_id = descendants.id
    )
    UPDATE pages SET archived_at = %s WHERE id IN (SELECT id FROM descendants);
    """

    # Execute the SQL query
    with connection.cursor() as cursor:
        cursor.execute(sql, [page_id, archived_at])


def duplicate_pdf_asset_for_page(page, source_view_props, project_id, user_id):
    if page.page_type != Page.PAGE_TYPE_PDF or not isinstance(source_view_props, dict):
        return

    source_pdf = source_view_props.get("pdf")
    if not isinstance(source_pdf, dict):
        return

    source_asset_id = source_pdf.get("asset_id")
    if not source_asset_id:
        return

    duplicated_assets = copy_assets(page, page.id, project_id, [source_asset_id], user_id)
    if not duplicated_assets:
        return

    next_view_props = deepcopy(source_view_props)
    next_view_props["pdf"] = {
        **source_pdf,
        "asset_id": duplicated_assets[0]["new_asset_id"],
        "project_id": str(project_id),
    }
    Page.objects.filter(pk=page.id).update(view_props=next_view_props)
    page.view_props = next_view_props


class PageViewSet(BaseViewSet):
    serializer_class = PageSerializer
    model = Page
    permission_classes = [ProjectPagePermission]
    search_fields = ["name"]
    ALLOWED_PAGE_TYPES = {choice[0] for choice in Page.PAGE_TYPE_CHOICES}

    def get_queryset(self):
        page_type = self.request.query_params.get("page_type")
        subquery = UserFavorite.objects.filter(
            user=self.request.user,
            entity_type="page",
            entity_identifier=OuterRef("pk"),
            workspace__slug=self.kwargs.get("slug"),
        )
        queryset = self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(
                projects__project_projectmember__member=self.request.user,
                projects__project_projectmember__is_active=True,
                projects__archived_at__isnull=True,
            )
            # Pages inside a folder (parent set) stay listable/retrievable —
            # the docs UI groups them client-side under their folder.
            .filter(Q(owned_by=self.request.user) | Q(access=0))
            .prefetch_related("projects")
            .select_related("workspace")
            .select_related("owned_by")
            .annotate(is_favorite=Exists(subquery))
            .order_by(self.request.GET.get("order_by", "-created_at"))
            .prefetch_related("labels")
            .order_by("-is_favorite", "-created_at")
            .annotate(
                project=Exists(
                    ProjectPage.objects.filter(page_id=OuterRef("id"), project_id=self.kwargs.get("project_id"))
                )
            )
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "page_labels__label_id",
                        distinct=True,
                        filter=~Q(page_labels__label_id__isnull=True),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                project_ids=Coalesce(
                    ArrayAgg("projects__id", distinct=True, filter=~Q(projects__id=True)),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .filter(project=True)
            .distinct()
        )
        if page_type and page_type in self.ALLOWED_PAGE_TYPES:
            queryset = queryset.filter(page_type=page_type)
        return queryset

    def create(self, request, slug, project_id):
        serializer = PageSerializer(
            data=request.data,
            context={
                "project_id": project_id,
                "owned_by_id": request.user.id,
                "description_json": request.data.get("description_json", {}),
                "description_binary": request.data.get("description_binary", None),
                "description_html": request.data.get("description_html", "<p></p>"),
            },
        )

        if serializer.is_valid():
            serializer.save()
            # capture the page transaction
            try:
                page_transaction.delay(
                    new_description_html=request.data.get("description_html", "<p></p>"),
                    old_description_html=None,
                    page_id=serializer.data["id"],
                )
            except Exception as e:
                log_exception(e)
            page = self.get_queryset().get(pk=serializer.data["id"])
            if is_cursor_buddy_request(request):
                project = Project.objects.get(pk=project_id, workspace__slug=slug)
                create_cursor_buddy_notification(
                    request=request,
                    workspace=page.workspace,
                    project=project,
                    resource=page,
                    resource_type=page.page_type or "doc",
                    resource_name=page.name,
                    resource_url=f"/{slug}/projects/{project_id}/pages/{page.id}",
                )
            serializer = PageDetailSerializer(page)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, project_id, page_id):
        try:
            page = Page.objects.get(
                pk=page_id,
                workspace__slug=slug,
                projects__id=project_id,
                project_pages__deleted_at__isnull=True,
            )

            if page.is_locked:
                return Response({"error": "Page is locked"}, status=status.HTTP_400_BAD_REQUEST)

            parent = request.data.get("parent", None)
            if parent:
                _ = Page.objects.get(
                    pk=parent,
                    workspace__slug=slug,
                    projects__id=project_id,
                    project_pages__deleted_at__isnull=True,
                )

            # Only update access if the page owner is the requesting  user
            if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
                return Response(
                    {"error": "Access cannot be updated since this page is owned by someone else"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer = PageDetailSerializer(page, data=request.data, partial=True)
            page_description = page.description_html
            if serializer.is_valid():
                serializer.save()
                # capture the page transaction
                if request.data.get("description_html"):
                    page_transaction.delay(
                        new_description_html=request.data.get("description_html", "<p></p>"),
                        old_description_html=page_description,
                        page_id=page_id,
                    )

                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Page.DoesNotExist:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def retrieve(self, request, slug, project_id, page_id=None):
        page = self.get_queryset().filter(pk=page_id).first()
        project = Project.objects.get(pk=project_id)
        track_visit = request.query_params.get("track_visit", "true").lower() == "true"

        """
        if the role is guest and guest_view_all_features is false and owned by is not
        the requesting user then dont show the page
        """

        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
            and not page.owned_by == request.user
        ):
            return Response(
                {"error": "You are not allowed to view this page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
        else:
            issue_ids = PageLog.objects.filter(page_id=page_id, entity_name="issue").values_list(
                "entity_identifier", flat=True
            )
            data = PageDetailSerializer(page).data
            data["issue_ids"] = issue_ids
            if track_visit:
                recent_visited_task.delay(
                    slug=slug,
                    entity_name="page",
                    entity_identifier=page_id,
                    user_id=request.user.id,
                    project_id=project_id,
                )
            return Response(data, status=status.HTTP_200_OK)

    def lock(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        page.is_locked = True
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def unlock(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        page.is_locked = False
        page.save()

        return Response(status=status.HTTP_204_NO_CONTENT)

    def access(self, request, slug, project_id, page_id):
        access = request.data.get("access", 0)
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        # Only update access if the page owner is the requesting user
        if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        should_trigger_landing_deploy = should_trigger_landing_deploy_on_publish(page, slug, project_id, access)
        page.access = access
        page.save()
        if should_trigger_landing_deploy:
            try:
                trigger_landing_deploy.delay(str(page.id), slug, str(project_id))
            except Exception as e:
                log_exception(e)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def list(self, request, slug, project_id):
        queryset = self.get_queryset()
        project = Project.objects.get(pk=project_id)
        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
        ):
            queryset = queryset.filter(owned_by=request.user)
        pages = PageSerializer(queryset, many=True).data
        return Response(pages, status=status.HTTP_200_OK)

    def archive(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        # only the owner or an inherited project admin can archive the page
        if not can_administer_project_page(request.user, slug, project_id, page):
            return Response(
                {"error": "Only the owner or admin can archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        UserFavorite.objects.filter(
            entity_type="page",
            entity_identifier=page_id,
            project_id=project_id,
            workspace__slug=slug,
        ).delete()

        unarchive_archive_page_and_descendants(page_id, datetime.now())

        return Response({"archived_at": str(datetime.now())}, status=status.HTTP_200_OK)

    def unarchive(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        # only the owner or an inherited project admin can unarchive the page
        if not can_administer_project_page(request.user, slug, project_id, page):
            return Response(
                {"error": "Only the owner or admin can un archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # if parent archived then page will be un archived breaking hierarchy
        if page.parent_id and page.parent.archived_at:
            page.parent = None
            page.save(update_fields=["parent"])

        unarchive_archive_page_and_descendants(page_id, None)

        return Response(status=status.HTTP_204_NO_CONTENT)

    def destroy(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        if page.archived_at is None:
            return Response(
                {"error": "The page should be archived before deleting"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not can_administer_project_page(request.user, slug, project_id, page):
            return Response(
                {"error": "Only admin or owner can delete the page"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # remove parent from all the children
        _ = Page.objects.filter(
            parent_id=page_id,
            projects__id=project_id,
            workspace__slug=slug,
            project_pages__deleted_at__isnull=True,
        ).update(parent=None)

        page.delete()
        # Delete the user favorite page
        UserFavorite.objects.filter(
            project=project_id,
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_type="page",
        ).delete()
        # Delete the page from recent visit
        UserRecentVisit.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_name="page",
        ).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def summary(self, request, slug, project_id):
        queryset = (
            Page.objects.filter(workspace__slug=slug)
            .filter(
                projects__project_projectmember__member=self.request.user,
                projects__project_projectmember__is_active=True,
                projects__archived_at__isnull=True,
            )
            # Count docs inside folders too; folders themselves aren't pages
            # from the user's point of view, so keep them out of the stats.
            .exclude(page_type=Page.PAGE_TYPE_FOLDER)
            .filter(Q(owned_by=request.user) | Q(access=0))
            .annotate(
                project=Exists(
                    ProjectPage.objects.filter(page_id=OuterRef("id"), project_id=self.kwargs.get("project_id"))
                )
            )
            .filter(project=True)
            .distinct()
        )

        project = Project.objects.get(pk=project_id)
        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=ROLE.GUEST.value,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
        ):
            queryset = queryset.filter(owned_by=request.user)

        stats = queryset.aggregate(
            public_pages=Count(
                Case(
                    When(access=Page.PUBLIC_ACCESS, archived_at__isnull=True, then=1),
                    output_field=IntegerField(),
                )
            ),
            private_pages=Count(
                Case(
                    When(access=Page.PRIVATE_ACCESS, archived_at__isnull=True, then=1),
                    output_field=IntegerField(),
                )
            ),
            archived_pages=Count(Case(When(archived_at__isnull=False, then=1), output_field=IntegerField())),
        )

        return Response(stats, status=status.HTTP_200_OK)


class PageFavoriteViewSet(BaseViewSet):
    model = UserFavorite

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, page_id):
        _ = UserFavorite.objects.create(
            project_id=project_id,
            entity_identifier=page_id,
            entity_type="page",
            user=request.user,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, page_id):
        page_favorite = UserFavorite.objects.get(
            project=project_id,
            user=request.user,
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_type="page",
        )
        page_favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PagesDescriptionViewSet(BaseViewSet):
    permission_classes = [ProjectPagePermission]

    def retrieve(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            Q(owned_by=self.request.user) | Q(access=0),
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )
        binary_data = page.description_binary

        def stream_data():
            if binary_data:
                yield binary_data
            else:
                yield b""

        response = StreamingHttpResponse(stream_data(), content_type="application/octet-stream")
        response["Content-Disposition"] = 'attachment; filename="page_description.bin"'
        return response

    def partial_update(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            Q(owned_by=self.request.user) | Q(access=0),
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        if page.is_locked:
            return Response(
                {
                    "error_code": ERROR_CODES["PAGE_LOCKED"],
                    "error_message": "PAGE_LOCKED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.archived_at:
            return Response(
                {
                    "error_code": ERROR_CODES["PAGE_ARCHIVED"],
                    "error_message": "PAGE_ARCHIVED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Store the previous body before saving so the version task can compare
        # the canonical representation for every supported page type.
        old_description_html = page.description_html

        # Serialize the existing instance
        existing_instance = json.dumps(
            {
                "page_type": page.page_type,
                "description_html": old_description_html,
                "description_json": page.description_json,
            },
            cls=DjangoJSONEncoder,
        )

        # Use serializer for validation and update
        serializer = PageBinaryUpdateSerializer(page, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()

            # Capture the page transaction
            if request.data.get("description_html"):
                page_transaction.delay(
                    new_description_html=request.data.get("description_html", "<p></p>"),
                    old_description_html=old_description_html,
                    page_id=page_id,
                )

            # Run background tasks
            if any(key in request.data for key in ("description_html", "description_json", "description_binary")):
                track_page_version.delay(
                    page_id=page_id,
                    existing_instance=existing_instance,
                    user_id=request.user.id,
                )
            return Response({"message": "Updated successfully"})
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PageDuplicateEndpoint(BaseAPIView):
    permission_classes = [ProjectPagePermission]

    def post(self, request, slug, project_id, page_id):
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        # check for permission
        if page.access == Page.PRIVATE_ACCESS and page.owned_by_id != request.user.id:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        # get all the project ids where page is present
        project_ids = ProjectPage.objects.filter(page_id=page_id).values_list("project_id", flat=True)
        source_project_id = project_id
        source_view_props = deepcopy(page.view_props)

        page.pk = None
        page.name = f"{page.name} (Copy)"
        page.description_binary = None
        page.owned_by = request.user
        page.created_by = request.user
        page.updated_by = request.user
        page.save()

        for linked_project_id in project_ids:
            ProjectPage.objects.create(
                workspace_id=page.workspace_id,
                project_id=linked_project_id,
                page_id=page.id,
                created_by_id=page.created_by_id,
                updated_by_id=page.updated_by_id,
            )

        duplicate_pdf_asset_for_page(page, source_view_props, source_project_id, request.user.id)

        page_transaction.delay(
            new_description_html=page.description_html,
            old_description_html=None,
            page_id=page.id,
        )

        # Copy the s3 objects uploaded in the page
        copy_s3_objects_of_description_and_assets.delay(
            entity_name="PAGE",
            entity_identifier=page.id,
            project_id=source_project_id,
            slug=slug,
            user_id=request.user.id,
        )

        page = (
            Page.objects.filter(pk=page.id)
            .annotate(
                project_ids=Coalesce(
                    ArrayAgg("projects__id", distinct=True, filter=~Q(projects__id=True)),
                    Value([], output_field=ArrayField(UUIDField())),
                )
            )
            .first()
        )
        serializer = PageDetailSerializer(page)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PageMoveEndpoint(BaseAPIView):
    """Move a page from one project to another within the workspace.

    Repoints the page's ProjectPage link for the source project at the target
    project. Nested sub-pages (folder contents, doc sub-pages) move along with
    it; the page is detached from its old parent since folders live in a
    single project. Favorites and recent visits follow so their
    project-scoped URLs keep resolving.
    """

    permission_classes = [ProjectPagePermission]

    def post(self, request, slug, project_id, page_id):
        new_project_id = request.data.get("new_project_id")
        if not new_project_id:
            return Response({"error": "new_project_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if str(new_project_id) == str(project_id):
            return Response(
                {"error": "The page is already in this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        # Briefs are bound to their project — moving one would orphan it.
        if page.is_brief or (page.page_type == Page.PAGE_TYPE_DOC and (page.name or "").strip() == "Project Brief"):
            return Response({"error": "Project briefs can't be moved"}, status=status.HTTP_400_BAD_REQUEST)

        # Private pages move only with their owner (mirrors duplicate).
        if page.access == Page.PRIVATE_ACCESS and page.owned_by_id != request.user.id:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        if not Project.objects.filter(pk=new_project_id, workspace__slug=slug, archived_at__isnull=True).exists():
            return Response({"error": "Target project not found"}, status=status.HTTP_404_NOT_FOUND)

        # Moving creates content in the target project — guests can't do that.
        if not ProjectMember.objects.filter(
            project_id=new_project_id,
            member=request.user,
            is_active=True,
            role__gte=ROLE.MEMBER.value,
        ).exists():
            return Response(
                {"error": "You must be a member of the target project to move pages into it"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # The page plus every nested sub-page that lives in the source project.
        page_ids = [page.id]
        frontier = [page.id]
        while frontier:
            frontier = list(
                Page.objects.filter(parent_id__in=frontier, projects__id=project_id)
                .exclude(id__in=page_ids)
                .values_list("id", flat=True)
            )
            page_ids.extend(frontier)

        with transaction.atomic():
            # Pages already linked to the target keep that link; their source
            # link is dropped instead of repointed (unique project+page).
            already_linked = list(
                ProjectPage.objects.filter(page_id__in=page_ids, project_id=new_project_id).values_list(
                    "page_id", flat=True
                )
            )
            if already_linked:
                ProjectPage.objects.filter(page_id__in=already_linked, project_id=project_id).delete()
            ProjectPage.objects.filter(page_id__in=page_ids, project_id=project_id).update(
                project_id=new_project_id, updated_by=request.user
            )

            # The old parent (folder or doc) stays behind — detach.
            if page.parent_id:
                page.parent = None
                page.save(update_fields=["parent"])

            UserFavorite.objects.filter(
                entity_type="page", entity_identifier__in=page_ids, project_id=project_id
            ).update(project_id=new_project_id)
            UserRecentVisit.objects.filter(
                entity_name="page", entity_identifier__in=page_ids, project_id=project_id
            ).update(project_id=new_project_id)

        return Response(status=status.HTTP_200_OK)


class WorkspacePagesListEndpoint(BaseAPIView):
    """List every page across the workspace that the user can access.

    Returns pages where the user is an active member of at least one of the
    page's projects, the project is not archived, and the page is either
    public or owned by the user. Annotates `project_ids` with only active,
    joined projects so frontend actions never target an inaccessible link.
    Pages inside a folder (parent set) are included — the docs UI groups them
    client-side.

    Accepts `?page_type=<doc|whiteboard|pdf>` to scope to a single type;
    folder pages are always included alongside so the list can be grouped.
    """

    ALLOWED_PAGE_TYPES = {choice[0] for choice in Page.PAGE_TYPE_CHOICES}

    def get(self, request, slug):
        qs = (
            Page.objects.filter(workspace__slug=slug)
            .filter(
                projects__project_projectmember__member=request.user,
                projects__project_projectmember__is_active=True,
                projects__archived_at__isnull=True,
            )
            .filter(Q(owned_by=request.user) | Q(access=0))
        )

        page_type = request.query_params.get("page_type")
        if page_type and page_type in self.ALLOWED_PAGE_TYPES:
            qs = qs.filter(Q(page_type=page_type) | Q(page_type=Page.PAGE_TYPE_FOLDER))

        pages = (
            qs.annotate(
                project_ids=Coalesce(
                    ArrayAgg(
                        "projects__id",
                        distinct=True,
                        filter=Q(
                            projects__project_projectmember__member=request.user,
                            projects__project_projectmember__is_active=True,
                            projects__archived_at__isnull=True,
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                )
            )
            .select_related("workspace", "owned_by")
            .distinct()
            .order_by("-updated_at")
        )
        return Response(
            WorkspacePageListSerializer(pages, many=True).data,
            status=status.HTTP_200_OK,
        )

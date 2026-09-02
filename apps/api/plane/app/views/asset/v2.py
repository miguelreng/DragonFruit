# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid

# Django imports
from django.conf import settings
from django.http import HttpResponseRedirect
from django.utils import timezone
from django.db import IntegrityError

# Third party imports
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

# Module imports
from ..base import BaseAPIView
from plane.db.models import (
    DraftIssue,
    FileAsset,
    Issue,
    IssueComment,
    Page,
    Project,
    ProjectMember,
    ProjectPage,
    User,
    Workspace,
    WorkspaceMember,
)
from plane.settings.storage import S3Storage
from plane.app.permissions import allow_permission, ROLE
from plane.utils.cache import invalidate_cache_directly
from plane.utils.path_validator import sanitize_filename
from plane.throttles.asset import AssetRateThrottle
from plane.throttles.resource import AssetUploadRateThrottle
from plane.utils.asset_upload import (
    AssetUploadValidationError,
    normalize_asset_size,
    verify_uploaded_asset,
)


IMAGE_ASSET_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
    "image/gif",
]

PAGE_DESCRIPTION_ASSET_MIME_TYPES = [
    *IMAGE_ASSET_MIME_TYPES,
    "application/pdf",
]


def get_allowed_asset_mime_types(entity_type):
    if entity_type == FileAsset.EntityTypeContext.PAGE_DESCRIPTION:
        return PAGE_DESCRIPTION_ASSET_MIME_TYPES
    if entity_type == FileAsset.EntityTypeContext.COMMENT_DESCRIPTION:
        # Comments accept the same file types as work-item attachments so
        # files can be attached inline; "image/jpg" is a legacy alias the
        # editor still sends for pasted images.
        return [*settings.ATTACHMENT_MIME_TYPES, "image/jpg"]
    return IMAGE_ASSET_MIME_TYPES


def get_asset_response_disposition(request):
    if request.query_params.get("disposition") == "inline":
        return "inline"
    return "attachment"


def _is_workspace_admin(request, workspace):
    return WorkspaceMember.objects.filter(
        member=request.user,
        workspace=workspace,
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exists()


def _can_access_project(request, workspace, project_id, *, can_be_guest=True):
    roles = [ROLE.ADMIN.value, ROLE.MEMBER.value]
    if can_be_guest:
        roles.append(ROLE.GUEST.value)
    return _is_workspace_admin(request, workspace) or ProjectMember.objects.filter(
        member=request.user,
        workspace=workspace,
        project_id=project_id,
        role__in=roles,
        is_active=True,
    ).exists()


def get_validated_entity_fields(request, workspace, entity_type, entity_id, project=None):
    """Resolve an asset entity without allowing cross-tenant foreign keys."""

    if entity_type == FileAsset.EntityTypeContext.WORKSPACE_LOGO:
        if project is not None or str(entity_id) != str(workspace.id):
            raise NotFound("Workspace not found.")
        if not _is_workspace_admin(request, workspace):
            raise PermissionDenied("Only workspace administrators can update the workspace logo.")
        return {}

    if entity_type == FileAsset.EntityTypeContext.PROJECT_COVER:
        target_project_id = project.id if project is not None else entity_id
        if not target_project_id or (entity_id and str(entity_id) != str(target_project_id)):
            raise NotFound("Project not found.")
        target_project = Project.objects.filter(id=target_project_id, workspace=workspace).first()
        if target_project is None:
            raise NotFound("Project not found.")
        if not _can_access_project(request, workspace, target_project.id, can_be_guest=False):
            raise PermissionDenied("You do not have permission to update this project.")
        return {"project": target_project}

    if entity_type in [
        FileAsset.EntityTypeContext.USER_AVATAR,
        FileAsset.EntityTypeContext.USER_COVER,
    ]:
        raise ValidationError("User assets must use the user asset endpoint.")

    base_fields = {"project": project} if project is not None else {}
    if not entity_id:
        return base_fields

    entity_filters = {"id": entity_id, "workspace": workspace}
    if project is not None:
        entity_filters["project"] = project

    if entity_type in [
        FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
        FileAsset.EntityTypeContext.ISSUE_DESCRIPTION,
    ]:
        issue = Issue.objects.filter(**entity_filters).first()
        if issue is None:
            raise NotFound("Issue not found.")
        if project is None and not _can_access_project(request, workspace, issue.project_id):
            raise PermissionDenied("You do not have permission to access this issue.")
        return {"issue": issue, "project_id": issue.project_id}

    if entity_type == FileAsset.EntityTypeContext.COMMENT_DESCRIPTION:
        comment = IssueComment.objects.filter(**entity_filters).first()
        if comment is None:
            raise NotFound("Comment not found.")
        if project is None and not _can_access_project(request, workspace, comment.project_id):
            raise PermissionDenied("You do not have permission to access this comment.")
        return {"comment": comment, "project_id": comment.project_id}

    if entity_type == FileAsset.EntityTypeContext.PAGE_DESCRIPTION:
        page = Page.objects.filter(id=entity_id, workspace=workspace).first()
        if page is None:
            raise NotFound("Page not found.")
        if project is not None:
            if not ProjectPage.objects.filter(page=page, project=project, workspace=workspace).exists():
                raise NotFound("Page not found.")
            return {"page": page, "project": project}

        linked_project_ids = ProjectPage.objects.filter(page=page, workspace=workspace).values_list(
            "project_id", flat=True
        )
        if page.owned_by_id != request.user.id and not (
            _is_workspace_admin(request, workspace)
            or ProjectMember.objects.filter(
                member=request.user,
                workspace=workspace,
                project_id__in=linked_project_ids,
                is_active=True,
            ).exists()
        ):
            raise PermissionDenied("You do not have permission to access this page.")
        return {"page": page}

    if entity_type in [
        FileAsset.EntityTypeContext.DRAFT_ISSUE_ATTACHMENT,
        FileAsset.EntityTypeContext.DRAFT_ISSUE_DESCRIPTION,
    ]:
        draft_issue = DraftIssue.objects.filter(**entity_filters).first()
        if draft_issue is None:
            raise NotFound("Draft issue not found.")
        if project is None and not _can_access_project(request, workspace, draft_issue.project_id):
            raise PermissionDenied("You do not have permission to access this draft issue.")
        return {"draft_issue": draft_issue, "project_id": draft_issue.project_id}

    raise ValidationError("Invalid entity type.")


def finalize_uploaded_asset(asset, request):
    try:
        metadata = verify_uploaded_asset(asset, request=request)
    except AssetUploadValidationError as exc:
        return Response({"error": str(exc), "status": False}, status=status.HTTP_400_BAD_REQUEST)

    asset.is_uploaded = True
    asset.storage_metadata = metadata
    asset.save(update_fields=["is_uploaded", "storage_metadata"])
    return None


class UserAssetsV2Endpoint(BaseAPIView):
    """This endpoint is used to upload user profile images."""

    throttle_classes = [AssetUploadRateThrottle]

    def asset_delete(self, asset_id):
        asset = FileAsset.objects.filter(id=asset_id).first()
        if asset is None:
            return
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return

    def entity_asset_save(self, asset_id, entity_type, asset, request):
        # User Avatar
        if entity_type == FileAsset.EntityTypeContext.USER_AVATAR:
            user = User.objects.get(id=asset.user_id)
            user.avatar = ""
            # Delete the previous avatar
            if user.avatar_asset_id:
                self.asset_delete(user.avatar_asset_id)
            # Save the new avatar
            user.avatar_asset_id = asset_id
            user.save()
            invalidate_cache_directly(path="/api/users/me/", url_params=False, user=True, request=request)
            invalidate_cache_directly(
                path="/api/users/me/settings/",
                url_params=False,
                user=True,
                request=request,
            )
            return
        # User Cover
        if entity_type == FileAsset.EntityTypeContext.USER_COVER:
            user = User.objects.get(id=asset.user_id)
            user.cover_image = None
            # Delete the previous cover image
            if user.cover_image_asset_id:
                self.asset_delete(user.cover_image_asset_id)
            # Save the new cover image
            user.cover_image_asset_id = asset_id
            user.save()
            invalidate_cache_directly(path="/api/users/me/", url_params=False, user=True, request=request)
            invalidate_cache_directly(
                path="/api/users/me/settings/",
                url_params=False,
                user=True,
                request=request,
            )
            return
        return

    def entity_asset_delete(self, entity_type, asset, request):
        # User Avatar
        if entity_type == FileAsset.EntityTypeContext.USER_AVATAR:
            user = User.objects.get(id=asset.user_id)
            user.avatar_asset_id = None
            user.save()
            invalidate_cache_directly(path="/api/users/me/", url_params=False, user=True, request=request)
            invalidate_cache_directly(
                path="/api/users/me/settings/",
                url_params=False,
                user=True,
                request=request,
            )
            return
        # User Cover
        if entity_type == FileAsset.EntityTypeContext.USER_COVER:
            user = User.objects.get(id=asset.user_id)
            user.cover_image_asset_id = None
            user.save()
            invalidate_cache_directly(path="/api/users/me/", url_params=False, user=True, request=request)
            invalidate_cache_directly(
                path="/api/users/me/settings/",
                url_params=False,
                user=True,
                request=request,
            )
            return
        return

    def post(self, request):
        # get the asset key
        name = sanitize_filename(request.data.get("name")) or "unnamed"
        type = request.data.get("type", "image/jpeg")
        try:
            size_limit = normalize_asset_size(request.data.get("size", settings.FILE_SIZE_LIMIT))
        except AssetUploadValidationError as exc:
            return Response({"error": str(exc), "status": False}, status=status.HTTP_400_BAD_REQUEST)
        entity_type = request.data.get("entity_type", False)

        #  Check if the entity type is allowed
        if not entity_type or entity_type not in ["USER_AVATAR", "USER_COVER"]:
            return Response(
                {"error": "Invalid entity type.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if the file type is allowed
        allowed_types = IMAGE_ASSET_MIME_TYPES
        if type not in allowed_types:
            return Response(
                {
                    "error": "Invalid file type. Only JPEG, PNG, WebP, JPG and GIF files are allowed.",
                    "status": False,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # asset key
        asset_key = f"{uuid.uuid4().hex}-{name}"

        # Create a File Asset
        asset = FileAsset.objects.create(
            attributes={"name": name, "type": type, "size": size_limit},
            asset=asset_key,
            size=size_limit,
            user=request.user,
            created_by=request.user,
            entity_type=entity_type,
        )

        # Get the presigned URL
        storage = S3Storage(request=request)
        # Generate a presigned URL to share an S3 object
        presigned_url = storage.generate_presigned_post(object_name=asset_key, file_type=type, file_size=size_limit)
        # Return the presigned URL
        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "asset_url": asset.asset_url,
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request, asset_id):
        # get the asset id
        asset = FileAsset.objects.get(id=asset_id, user_id=request.user.id)
        invalid_upload_response = finalize_uploaded_asset(asset, request)
        if invalid_upload_response is not None:
            return invalid_upload_response
        # get the entity and save the asset id for the request field
        self.entity_asset_save(
            asset_id=asset_id,
            entity_type=asset.entity_type,
            asset=asset,
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, asset_id):
        asset = FileAsset.objects.get(id=asset_id, user_id=request.user.id)
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        # get the entity and save the asset id for the request field
        self.entity_asset_delete(entity_type=asset.entity_type, asset=asset, request=request)
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceFileAssetEndpoint(BaseAPIView):
    """This endpoint is used to upload cover images/logos etc for workspace, projects and users."""

    throttle_classes = [AssetUploadRateThrottle]

    def asset_delete(self, asset_id):
        asset = FileAsset.objects.filter(id=asset_id).first()
        # Check if the asset exists
        if asset is None:
            return
        # Mark the asset as deleted
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return

    def entity_asset_save(self, asset_id, entity_type, asset, request):
        # Workspace Logo
        if entity_type == FileAsset.EntityTypeContext.WORKSPACE_LOGO:
            workspace = Workspace.objects.filter(id=asset.workspace_id).first()
            if workspace is None:
                return
            # Delete the previous logo
            if workspace.logo_asset_id:
                self.asset_delete(workspace.logo_asset_id)
            # Save the new logo
            workspace.logo = ""
            workspace.logo_asset_id = asset_id
            workspace.save()
            invalidate_cache_directly(path="/api/workspaces/", url_params=False, user=False, request=request)
            invalidate_cache_directly(
                path="/api/users/me/workspaces/",
                url_params=False,
                user=True,
                request=request,
            )
            invalidate_cache_directly(path="/api/instances/", url_params=False, user=False, request=request)
            return

        # Project Cover
        elif entity_type == FileAsset.EntityTypeContext.PROJECT_COVER:
            project = Project.objects.filter(id=asset.project_id).first()
            if project is None:
                return
            # Delete the previous cover image
            if project.cover_image_asset_id:
                self.asset_delete(project.cover_image_asset_id)
            # Save the new cover image
            project.cover_image = ""
            project.cover_image_asset_id = asset_id
            project.save()
            return
        else:
            return

    def entity_asset_delete(self, entity_type, asset, request):
        # Workspace Logo
        if entity_type == FileAsset.EntityTypeContext.WORKSPACE_LOGO:
            workspace = Workspace.objects.get(id=asset.workspace_id)
            if workspace is None:
                return
            workspace.logo_asset_id = None
            workspace.save()
            invalidate_cache_directly(path="/api/workspaces/", url_params=False, user=False, request=request)
            invalidate_cache_directly(
                path="/api/users/me/workspaces/",
                url_params=False,
                user=True,
                request=request,
            )
            invalidate_cache_directly(path="/api/instances/", url_params=False, user=False, request=request)
            return
        # Project Cover
        elif entity_type == FileAsset.EntityTypeContext.PROJECT_COVER:
            project = Project.objects.filter(id=asset.project_id).first()
            if project is None:
                return
            project.cover_image_asset_id = None
            project.save()
            return
        else:
            return

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        name = sanitize_filename(request.data.get("name")) or "unnamed"
        type = request.data.get("type", "image/jpeg")
        try:
            size_limit = normalize_asset_size(request.data.get("size", settings.FILE_SIZE_LIMIT))
        except AssetUploadValidationError as exc:
            return Response({"error": str(exc), "status": False}, status=status.HTTP_400_BAD_REQUEST)
        entity_type = request.data.get("entity_type")
        entity_identifier = request.data.get("entity_identifier", False)

        # Check if the entity type is allowed
        if entity_type not in FileAsset.EntityTypeContext.values:
            return Response(
                {"error": "Invalid entity type.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if the file type is allowed
        allowed_types = get_allowed_asset_mime_types(entity_type)
        if type not in allowed_types:
            return Response(
                {
                    "error": "Invalid file type.",
                    "status": False,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the workspace
        workspace = Workspace.objects.get(slug=slug)
        entity_fields = get_validated_entity_fields(
            request=request,
            workspace=workspace,
            entity_type=entity_type,
            entity_id=entity_identifier,
        )

        # asset key
        asset_key = f"{workspace.id}/{uuid.uuid4().hex}-{name}"

        # Create a File Asset
        asset = FileAsset.objects.create(
            attributes={"name": name, "type": type, "size": size_limit},
            asset=asset_key,
            size=size_limit,
            workspace=workspace,
            created_by=request.user,
            entity_type=entity_type,
            **entity_fields,
        )

        # Get the presigned URL
        storage = S3Storage(request=request)
        # Generate a presigned URL to share an S3 object
        presigned_url = storage.generate_presigned_post(object_name=asset_key, file_type=type, file_size=size_limit)
        # Return the presigned URL
        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "asset_url": asset.asset_url,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def patch(self, request, slug, asset_id):
        # get the asset id
        asset = FileAsset.objects.get(id=asset_id, workspace__slug=slug)
        invalid_upload_response = finalize_uploaded_asset(asset, request)
        if invalid_upload_response is not None:
            return invalid_upload_response
        # get the entity and save the asset id for the request field
        self.entity_asset_save(
            asset_id=asset_id,
            entity_type=asset.entity_type,
            asset=asset,
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def delete(self, request, slug, asset_id):
        asset = FileAsset.objects.get(id=asset_id, workspace__slug=slug)
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        # get the entity and save the asset id for the request field
        self.entity_asset_delete(entity_type=asset.entity_type, asset=asset, request=request)
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, asset_id):
        # get the asset id
        asset = FileAsset.objects.get(id=asset_id, workspace__slug=slug)

        # Check if the asset is uploaded
        if not asset.is_uploaded:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if asset.external_source == "google_drive":
            web_view_link = asset.attributes.get("webViewLink") or asset.attributes.get("web_view_link")
            if web_view_link:
                return HttpResponseRedirect(web_view_link)

        # Get the presigned URL
        storage = S3Storage(request=request)
        # Generate a presigned URL to share an S3 object
        signed_url = storage.generate_presigned_url(
            object_name=asset.asset.name,
            disposition=get_asset_response_disposition(request),
            filename=asset.attributes.get("name"),
        )
        # Redirect to the signed URL
        return HttpResponseRedirect(signed_url)


class StaticFileAssetEndpoint(BaseAPIView):
    """This endpoint is used to get the signed URL for a static asset."""

    permission_classes = [AllowAny]

    def get(self, request, asset_id):
        # get the asset id
        asset = FileAsset.objects.get(id=asset_id)

        # Check if the asset is uploaded
        if not asset.is_uploaded:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check if the entity type is allowed
        if asset.entity_type not in [
            FileAsset.EntityTypeContext.USER_AVATAR,
            FileAsset.EntityTypeContext.USER_COVER,
            FileAsset.EntityTypeContext.WORKSPACE_LOGO,
            FileAsset.EntityTypeContext.PROJECT_COVER,
        ]:
            return Response(
                {"error": "Invalid entity type.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the presigned URL
        storage = S3Storage(request=request)
        # Generate a presigned URL to share an S3 object
        signed_url = storage.generate_presigned_url(object_name=asset.asset.name)
        # Redirect to the signed URL
        return HttpResponseRedirect(signed_url)


class AssetRestoreEndpoint(BaseAPIView):
    """Endpoint to restore a deleted assets."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, asset_id):
        asset = FileAsset.all_objects.get(id=asset_id, workspace__slug=slug)
        asset.is_deleted = False
        asset.deleted_at = None
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectAssetEndpoint(BaseAPIView):
    """This endpoint is used to upload cover images/logos etc for workspace, projects and users."""

    throttle_classes = [AssetUploadRateThrottle]

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id):
        name = sanitize_filename(request.data.get("name")) or "unnamed"
        type = request.data.get("type", "image/jpeg")
        try:
            size_limit = normalize_asset_size(request.data.get("size", settings.FILE_SIZE_LIMIT))
        except AssetUploadValidationError as exc:
            return Response({"error": str(exc), "status": False}, status=status.HTTP_400_BAD_REQUEST)
        entity_type = request.data.get("entity_type", "")
        entity_identifier = request.data.get("entity_identifier")

        # Check if the entity type is allowed
        if entity_type not in FileAsset.EntityTypeContext.values:
            return Response(
                {"error": "Invalid entity type.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if the file type is allowed
        allowed_types = get_allowed_asset_mime_types(entity_type)
        if type not in allowed_types:
            return Response(
                {
                    "error": "Invalid file type.",
                    "status": False,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the workspace
        workspace = Workspace.objects.get(slug=slug)
        project = Project.objects.get(id=project_id, workspace=workspace)
        entity_fields = get_validated_entity_fields(
            request=request,
            workspace=workspace,
            entity_type=entity_type,
            entity_id=entity_identifier,
            project=project,
        )

        # asset key
        asset_key = f"{workspace.id}/{uuid.uuid4().hex}-{name}"

        # Create a File Asset
        asset = FileAsset.objects.create(
            attributes={"name": name, "type": type, "size": size_limit},
            asset=asset_key,
            size=size_limit,
            workspace=workspace,
            created_by=request.user,
            entity_type=entity_type,
            **entity_fields,
        )

        # Get the presigned URL
        storage = S3Storage(request=request)
        # Generate a presigned URL to share an S3 object
        presigned_url = storage.generate_presigned_post(object_name=asset_key, file_type=type, file_size=size_limit)
        # Return the presigned URL
        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "asset_url": asset.asset_url,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id, pk):
        # get the asset id
        asset = FileAsset.objects.get(id=pk, workspace__slug=slug, project_id=project_id)
        invalid_upload_response = finalize_uploaded_asset(asset, request)
        if invalid_upload_response is not None:
            return invalid_upload_response
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def delete(self, request, slug, project_id, pk):
        # Get the asset
        asset = FileAsset.objects.get(id=pk, workspace__slug=slug, project_id=project_id)
        # Check deleted assets
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        # Save the asset
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, pk):
        # get the asset id
        asset = FileAsset.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)

        # Check if the asset is uploaded
        if not asset.is_uploaded:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if asset.external_source == "google_drive":
            web_view_link = asset.attributes.get("webViewLink") or asset.attributes.get("web_view_link")
            if web_view_link:
                return HttpResponseRedirect(web_view_link)

        # Get the presigned URL
        storage = S3Storage(request=request)
        # Generate a presigned URL to share an S3 object
        signed_url = storage.generate_presigned_url(
            object_name=asset.asset.name,
            disposition=get_asset_response_disposition(request),
            filename=asset.attributes.get("name"),
        )
        # Redirect to the signed URL
        return HttpResponseRedirect(signed_url)


class ProjectBulkAssetEndpoint(BaseAPIView):
    def save_project_cover(self, asset, project_id):
        project = Project.objects.get(id=project_id)
        project.cover_image_asset_id = asset.id
        project.save()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, entity_id):
        asset_ids = request.data.get("asset_ids", [])

        # Check if the asset ids are provided
        if not isinstance(asset_ids, list) or not asset_ids:
            return Response({"error": "No asset ids provided."}, status=status.HTTP_400_BAD_REQUEST)
        if len(asset_ids) > settings.ASSET_BULK_MAX_ITEMS:
            return Response(
                {"error": "Too many assets in one request."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            normalized_asset_ids = {uuid.UUID(str(asset_id)) for asset_id in asset_ids}
        except (TypeError, ValueError, AttributeError):
            return Response({"error": "Invalid asset id."}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.get(slug=slug)
        project = Project.objects.get(id=project_id, workspace=workspace)
        assets = FileAsset.objects.filter(
            id__in=normalized_asset_ids,
            workspace=workspace,
            project=project,
            created_by=request.user,
            is_uploaded=True,
        )

        if assets.count() != len(normalized_asset_ids):
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        entity_types = set(assets.values_list("entity_type", flat=True))
        if len(entity_types) != 1:
            return Response(
                {"error": "Assets in one request must have the same entity type."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entity_type = entity_types.pop()
        entity_fields = get_validated_entity_fields(
            request=request,
            workspace=workspace,
            entity_type=entity_type,
            entity_id=entity_id,
            project=project,
        )

        if entity_type == FileAsset.EntityTypeContext.PROJECT_COVER:
            if len(normalized_asset_ids) != 1:
                return Response(
                    {"error": "Only one project cover can be selected."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            asset = assets.first()
            self.save_project_cover(asset, project_id)

        if entity_type == FileAsset.EntityTypeContext.ISSUE_DESCRIPTION:
            # For some cases, the bulk api is called after the issue is deleted creating
            # an integrity error
            try:
                assets.update(issue=entity_fields["issue"])
            except IntegrityError:
                pass

        if entity_type == FileAsset.EntityTypeContext.COMMENT_DESCRIPTION:
            # For some cases, the bulk api is called after the comment is deleted
            # creating an integrity error
            try:
                assets.update(comment=entity_fields["comment"])
            except IntegrityError:
                pass

        if entity_type == FileAsset.EntityTypeContext.PAGE_DESCRIPTION:
            assets.update(page=entity_fields["page"])

        if entity_type == FileAsset.EntityTypeContext.DRAFT_ISSUE_DESCRIPTION:
            # For some cases, the bulk api is called after the draft issue is deleted
            # creating an integrity error
            try:
                assets.update(draft_issue=entity_fields["draft_issue"])
            except IntegrityError:
                pass

        return Response(status=status.HTTP_204_NO_CONTENT)


class AssetCheckEndpoint(BaseAPIView):
    """Endpoint to check if an asset exists."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, asset_id):
        asset = FileAsset.all_objects.filter(id=asset_id, workspace__slug=slug, deleted_at__isnull=True).exists()
        return Response({"exists": asset}, status=status.HTTP_200_OK)


class DuplicateAssetEndpoint(BaseAPIView):
    throttle_classes = [AssetRateThrottle]

    def get_entity_id_field(self, entity_type, entity_id):
        # Workspace Logo
        if entity_type == FileAsset.EntityTypeContext.WORKSPACE_LOGO:
            return {"workspace_id": entity_id}

        # Project Cover
        if entity_type == FileAsset.EntityTypeContext.PROJECT_COVER:
            return {"project_id": entity_id}

        # User Avatar and Cover
        if entity_type in [
            FileAsset.EntityTypeContext.USER_AVATAR,
            FileAsset.EntityTypeContext.USER_COVER,
        ]:
            return {"user_id": entity_id}

        # Issue Attachment and Description
        if entity_type in [
            FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            FileAsset.EntityTypeContext.ISSUE_DESCRIPTION,
        ]:
            return {"issue_id": entity_id}

        # Page Description
        if entity_type == FileAsset.EntityTypeContext.PAGE_DESCRIPTION:
            return {"page_id": entity_id}

        # Comment Description
        if entity_type == FileAsset.EntityTypeContext.COMMENT_DESCRIPTION:
            return {"comment_id": entity_id}

        return {}

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, asset_id):
        project_id = request.data.get("project_id", None)
        entity_id = request.data.get("entity_id", None)
        entity_type = request.data.get("entity_type", None)

        if not entity_type or entity_type not in FileAsset.EntityTypeContext.values:
            return Response(
                {"error": "Invalid entity type or entity id"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace = Workspace.objects.get(slug=slug)
        if project_id:
            # check if project exists in the workspace
            if not Project.objects.filter(id=project_id, workspace=workspace).exists():
                return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        storage = S3Storage(request=request)
        # Scope the source asset lookup to workspaces the caller is a member of
        user_workspace_ids = WorkspaceMember.objects.filter(
            member=request.user,
            is_active=True,
        ).values_list("workspace_id", flat=True)
        original_asset = FileAsset.objects.filter(
            id=asset_id,
            is_uploaded=True,
            workspace_id__in=user_workspace_ids,
        ).first()

        if not original_asset:
            return Response({"error": "Asset not found"}, status=status.HTTP_404_NOT_FOUND)

        sanitized_name = sanitize_filename(original_asset.attributes.get("name")) or "unnamed"
        destination_key = f"{workspace.id}/{uuid.uuid4().hex}-{sanitized_name}"
        duplicated_asset = FileAsset.objects.create(
            attributes={
                "name": original_asset.attributes.get("name"),
                "type": original_asset.attributes.get("type"),
                "size": original_asset.attributes.get("size"),
            },
            asset=destination_key,
            size=original_asset.size,
            workspace=workspace,
            created_by_id=request.user.id,
            entity_type=entity_type,
            project_id=project_id if project_id else None,
            storage_metadata=original_asset.storage_metadata,
            **self.get_entity_id_field(entity_type=entity_type, entity_id=entity_id),
        )
        storage.copy_object(original_asset.asset, destination_key)
        # Update the is_uploaded field for all newly created assets
        FileAsset.objects.filter(id=duplicated_asset.id).update(is_uploaded=True)

        return Response({"asset_id": str(duplicated_asset.id)}, status=status.HTTP_200_OK)


class WorkspaceAssetDownloadEndpoint(BaseAPIView):
    """Endpoint to generate a download link for an asset with content-disposition=attachment."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, asset_id):
        try:
            asset = FileAsset.objects.get(
                id=asset_id,
                workspace__slug=slug,
                is_uploaded=True,
            )
        except FileAsset.DoesNotExist:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if asset.external_source == "google_drive":
            web_view_link = asset.attributes.get("webViewLink") or asset.attributes.get("web_view_link")
            if web_view_link:
                return HttpResponseRedirect(web_view_link)

        storage = S3Storage(request=request)
        signed_url = storage.generate_presigned_url(
            object_name=asset.asset.name,
            disposition="attachment",
            filename=asset.attributes.get("name", uuid.uuid4().hex),
        )

        return HttpResponseRedirect(signed_url)


class ProjectAssetDownloadEndpoint(BaseAPIView):
    """Endpoint to generate a download link for an asset with content-disposition=attachment."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id, asset_id):
        try:
            asset = FileAsset.objects.get(
                id=asset_id,
                workspace__slug=slug,
                project_id=project_id,
                is_uploaded=True,
            )
        except FileAsset.DoesNotExist:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if asset.external_source == "google_drive":
            web_view_link = asset.attributes.get("webViewLink") or asset.attributes.get("web_view_link")
            if web_view_link:
                return HttpResponseRedirect(web_view_link)

        storage = S3Storage(request=request)
        signed_url = storage.generate_presigned_url(
            object_name=asset.asset.name,
            disposition="attachment",
            filename=asset.attributes.get("name", uuid.uuid4().hex),
        )

        return HttpResponseRedirect(signed_url)

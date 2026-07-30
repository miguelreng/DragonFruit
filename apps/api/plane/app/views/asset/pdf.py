# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from botocore.exceptions import ClientError
from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.db.models import FileAsset
from plane.settings.storage import S3Storage

from ..base import BaseAPIView


class ProjectPdfAssetContentEndpoint(BaseAPIView):
    """Stream a project PDF through the authenticated API for the custom viewer.

    Object-storage redirects work for browser navigation, but PDF.js fetches are
    subject to the storage bucket's CORS policy. Keeping the byte response on the
    API origin makes the native viewer reliable without exposing the asset.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, pk):
        asset = FileAsset.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            pk=pk,
            is_deleted=False,
            is_uploaded=True,
        ).first()
        if asset is None:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        content_type = asset.attributes.get("type") or "application/octet-stream"
        if content_type != "application/pdf":
            return Response(
                {"error": "The requested asset is not a PDF."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        storage = S3Storage(request=request)
        try:
            stored_object = storage.s3_client.get_object(
                Bucket=storage.aws_storage_bucket_name,
                Key=asset.asset.name,
            )
        except ClientError:
            return Response(
                {"error": "The requested asset could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        body = stored_object["Body"]

        def stream_content():
            try:
                yield from body.iter_chunks(chunk_size=1024 * 1024)
            finally:
                body.close()

        response = StreamingHttpResponse(stream_content(), content_type="application/pdf")
        response["Content-Disposition"] = "inline"
        response["Cache-Control"] = "private, max-age=300"
        content_length = stored_object.get("ContentLength")
        if content_length is not None:
            response["Content-Length"] = str(content_length)
        return response

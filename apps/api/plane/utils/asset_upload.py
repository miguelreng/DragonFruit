# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings

from plane.settings.storage import S3Storage


class AssetUploadValidationError(ValueError):
    """Raised when a declared or uploaded asset violates upload constraints."""


def normalize_asset_size(value) -> int:
    try:
        size = int(value)
    except (TypeError, ValueError) as exc:
        raise AssetUploadValidationError("Invalid file size.") from exc

    if size <= 0:
        raise AssetUploadValidationError("File size must be greater than zero.")

    return min(size, settings.FILE_SIZE_LIMIT)


def verify_uploaded_asset(asset, request=None) -> dict:
    """Verify the stored object before exposing it as an uploaded asset."""

    storage = S3Storage(request=request)
    metadata = storage.get_object_metadata(object_name=asset.asset.name)
    if not metadata:
        raise AssetUploadValidationError("The uploaded file could not be verified.")

    try:
        content_length = int(metadata.get("ContentLength"))
    except (TypeError, ValueError) as exc:
        raise AssetUploadValidationError("The uploaded file has invalid size metadata.") from exc

    declared_limit = min(int(asset.size), settings.FILE_SIZE_LIMIT)
    if content_length <= 0 or content_length > declared_limit:
        raise AssetUploadValidationError("The uploaded file exceeds its declared size.")

    declared_type = str(asset.attributes.get("type") or "").split(";", 1)[0].strip().lower()
    stored_type = str(metadata.get("ContentType") or "").split(";", 1)[0].strip().lower()
    if not declared_type or stored_type != declared_type:
        raise AssetUploadValidationError("The uploaded file type does not match its declaration.")

    return metadata

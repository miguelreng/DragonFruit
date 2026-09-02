from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.test import override_settings

from plane.utils.asset_upload import (
    AssetUploadValidationError,
    normalize_asset_size,
    verify_uploaded_asset,
)


@override_settings(FILE_SIZE_LIMIT=1024)
def test_normalize_asset_size_rejects_invalid_values_and_caps_large_values():
    with pytest.raises(AssetUploadValidationError):
        normalize_asset_size("invalid")
    with pytest.raises(AssetUploadValidationError):
        normalize_asset_size(0)

    assert normalize_asset_size(2048) == 1024


@override_settings(FILE_SIZE_LIMIT=1024)
@patch("plane.utils.asset_upload.S3Storage")
def test_verify_uploaded_asset_rejects_mismatched_content_type(mock_storage):
    mock_storage.return_value.get_object_metadata.return_value = {
        "ContentLength": 128,
        "ContentType": "text/plain",
    }
    asset = SimpleNamespace(
        asset=SimpleNamespace(name="workspace/file.png"),
        attributes={"type": "image/png"},
        size=512,
    )

    with pytest.raises(AssetUploadValidationError):
        verify_uploaded_asset(asset)


@override_settings(FILE_SIZE_LIMIT=1024)
@patch("plane.utils.asset_upload.S3Storage")
def test_verify_uploaded_asset_accepts_object_within_declared_limits(mock_storage):
    metadata = {"ContentLength": 128, "ContentType": "image/png"}
    mock_storage.return_value.get_object_metadata.return_value = metadata
    asset = SimpleNamespace(
        asset=SimpleNamespace(name="workspace/file.png"),
        attributes={"type": "image/png"},
        size=512,
    )

    assert verify_uploaded_asset(asset) == metadata

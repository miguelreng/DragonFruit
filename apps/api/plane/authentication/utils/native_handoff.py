# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from urllib.parse import urlparse

from plane.db.models import APIToken
from plane.utils.path_validator import ALLOWED_NATIVE_REDIRECT_SCHEMES


def is_native_callback(next_path: str | None) -> bool:
    if not next_path:
        return False
    parsed = urlparse(str(next_path))
    return parsed.scheme in ALLOWED_NATIVE_REDIRECT_SCHEMES and parsed.path.startswith("/")


def create_native_api_token(user) -> str:
    token = APIToken.objects.create(
        user=user,
        user_type=0,
        label="dragonfruit_native_login",
        description="Native desktop login handoff token",
        is_service=False,
    )
    return token.token

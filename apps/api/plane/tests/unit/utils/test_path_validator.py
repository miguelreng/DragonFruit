# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from urllib.parse import parse_qs, urlparse

import pytest

from plane.utils.path_validator import get_safe_redirect_url


@pytest.mark.unit
class TestGetSafeRedirectURL:
    def test_encodes_next_path_with_own_query_params(self, settings):
        settings.WEB_URL = "https://app.dragonfruit.sh"
        settings.APP_BASE_URL = "https://app.dragonfruit.sh"
        settings.ADMIN_BASE_URL = ""
        settings.SPACE_BASE_URL = ""

        next_path = (
            "/native-login?relogin=1&callback="
            "https%3A%2F%2Fabcdefghijklmno.chromiumapp.org%2Fauth%2Flogin-callback"
        )

        result = get_safe_redirect_url("https://app.dragonfruit.sh", next_path=next_path)
        parsed_result = urlparse(result)
        query = parse_qs(parsed_result.query)

        assert parsed_result.scheme == "https"
        assert parsed_result.netloc == "app.dragonfruit.sh"
        assert query["next_path"] == [next_path]
        assert "callback" not in query

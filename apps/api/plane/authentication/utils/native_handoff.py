# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from html import escape
from urllib.parse import urlparse

from django.http import HttpResponse
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


def native_handoff_response(callback_url: str) -> HttpResponse:
    safe_url = escape(callback_url, quote=True)
    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirecting to DragonFruit Mini</title>
    <style>
      body {{
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        background: #f7f7fb;
        color: #1f2230;
      }}
      .wrap {{
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }}
      .card {{
        width: 100%;
        max-width: 540px;
        border: 1px solid #e6e6ef;
        border-radius: 16px;
        background: white;
        padding: 20px;
        box-shadow: 0 8px 28px rgba(20, 20, 40, 0.08);
      }}
      h1 {{ font-size: 20px; margin: 0 0 8px 0; }}
      p {{ color: #5d6274; margin: 0 0 14px 0; }}
      code {{
        display: block;
        white-space: pre-wrap;
        word-break: break-all;
        background: #f4f5fb;
        border: 1px solid #eceef7;
        border-radius: 10px;
        padding: 10px;
        font-size: 12px;
      }}
      a {{
        display: inline-block;
        margin-top: 14px;
        text-decoration: none;
        background: #e445a6;
        color: white;
        border-radius: 10px;
        padding: 10px 14px;
        font-weight: 600;
      }}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Redirecting to DragonFruit Mini...</h1>
        <p>If the mini app did not open automatically, use the button below.</p>
        <code>{safe_url}</code>
        <a href="{safe_url}">Open DragonFruit Mini</a>
      </div>
    </div>
    <script>
      window.location.assign("{safe_url}");
    </script>
  </body>
</html>"""
    return HttpResponse(html)

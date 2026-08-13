# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import DatabaseError, connection
from django.http import HttpResponse, JsonResponse


def health_check(request):
    response = JsonResponse({"status": "OK"})
    response["Cache-Control"] = "no-store"
    return response


def readiness_check(request):
    """Report whether this API replica can serve database-backed requests."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except DatabaseError:
        response = JsonResponse({"status": "unavailable", "database": "error"}, status=503)
    else:
        response = JsonResponse({"status": "ready", "database": "ok"})

    response["Cache-Control"] = "no-store"
    return response


def robots_txt(request):
    return HttpResponse("User-agent: *\nDisallow: /", content_type="text/plain")

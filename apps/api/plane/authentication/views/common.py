# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.shortcuts import render
from django.http import HttpResponseRedirect
from urllib.parse import quote, urlencode

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from zxcvbn import zxcvbn

## Module imports
from plane.app.serializers import UserSerializer
from plane.authentication.utils.login import user_login
from plane.db.models import User
from plane.authentication.adapter.error import (
    AuthenticationException,
    AUTHENTICATION_ERROR_CODES,
)
from django.middleware.csrf import get_token
from plane.utils.cache import invalidate_cache
from plane.authentication.utils.host import base_host
from plane.authentication.utils.native_handoff import (
    create_native_api_token,
    is_native_callback,
    native_handoff_response,
)


class NativeLoginStartEndpoint(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        callback = request.GET.get("callback", "dragonfruitmini://auth/login-callback")
        if not is_native_callback(callback):
            callback = "dragonfruitmini://auth/login-callback"

        if request.user.is_authenticated:
            separator = "&" if "?" in callback else "?"
            token = create_native_api_token(request.user)
            if request.GET.get("format") == "json" or "application/json" in request.headers.get("Accept", ""):
                return Response(
                    {"api_token": token, "callback": f"{callback}{separator}api_token={quote(token)}"},
                    status=status.HTTP_200_OK,
                )
            return native_handoff_response(f"{callback}{separator}api_token={quote(token)}")

        app_host = base_host(request=request, is_app=True).rstrip("/")
        native_login_path = f"/auth/native/start/?{urlencode({'callback': callback})}"
        return HttpResponseRedirect(f"{app_host}/login?{urlencode({'next_path': native_login_path})}")


class CSRFTokenEndpoint(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        # Generate a CSRF token
        csrf_token = get_token(request)
        # Return the CSRF token in a JSON response
        return Response({"csrf_token": str(csrf_token)}, status=status.HTTP_200_OK)


def csrf_failure(request, reason=""):
    """Custom CSRF failure view"""
    return render(
        request,
        "csrf_failure.html",
        {"reason": reason, "root_url": base_host(request=request)},
    )


class ChangePasswordEndpoint(APIView):
    def post(self, request):
        user = User.objects.get(pk=request.user.id)

        # If the user password is not autoset then we need to check the old passwords
        if not user.is_password_autoset:
            old_password = request.data.get("old_password", False)
            if not old_password:
                exc = AuthenticationException(
                    error_code=AUTHENTICATION_ERROR_CODES["MISSING_PASSWORD"],
                    error_message="MISSING_PASSWORD",
                    payload={"error": "Old password is missing"},
                )
                return Response(exc.get_error_dict(), status=status.HTTP_400_BAD_REQUEST)

        # Get the new password
        new_password = request.data.get("new_password", False)

        if not new_password:
            exc = AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["MISSING_PASSWORD"],
                error_message="MISSING_PASSWORD",
                payload={"error": "Old or new password is missing"},
            )
            return Response(exc.get_error_dict(), status=status.HTTP_400_BAD_REQUEST)

        # If the user password is not autoset then we need to check the old passwords
        if not user.is_password_autoset and not user.check_password(old_password):
            exc = AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["INCORRECT_OLD_PASSWORD"],
                error_message="INCORRECT_OLD_PASSWORD",
                payload={"error": "Old password is not correct"},
            )
            return Response(exc.get_error_dict(), status=status.HTTP_400_BAD_REQUEST)

        # check the password score
        results = zxcvbn(new_password)
        if results["score"] < 3:
            exc = AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["PASSWORD_TOO_WEAK"],
                error_message="PASSWORD_TOO_WEAK",
            )
            return Response(exc.get_error_dict(), status=status.HTTP_400_BAD_REQUEST)

        # set_password also hashes the password that the user will get
        user.set_password(new_password)
        user.is_password_autoset = False
        user.save()
        user_login(user=user, request=request, is_app=True)
        return Response({"message": "Password updated successfully"}, status=status.HTTP_200_OK)


class SetUserPasswordEndpoint(APIView):
    @invalidate_cache("/api/users/me/")
    def post(self, request):
        user = User.objects.get(pk=request.user.id)
        password = request.data.get("password", False)

        # If the user password is not autoset then return error
        if not user.is_password_autoset:
            exc = AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["PASSWORD_ALREADY_SET"],
                error_message="PASSWORD_ALREADY_SET",
                payload={"error": "Your password is already set please change your password from profile"},
            )
            return Response(exc.get_error_dict(), status=status.HTTP_400_BAD_REQUEST)

        # Check password validation
        if not password:
            exc = AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["INVALID_PASSWORD"],
                error_message="INVALID_PASSWORD",
            )
            return Response(exc.get_error_dict(), status=status.HTTP_400_BAD_REQUEST)

        results = zxcvbn(password)
        if results["score"] < 3:
            exc = AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["INVALID_PASSWORD"],
                error_message="INVALID_PASSWORD",
            )
            return Response(exc.get_error_dict(), status=status.HTTP_400_BAD_REQUEST)

        # Set the user password
        user.set_password(password)
        user.is_password_autoset = False
        user.save()
        # Login the user as the session is invalidated
        user_login(user=user, request=request, is_app=True)
        # Return the user
        serializer = UserSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)

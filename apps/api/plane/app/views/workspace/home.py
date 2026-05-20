# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from ..base import BaseAPIView
from plane.db.models.workspace import WorkspaceHomePreference
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Workspace
from plane.app.serializers.workspace import WorkspaceHomePreferenceSerializer

# Third party imports
from rest_framework.response import Response
from rest_framework import status


class WorkspaceHomePreferenceViewSet(BaseAPIView):
    model = WorkspaceHomePreference

    def get_serializer_class(self):
        return WorkspaceHomePreferenceSerializer

    # Keys that get auto-seeded on first GET. Order here is the default
    # rendering order on the home page (higher sort_order = earlier).
    # Legacy widget keys are deliberately absent — the section-based
    # home view replaced them.
    _SEEDED_KEYS = ["inbox", "on_my_plate", "favorites", "agent_cost"]

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        existing_keys = set(
            WorkspaceHomePreference.objects.filter(
                user=request.user, workspace_id=workspace.id
            ).values_list("key", flat=True)
        )

        # Seed any missing section keys with a sensible default order.
        # Higher sort_order = renders earlier (descending order on the
        # client). `inbox` gets the highest, `agent_cost` the lowest of
        # the seeded set — admins can still drag it up.
        missing = [k for k in self._SEEDED_KEYS if k not in existing_keys]
        if missing:
            base = 1000
            WorkspaceHomePreference.objects.bulk_create(
                [
                    WorkspaceHomePreference(
                        key=k,
                        user=request.user,
                        workspace=workspace,
                        sort_order=base - i,
                    )
                    for i, k in enumerate(missing)
                ],
                batch_size=10,
                ignore_conflicts=True,
            )

        preference = WorkspaceHomePreference.objects.filter(
            user=request.user, workspace_id=workspace.id
        )

        return Response(
            preference.values("key", "is_enabled", "config", "sort_order"),
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def patch(self, request, slug, key):
        preference = WorkspaceHomePreference.objects.filter(key=key, workspace__slug=slug, user=request.user).first()

        if preference:
            serializer = WorkspaceHomePreferenceSerializer(preference, data=request.data, partial=True)

            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": "Preference not found"}, status=status.HTTP_400_BAD_REQUEST)

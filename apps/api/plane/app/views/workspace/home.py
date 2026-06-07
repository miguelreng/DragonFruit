# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from ..base import BaseAPIView
from plane.db.models.workspace import WorkspaceHomePreference
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Workspace, Page, Issue
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
    _SEEDED_KEYS = ["inbox", "my_tasks", "favorites", "recent_activity", "activity", "agent_cost"]

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


class WorkspaceActivitySummaryEndpoint(BaseAPIView):
    """Per-day activity summary for the home-page heatmap widget.

    Buckets `Page.created_at` (docs) and `Issue.created_at` (work items)
    across the workspace into daily counts. Returns enough shape for the
    client to render the heatmap grid + summary stat cards in one round
    trip.

    `range` query param: "all" (default), "30d", or "7d". "all" caps at
    365 days of buckets so the response stays bounded on long-lived
    workspaces.

    Each action type contributes a weighted amount to a day's intensity
    `score`, so the heatmap shade reflects the *kind* of work done and not
    just the raw event count. `count` stays the unweighted total (used for
    streaks, stat cards, and tooltips); `score` drives the cell shade. The
    weights are echoed back as `action_weights` so the client can explain
    the grading. Keep every weight positive so a day with any activity
    still grades non-empty (score > 0 iff count > 0, which keeps streak
    math identical).
    """

    _RANGE_DAYS = {"7d": 7, "30d": 30, "all": 365}

    # Docs (pages) tend to represent more substantial effort than a single
    # work item, so they weigh heavier. Tunable.
    _ACTION_WEIGHTS = {"docs": 2, "work_items": 1}

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        from datetime import timedelta
        from django.db.models import Count
        from django.db.models.functions import TruncDate, ExtractHour
        from django.utils import timezone as dj_timezone

        rng = request.query_params.get("range", "all")
        if rng not in self._RANGE_DAYS:
            rng = "all"
        days = self._RANGE_DAYS[rng]

        now = dj_timezone.now()
        # Inclusive window: today counts as day 1, so we go back `days - 1`.
        since = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

        pages = Page.objects.filter(
            workspace__slug=slug,
            deleted_at__isnull=True,
            created_at__gte=since,
        )
        issues = Issue.issue_objects.filter(
            workspace__slug=slug,
            created_at__gte=since,
        )

        page_by_day = {
            row["d"]: row["c"]
            for row in pages.annotate(d=TruncDate("created_at")).values("d").annotate(c=Count("id"))
        }
        issue_by_day = {
            row["d"]: row["c"]
            for row in issues.annotate(d=TruncDate("created_at")).values("d").annotate(c=Count("id"))
        }

        # Build a contiguous daily series so the client doesn't have to
        # fill gaps. Oldest first, today last.
        daily_buckets = []
        today = now.date()
        for i in range(days):
            d = today - timedelta(days=days - 1 - i)
            docs = page_by_day.get(d, 0)
            tasks = issue_by_day.get(d, 0)
            daily_buckets.append(
                {
                    "date": d.isoformat(),
                    "docs": docs,
                    "work_items": tasks,
                    "count": docs + tasks,
                    "score": docs * self._ACTION_WEIGHTS["docs"]
                    + tasks * self._ACTION_WEIGHTS["work_items"],
                }
            )

        # Streaks operate on the full buckets list ordered oldest -> newest.
        # "Current streak" = trailing run of non-zero days ending today (or
        # broken yesterday if today is still empty — we still count up
        # through yesterday so a fresh morning doesn't reset everyone).
        longest = 0
        run = 0
        for b in daily_buckets:
            if b["count"] > 0:
                run += 1
                longest = max(longest, run)
            else:
                run = 0
        current = 0
        for b in reversed(daily_buckets):
            if b["count"] > 0:
                current += 1
            elif current == 0 and b["date"] == today.isoformat():
                # Empty today is fine — keep walking back to count yesterday.
                continue
            else:
                break

        active_days = sum(1 for b in daily_buckets if b["count"] > 0)
        total_docs = sum(b["docs"] for b in daily_buckets)
        total_tasks = sum(b["work_items"] for b in daily_buckets)

        # Peak hour: compute across the same window using ExtractHour.
        hour_rows = list(
            pages.annotate(h=ExtractHour("created_at")).values("h").annotate(c=Count("id"))
        ) + list(
            issues.annotate(h=ExtractHour("created_at")).values("h").annotate(c=Count("id"))
        )
        hour_buckets = [0] * 24
        for row in hour_rows:
            h = row["h"]
            if h is not None and 0 <= h < 24:
                hour_buckets[h] += row["c"]
        peak_hour = max(range(24), key=lambda h: hour_buckets[h]) if any(hour_buckets) else None

        return Response(
            {
                "range": rng,
                "since": since.date().isoformat(),
                "until": today.isoformat(),
                "totals": {
                    "items": total_docs + total_tasks,
                    "docs": total_docs,
                    "work_items": total_tasks,
                },
                "active_days": active_days,
                "current_streak": current,
                "longest_streak": longest,
                "peak_hour": peak_hour,
                "top_type": "docs" if total_docs >= total_tasks else "work_items",
                "action_weights": self._ACTION_WEIGHTS,
                "daily_buckets": daily_buckets,
                "hour_buckets": [{"hour": h, "count": c} for h, c in enumerate(hour_buckets)],
            },
            status=status.HTTP_200_OK,
        )

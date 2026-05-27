# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from plane.db.models import Page
from plane.db.models.page import ensure_page_public_slug


class Command(BaseCommand):
    help = "Backfill view_props.public_slug for published essays."

    def add_arguments(self, parser):
        parser.add_argument(
            "--project-id",
            type=str,
            default=None,
            help="Essay project UUID. Defaults to ESSAY_ILLUSTRATION_PROJECT_ID/DRAGONFRUIT_ESSAYS_PROJECT_ID.",
        )
        parser.add_argument(
            "--workspace-slug",
            type=str,
            default=None,
            help="Optional workspace slug filter.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show how many pages would be updated without writing changes.",
        )

    def handle(self, *args, **options):
        configured_project_id = (
            options["project_id"]
            or getattr(settings, "ESSAY_ILLUSTRATION_PROJECT_ID", "")
            or ""
        ).strip()
        if not configured_project_id:
            raise CommandError(
                "Missing essay project id. Pass --project-id or set ESSAY_ILLUSTRATION_PROJECT_ID."
            )

        filters = Q(
            page_type=Page.PAGE_TYPE_DOC,
            access=Page.PUBLIC_ACCESS,
            archived_at__isnull=True,
            project_pages__project_id=configured_project_id,
            project_pages__deleted_at__isnull=True,
        ) & (Q(view_props__public_slug__isnull=True) | Q(view_props__public_slug=""))

        if options["workspace_slug"]:
            filters &= Q(workspace__slug=options["workspace_slug"])

        pages = (
            Page.objects.filter(filters)
            .distinct()
            .select_related("workspace")
            .order_by("created_at")
        )

        total = pages.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("No published essays missing public_slug."))
            return

        self.stdout.write(f"Found {total} published essays missing public_slug.")
        if options["dry_run"]:
            for page in pages:
                self.stdout.write(f"- {page.workspace.slug}/{page.id}: {page.name}")
            return

        updated = 0
        for page in pages:
            if ensure_page_public_slug(page):
                updated += 1

        self.stdout.write(self.style.SUCCESS(f"Updated {updated} essay pages with public_slug."))

# One-time cleanup: soft-delete imported Google Calendar events.
#
# The calendar overlays live Google events directly, so Issues that were
# imported with external_source="google_calendar" are redundant duplicates that
# lingered as ghost tasks after the source event was deleted in Google. We stamp
# deleted_at to hide them (recoverable by clearing deleted_at). Idempotent: a
# re-run matches nothing because already-cleaned rows have deleted_at set.

from django.db import migrations
from django.utils import timezone


def soft_delete_imported_google_calendar_issues(apps, schema_editor):
    Issue = apps.get_model("db", "Issue")
    # Historical models only carry managers flagged use_in_migrations; Issue's
    # sole manager is `issue_objects`, so the rendered model has no `objects`.
    # `_base_manager` always exists and (being unfiltered) sees every row.
    Issue._base_manager.filter(external_source="google_calendar", deleted_at__isnull=True).update(
        deleted_at=timezone.now()
    )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0151_project_bookmark_comment"),
    ]

    operations = [
        migrations.RunPython(
            soft_delete_imported_google_calendar_issues,
            migrations.RunPython.noop,
        ),
    ]

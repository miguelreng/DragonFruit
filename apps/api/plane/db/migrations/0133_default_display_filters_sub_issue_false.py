# Generated for the "subtasks don't show flat in the list" change.
#
# The server's get_default_display_filters() used to ship `sub_issue: True`,
# so every existing ProjectUserProperty row carries an explicit `sub_issue:
# true` even though we want subtasks to live nested under their parent in the
# expanded tree view, not as duplicate flat rows in the same state group.
# Now that the default has flipped to False, this migration normalizes
# existing rows so users don't have to toggle "Show sub-tasks" off in every
# layout of every project.
#
# Same shape as migration 0132 (which did the equivalent sweep for the `key`
# display property). Users who want flat sub-tasks back can re-enable per
# layout via Display filters — that preference persists from that point.
#
# Idempotent: re-running has no effect once sub_issue is false everywhere.

from django.db import migrations


def flip_sub_issue_to_false(apps, schema_editor):
    ProjectUserProperty = apps.get_model("db", "ProjectUserProperty")
    qs = ProjectUserProperty.objects.all().only("id", "display_filters")
    updated = []
    for row in qs.iterator(chunk_size=500):
        filters = row.display_filters or {}
        if filters.get("sub_issue") is True:
            filters["sub_issue"] = False
            row.display_filters = filters
            updated.append(row)
            if len(updated) >= 500:
                ProjectUserProperty.objects.bulk_update(updated, ["display_filters"])
                updated.clear()
    if updated:
        ProjectUserProperty.objects.bulk_update(updated, ["display_filters"])


def noop_reverse(apps, schema_editor):
    # We don't restore `sub_issue: true` on reverse — see 0132 for the same
    # reasoning. Downgrading shouldn't silently re-enable a UI behavior the
    # user turned off.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0132_default_display_properties_key_false"),
    ]

    operations = [
        migrations.RunPython(flip_sub_issue_to_false, reverse_code=noop_reverse),
    ]

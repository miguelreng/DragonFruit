# Generated for the "hide PROJECT-X identifier by default" change.
#
# The server's get_default_display_properties() used to ship `key: True`, so
# every existing ProjectUserProperty row carries an explicit `key: true` even
# though most users only ever wanted the identifier in the spreadsheet's Key
# column — not as a prefix chip on every list / kanban / calendar / gantt row.
# Now that the default has flipped to False, this migration normalizes
# existing rows so users don't have to toggle Display → Key off in every
# layout of every project.
#
# Only rows where the user never explicitly set `key` are touched in spirit —
# but the API surface gives us no way to distinguish "explicit true" from
# "default true", so the migration flips all current trues to false. Users
# who want the identifier back can re-enable per layout via Display filters
# (their preference is persisted from that point on).
#
# Idempotent: re-running has no effect once `key` is false everywhere.

from django.db import migrations


def flip_key_to_false(apps, schema_editor):
    ProjectUserProperty = apps.get_model("db", "ProjectUserProperty")
    # Iterate in chunks to avoid loading everything into memory on large
    # installs. Self-hosted single-tenant installs are tiny, but the upstream
    # cloud schema is the same and this lands in a public fork.
    qs = ProjectUserProperty.objects.all().only("id", "display_properties")
    updated = []
    for row in qs.iterator(chunk_size=500):
        props = row.display_properties or {}
        if props.get("key") is True:
            props["key"] = False
            row.display_properties = props
            updated.append(row)
            if len(updated) >= 500:
                ProjectUserProperty.objects.bulk_update(updated, ["display_properties"])
                updated.clear()
    if updated:
        ProjectUserProperty.objects.bulk_update(updated, ["display_properties"])


def noop_reverse(apps, schema_editor):
    # We don't restore `key: true` on reverse — the new default is False and
    # downgrading the codebase is unusual enough that we'd rather not silently
    # re-enable a UI element the user explicitly turned off.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0131_agent_mcp_servers"),
    ]

    operations = [
        migrations.RunPython(flip_key_to_false, reverse_code=noop_reverse),
    ]

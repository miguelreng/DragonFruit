# Renames the "on_my_plate" home-preference section key to "my_tasks".
# The HomeWidgetKeys enum is not enforced as a DB constraint and the `key`
# column is a plain CharField, so this is a pure data update — no schema change.
from django.db import migrations


def rename_forward(apps, schema_editor):
    WorkspaceHomePreference = apps.get_model("db", "WorkspaceHomePreference")

    # Avoid violating the (workspace, user, key) unique constraint for active
    # rows: if a (workspace, user) somehow already has a "my_tasks" row, drop
    # the redundant "on_my_plate" row instead of renaming it into a collision.
    existing_my_tasks = set(
        WorkspaceHomePreference.objects.filter(
            key="my_tasks", deleted_at__isnull=True
        ).values_list("workspace_id", "user_id")
    )
    if existing_my_tasks:
        colliding_ids = [
            pref.id
            for pref in WorkspaceHomePreference.objects.filter(
                key="on_my_plate", deleted_at__isnull=True
            )
            if (pref.workspace_id, pref.user_id) in existing_my_tasks
        ]
        if colliding_ids:
            WorkspaceHomePreference.objects.filter(id__in=colliding_ids).delete()

    WorkspaceHomePreference.objects.filter(
        key="on_my_plate", deleted_at__isnull=True
    ).update(key="my_tasks")


def rename_backward(apps, schema_editor):
    WorkspaceHomePreference = apps.get_model("db", "WorkspaceHomePreference")
    WorkspaceHomePreference.objects.filter(
        key="my_tasks", deleted_at__isnull=True
    ).update(key="on_my_plate")


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0148_agent_chat_doc_scope"),
    ]

    operations = [
        migrations.RunPython(rename_forward, rename_backward),
    ]

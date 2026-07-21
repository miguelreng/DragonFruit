from django.db import migrations, models


def backfill_page_version_type(apps, schema_editor):
    PageVersion = apps.get_model("db", "PageVersion")
    pending = []
    for version in PageVersion.objects.only("id", "description_json").iterator(chunk_size=500):
        body = version.description_json if isinstance(version.description_json, dict) else {}
        if isinstance(body.get("sheet_snapshot"), dict):
            version.page_type = "sheet"
        elif isinstance(body.get("excalidraw_snapshot"), dict):
            version.page_type = "whiteboard"
        else:
            version.page_type = "doc"
        pending.append(version)
        if len(pending) == 500:
            PageVersion.objects.bulk_update(pending, ["page_type"])
            pending = []
    if pending:
        PageVersion.objects.bulk_update(pending, ["page_type"])


class Migration(migrations.Migration):
    dependencies = [("db", "0163_agent_chat_session_context")]

    operations = [
        migrations.AddField(
            model_name="pageversion",
            name="page_type",
            field=models.CharField(
                choices=[
                    ("doc", "Doc"),
                    ("whiteboard", "Whiteboard"),
                    ("pdf", "PDF"),
                    ("sheet", "Sheet"),
                    ("folder", "Folder"),
                ],
                default="doc",
                max_length=16,
            ),
        ),
        migrations.RunPython(backfill_page_version_type, migrations.RunPython.noop),
    ]

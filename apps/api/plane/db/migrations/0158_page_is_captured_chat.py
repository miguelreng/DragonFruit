# Generated for the captured-chat artifact feature.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0157_page_is_brief"),
    ]

    operations = [
        migrations.AddField(
            model_name="page",
            name="is_captured_chat",
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]

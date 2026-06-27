# Generated for project-scoped stickies

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0155_workspace_composio_config"),
    ]

    operations = [
        migrations.AddField(
            model_name="sticky",
            name="project",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="stickies",
                to="db.project",
            ),
        ),
    ]

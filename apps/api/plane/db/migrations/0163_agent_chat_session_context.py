import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0162_page_folder_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="agentchatsession",
            name="context_page",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="db.page",
            ),
        ),
        migrations.AddField(
            model_name="agentchatsession",
            name="context_project",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="db.project",
            ),
        ),
        migrations.AddField(
            model_name="agentchatsession",
            name="context_updated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="agentchatsession",
            name="context_updated_by_surface",
            field=models.CharField(blank=True, default="", max_length=16),
        ),
    ]

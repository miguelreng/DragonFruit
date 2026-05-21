# Adds `ProjectTemplate` — workspace-scoped reusable project skeletons.
# Mirrors the role PageTemplate plays for docs: a row holds the defaults
# copied into a freshly-created project, plus a JSON list of initial tasks
# the instantiate endpoint materialises after the project is created.

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0137_chat_message_attachments"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectTemplate",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Updated At")),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("deleted_at", models.DateTimeField(null=True)),
                ("name", models.CharField(max_length=255)),
                ("description", models.CharField(blank=True, default="", max_length=512)),
                ("logo_props", models.JSONField(default=dict)),
                ("project_description", models.TextField(blank=True, default="")),
                (
                    "network",
                    models.PositiveSmallIntegerField(choices=[(0, "Secret"), (2, "Public")], default=0),
                ),
                ("initial_tasks", models.JSONField(blank=True, default=list)),
                (
                    "owned_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="project_templates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_templates",
                        to="db.workspace",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
            ],
            options={
                "verbose_name": "Project Template",
                "verbose_name_plural": "Project Templates",
                "db_table": "project_templates",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="projecttemplate",
            index=models.Index(fields=["workspace", "-created_at"], name="project_tem_workspac_a6b3f1_idx"),
        ),
    ]

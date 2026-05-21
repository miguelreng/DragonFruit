# Adds `PageTemplate` — workspace-scoped reusable page skeletons that the
# Create Page modal can pick from and that any page can be saved as. Body fields
# mirror `Page` (description_html / _json / _binary) so instantiation is a
# straight field-for-field copy.

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0135_userfavorite_view_layout"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PageTemplate",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                ("description", models.CharField(blank=True, default="", max_length=512)),
                ("logo_props", models.JSONField(default=dict)),
                ("description_html", models.TextField(blank=True, default="<p></p>")),
                ("description_json", models.JSONField(blank=True, default=dict)),
                ("description_binary", models.BinaryField(null=True)),
                ("description_stripped", models.TextField(blank=True, null=True)),
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
                (
                    "owned_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="page_templates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="page_templates",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Page Template",
                "verbose_name_plural": "Page Templates",
                "db_table": "page_templates",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="pagetemplate",
            index=models.Index(
                fields=["workspace", "-created_at"],
                name="pagetemplate_ws_created_idx",
            ),
        ),
    ]

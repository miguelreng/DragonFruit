# Generated for DragonFruit bookmark comments

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0150_pdf_page_type"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectBookmarkComment",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("comment", models.TextField(blank=True, default="")),
                ("edited_at", models.DateTimeField(blank=True, null=True)),
                ("actor", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bookmark_comments", to=settings.AUTH_USER_MODEL)),
                ("bookmark", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="comments", to="db.projectbookmark")),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("project", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="project_%(class)s", to="db.project")),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
                ("workspace", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="workspace_%(class)s", to="db.workspace")),
            ],
            options={
                "verbose_name": "Project Bookmark Comment",
                "verbose_name_plural": "Project Bookmark Comments",
                "db_table": "project_bookmark_comments",
                "ordering": ("created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="projectbookmarkcomment",
            index=models.Index(fields=["bookmark", "created_at"], name="bookmark_comment_thread_idx"),
        ),
    ]

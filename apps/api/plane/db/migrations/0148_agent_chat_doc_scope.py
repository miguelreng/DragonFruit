import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0147_sticky_tags"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="agentchatsession",
            name="scope_type",
            field=models.CharField(blank=True, default="personal", max_length=24),
        ),
        migrations.AddField(
            model_name="agentchatsession",
            name="page",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="agent_chat_sessions",
                to="db.page",
            ),
        ),
        migrations.AddField(
            model_name="agentchatmessage",
            name="user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="agent_chat_messages",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddIndex(
            model_name="agentchatsession",
            index=models.Index(
                fields=["workspace", "scope_type", "page", "-last_activity_at"],
                name="agent_chat__workspa_4f5427_idx",
            ),
        ),
    ]

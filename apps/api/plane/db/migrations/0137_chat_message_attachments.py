# Adds `attachments` JSONField to AgentChatMessage so users can drop
# images / CSVs / PDFs into the topbar chat composer. The field is a
# plain list — see the model docstring for shape — so no separate
# attachment table is needed for v1.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        # Both 0136 migrations (chat_message_attachments and
        # page_templates) sit as parallel leaves on top of 0135 — this
        # one merges after page_templates to keep the graph linear.
        # The two are unrelated so ordering doesn't matter.
        ("db", "0136_page_templates"),
    ]

    operations = [
        migrations.AddField(
            model_name="agentchatmessage",
            name="attachments",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

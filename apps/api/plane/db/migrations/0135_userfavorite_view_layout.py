# Adds `view_layout` to UserFavorite so the favorites sidebar can render
# the right icon (list / kanban / calendar / gantt / spreadsheet) when the
# user stars a project from inside its Tasks page. Plain project favorites
# (added from the project list) leave this null and keep their emoji.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0134_agent_chat_sessions"),
    ]

    operations = [
        migrations.AddField(
            model_name="userfavorite",
            name="view_layout",
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
    ]

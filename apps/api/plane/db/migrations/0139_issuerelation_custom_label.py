# Generated for the relation-field foundation (roadmap item #1).
#
# Adds a nullable `custom_label` column to issue_relations so projects can
# give their relations human-meaningful names ("Stakeholder", "Approved by")
# without us shipping every conceivable relation type as an IssueRelationChoices
# enum value. When null, the UI falls back to the existing relation_type
# display (Blocks, Relates To, etc.) — no behavior change for existing rows.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0138_project_template"),
    ]

    operations = [
        migrations.AddField(
            model_name="issuerelation",
            name="custom_label",
            field=models.CharField(blank=True, max_length=120, null=True),
        ),
    ]

# Rename Workspace.llm_api_key -> Workspace.llm_api_key_encrypted.
#
# The column has always stored Fernet ciphertext (every read goes through
# plane.license.utils.encryption.decrypt_data), but the misleading column
# name allowed a separate bug: WorkSpaceSerializer used `fields = "__all__"`,
# so the ciphertext was being serialised into every workspace API response.
# Renaming the column to `_encrypted` is a small code-quality + clarity fix;
# the matching serialiser change explicitly excludes the field from output.
#
# RenameField is a single ALTER TABLE ... RENAME COLUMN — no data copy
# required, instant on Postgres, and reversible.

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0127_agent"),
    ]

    operations = [
        migrations.RenameField(
            model_name="workspace",
            old_name="llm_api_key",
            new_name="llm_api_key_encrypted",
        ),
    ]

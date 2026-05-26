# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0146_project_custom_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="sticky",
            name="tags",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

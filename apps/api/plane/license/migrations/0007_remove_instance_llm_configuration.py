# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations


INSTANCE_LLM_KEYS = ["LLM_API_KEY", "LLM_PROVIDER", "LLM_MODEL", "GPT_ENGINE"]


def remove_instance_llm_configuration(apps, schema_editor):
    InstanceConfiguration = apps.get_model("license", "InstanceConfiguration")
    InstanceConfiguration.objects.filter(key__in=INSTANCE_LLM_KEYS).delete()


class Migration(migrations.Migration):
    dependencies = [("license", "0006_instance_is_current_version_deprecated")]

    operations = [migrations.RunPython(remove_instance_llm_configuration, migrations.RunPython.noop)]

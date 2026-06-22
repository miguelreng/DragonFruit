# Atlas has one fixed identity (name/personality are code-canonical, not
# per-workspace editable). Older workspaces still carry Agent rows and bot
# users created before the naming settled (e.g. "Bot"), which leak into
# @-mention dropdowns and member lists. Canonicalize them all to "Atlas".

from django.db import migrations

CANONICAL_NAME = "Atlas"


def canonicalize_agent_names(apps, schema_editor):
    Agent = apps.get_model("db", "Agent")
    User = apps.get_model("db", "User")

    # Historical models only carry managers flagged use_in_migrations, so the
    # rendered Agent/User models may lack `objects`; `_base_manager` always exists.
    agents = Agent._base_manager.filter(deleted_at__isnull=True).exclude(name=CANONICAL_NAME)
    bot_user_ids = list(agents.values_list("bot_user_id", flat=True))
    agents.update(name=CANONICAL_NAME)

    # Bot users that back agents — keep their display in sync.
    stale_bots = User._base_manager.filter(is_bot=True, bot_type="AGENT").exclude(display_name=CANONICAL_NAME)
    if bot_user_ids:
        stale_bots = stale_bots | User._base_manager.filter(id__in=bot_user_ids).exclude(display_name=CANONICAL_NAME)
    stale_bots.distinct().update(display_name=CANONICAL_NAME, first_name=CANONICAL_NAME)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0153_agent_run_needs_input"),
    ]

    operations = [
        migrations.RunPython(canonicalize_agent_names, migrations.RunPython.noop),
    ]

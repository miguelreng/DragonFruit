# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.db.models import Notification


def is_cursor_buddy_request(request):
    return request.headers.get("X-DragonFruit-Source", "").lower() == "cursor-buddy"


def create_cursor_buddy_notification(request, workspace, resource, resource_type, resource_name, resource_url, project=None):
    Notification.objects.create(
        workspace=workspace,
        project=project,
        data={
            "cursor_buddy": {
                "id": str(resource.id),
                "type": resource_type,
                "name": resource_name,
                "url": resource_url,
            },
            "issue": {
                "id": str(resource.id),
                "sequence_id": None,
                "identifier": "Buddy",
                "name": resource_name,
                "state_name": None,
                "state_group": None,
            },
            "issue_activity": {
                "id": None,
                "actor": str(request.user.id),
                "field": "cursor_buddy_file",
                "issue_comment": None,
                "verb": "created",
                "new_value": resource_name,
                "old_value": "",
            },
        },
        entity_identifier=resource.id,
        entity_name="cursor_buddy_file",
        title=f"Cursor Buddy created {resource_type}",
        message={"resource_type": resource_type, "resource_name": resource_name},
        message_html=f"<p>Cursor Buddy created {resource_name}</p>",
        message_stripped=f"Cursor Buddy created {resource_name}",
        sender="cursor_buddy",
        triggered_by=request.user,
        receiver=request.user,
    )

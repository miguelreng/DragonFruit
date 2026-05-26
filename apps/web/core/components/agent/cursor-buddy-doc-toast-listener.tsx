/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import useSWR from "swr";
import type { TNotification, TNotificationPaginatedInfoQueryParams } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import workspaceNotificationService from "@/services/workspace-notification.service";

type TCursorBuddyResource = NonNullable<TNotification["data"]>["cursor_buddy"];

const QUERY_PARAMS: TNotificationPaginatedInfoQueryParams = {
  per_page: 20,
  cursor: "20:0:0",
  read: false,
};

const isCursorBuddyDocCreatedNotification = (notification: TNotification) => {
  const cursorBuddy = notification?.data?.cursor_buddy;
  const issueActivity = notification?.data?.issue_activity;
  return (
    notification?.entity_name === "cursor_buddy_file" &&
    issueActivity?.field === "cursor_buddy_file" &&
    issueActivity?.verb === "created" &&
    cursorBuddy?.type === "doc" &&
    Boolean(cursorBuddy.url)
  );
};

const openDocAction = (resource: Exclude<TCursorBuddyResource, undefined>) => (
  <a
    href={resource.url}
    className="text-12 font-medium text-accent-primary hover:underline"
    aria-label={`Open ${resource.name}`}
  >
    Open doc
  </a>
);

export function CursorBuddyDocToastListener({ workspaceSlug }: { workspaceSlug?: string }) {
  const hasBootstrapped = useRef(false);
  const shownNotificationIds = useRef<Set<string>>(new Set());
  const mountedAt = useRef<number>(Date.now());

  useEffect(() => {
    // Reset de-duplication when switching workspace so each workspace
    // can independently surface new doc-created events.
    hasBootstrapped.current = false;
    shownNotificationIds.current.clear();
    mountedAt.current = Date.now();
  }, [workspaceSlug]);

  useSWR(
    workspaceSlug ? `CURSOR_BUDDY_DOC_TOAST_${workspaceSlug}` : null,
    workspaceSlug
      ? async () => {
          const response = await workspaceNotificationService.fetchNotifications(workspaceSlug, QUERY_PARAMS);
          const notifications = response?.results ?? [];

          if (!hasBootstrapped.current) {
            notifications.forEach((n) => {
              shownNotificationIds.current.add(n.id);
              const createdAtEpoch = n.created_at ? new Date(n.created_at).getTime() : 0;
              if (createdAtEpoch <= mountedAt.current) return;
              if (!isCursorBuddyDocCreatedNotification(n)) return;
              const resource = n?.data?.cursor_buddy;
              if (!resource?.url) return;
              setToast({
                type: TOAST_TYPE.CURSOR_BUDDY_SUCCESS,
                title: "Doc created",
                message: resource.name,
                actionItems: openDocAction(resource),
              });
            });
            hasBootstrapped.current = true;
            return notifications;
          }

          notifications.forEach((notification) => {
            if (shownNotificationIds.current.has(notification.id)) return;
            shownNotificationIds.current.add(notification.id);
            if (!isCursorBuddyDocCreatedNotification(notification)) return;

            const resource = notification?.data?.cursor_buddy;
            if (!resource?.url) return;

            setToast({
              type: TOAST_TYPE.CURSOR_BUDDY_SUCCESS,
              title: "Doc created",
              message: resource.name,
              actionItems: openDocAction(resource),
            });
          });

          return notifications;
        }
      : null,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );

  return null;
}

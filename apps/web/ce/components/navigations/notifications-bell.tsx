/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { ENotificationLoader, ENotificationQueryParamType } from "@plane/constants";
import { Popover } from "@plane/propel/popover";
import { Tooltip } from "@plane/propel/tooltip";
// icons
import { Bell } from "@/components/icons/lucide-shim";
// components
import { NotificationItem } from "@/components/workspace-notifications/sidebar/notification-card/item";
// hooks
import { useWorkspaceNotifications } from "@/hooks/store/notifications";
import { useTopBarTheme } from "@/hooks/use-top-bar-theme";
import { useWorkspace } from "@/hooks/store/use-workspace";

export const NotificationsBell = observer(function NotificationsBell() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  // top bar theme — panel matches the frame
  const topBarTheme = useTopBarTheme();
  // store hooks
  const { currentWorkspace } = useWorkspace();
  const { unreadNotificationsCount, getNotifications, getUnreadNotificationsCount, notificationIdsByWorkspaceId } =
    useWorkspaceNotifications();

  // unread count for the badge
  useSWR(slug ? "WORKSPACE_UNREAD_NOTIFICATION_COUNT" : null, slug ? () => getUnreadNotificationsCount(slug) : null);

  // notifications list for the panel
  useSWR(
    slug ? `WORKSPACE_NOTIFICATION_${slug}` : null,
    slug ? () => getNotifications(slug, ENotificationLoader.INIT_LOADER, ENotificationQueryParamType.INIT) : null,
    { revalidateOnFocus: false }
  );

  // derived
  const isMentionsEnabled = unreadNotificationsCount.mention_unread_notifications_count > 0;
  const totalUnread = isMentionsEnabled
    ? unreadNotificationsCount.mention_unread_notifications_count
    : unreadNotificationsCount.total_unread_notifications_count;
  const notificationIds = currentWorkspace ? notificationIdsByWorkspaceId(currentWorkspace.id) : undefined;

  return (
    <Popover>
      <Tooltip tooltipContent="Notifications" position="bottom">
        <Popover.Button
          aria-label="Notifications"
          className="group flex flex-col items-center justify-center gap-0.5 text-tertiary outline-none"
        >
          <div className="flex size-8 items-center justify-center gap-2 rounded-md text-icon-tertiary group-hover:bg-layer-transparent-hover group-hover:text-icon-secondary">
            <div className="relative">
              <Bell className="size-5" />
              {totalUnread > 0 && <span className="absolute top-0 right-0 size-2 rounded-full bg-danger-primary" />}
            </div>
          </div>
        </Popover.Button>
      </Tooltip>
      <Popover.Panel
        side="bottom"
        align="end"
        positionerClassName="z-[1000]"
        data-theme={topBarTheme}
        className="shadow-lg w-[380px] overflow-hidden rounded-md border border-subtle bg-surface-1 text-secondary outline-none"
      >
        <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
          <h3 className="text-13 font-semibold text-secondary">Notifications</h3>
          {totalUnread > 0 && <span className="text-11 font-medium text-tertiary">{totalUnread} unread</span>}
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {!notificationIds || notificationIds.length === 0 ? (
            <div className="px-3 py-10 text-center text-12 text-placeholder">You're all caught up.</div>
          ) : (
            <div className="divide-y divide-subtle">
              {notificationIds.map((id) => (
                <NotificationItem key={id} workspaceSlug={slug ?? ""} notificationId={id} />
              ))}
            </div>
          )}
        </div>
      </Popover.Panel>
    </Popover>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { cn } from "@plane/utils";
// plane imports
import { ENotificationLoader, ENotificationQueryParamType } from "@plane/constants";
import { Popover } from "@plane/propel/popover";
import { Spinner } from "@plane/ui";
// icons
import { Bell } from "@solar-icons/react/ssr";
import { CheckCheck } from "@/components/icons/lucide-shim";
// components
import { AppSidebarTooltip } from "@/components/sidebar/sidebar-item";
import { renderSolarSidebarIcon } from "@/components/sidebar/solar-icon";
import { NotificationItem } from "@/components/workspace-notifications/sidebar/notification-card/item";
// hooks
import { useWorkspaceNotifications } from "@/hooks/store/notifications";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useTopBarTheme } from "@/hooks/use-top-bar-theme";

type TNotificationsBellProps = {
  showLabel?: boolean;
  isInline?: boolean;
};

export const NotificationsBell = observer(function NotificationsBell(props: TNotificationsBellProps) {
  const { showLabel = true, isInline = false } = props;
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const surfaceTheme = useTopBarTheme();
  const [isOpen, setIsOpen] = useState(false);
  // store hooks
  const { currentWorkspace } = useWorkspace();
  const {
    loader,
    unreadNotificationsCount,
    getNotifications,
    getUnreadNotificationsCount,
    markAllNotificationsAsRead,
    notificationIdsByWorkspaceId,
  } = useWorkspaceNotifications();

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
  const isMarkingAllAsRead = loader === ENotificationLoader.MARK_ALL_AS_READY;

  const handleMarkAllAsRead = async () => {
    if (!slug || loader) return;

    try {
      await markAllNotificationsAsRead(slug);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <AppSidebarTooltip tooltipContent="Notifications">
        <Popover.Button
          aria-label="Notifications"
          className={cn(
            "text-tertiary transition-colors outline-none dark:text-white/65",
            isInline
              ? "group relative flex w-full cursor-pointer items-center justify-start gap-1.5 rounded-lg px-2 py-1 text-secondary hover:bg-layer-transparent-hover hover:text-primary dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white"
              : "group flex flex-col items-center justify-center gap-0.5",
            isInline && isOpen && "bg-layer-transparent-active text-primary"
          )}
        >
          <div
            className={cn(
              "rounded-lg text-icon-tertiary transition-colors dark:text-white/55 [&_svg]:text-current",
              isInline
                ? "flex size-5 flex-shrink-0 items-center justify-center [&_svg]:size-4"
                : "flex size-8 items-center justify-center gap-2 group-hover:bg-layer-transparent-hover [&_svg]:size-5",
              !isInline && isOpen && "!bg-layer-transparent-active !text-primary"
            )}
          >
            <div className="relative">
              {renderSolarSidebarIcon(Bell, isOpen)}
              {totalUnread > 0 && <span className="absolute top-0 right-0 size-2 rounded-full bg-danger-primary" />}
            </div>
          </div>
          {showLabel && (
            <span
              className={cn(
                "font-medium",
                isInline
                  ? "flex h-5 items-center text-13 leading-5"
                  : "text-11 text-tertiary group-hover:text-secondary dark:text-white/65 dark:group-hover:text-white/90"
              )}
            >
              Notifications
            </span>
          )}
        </Popover.Button>
      </AppSidebarTooltip>
      <Popover.Panel
        side="bottom"
        align="end"
        positionerClassName="z-[1000]"
        data-theme={surfaceTheme}
        className="w-[380px] overflow-hidden rounded-[18px] border-[0.5px] border-strong bg-surface-1 text-secondary shadow-raised-200 outline-none"
      >
        <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
          <h3 className="text-13 font-semibold text-secondary">Notifications</h3>
          {totalUnread > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-11 font-medium text-tertiary">{totalUnread} unread</span>
              <button
                type="button"
                className="flex h-6 items-center gap-1 rounded-lg px-1.5 text-11 font-medium text-accent-primary transition-colors hover:bg-layer-2 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isMarkingAllAsRead}
                onClick={handleMarkAllAsRead}
              >
                {isMarkingAllAsRead ? <Spinner className="size-3" /> : <CheckCheck className="size-3" />}
                <span>Mark all read</span>
              </button>
            </div>
          )}
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

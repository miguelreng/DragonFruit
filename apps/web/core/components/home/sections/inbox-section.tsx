/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ENotificationLoader, ENotificationQueryParamType } from "@plane/constants";
import { Bell } from "@/components/icons/lucide-shim";
import { NotificationItem } from "@/components/workspace-notifications/sidebar/notification-card/item";
import { useWorkspaceNotifications } from "@/hooks/store/notifications";
import { useWorkspace } from "@/hooks/store/use-workspace";

const PREVIEW_COUNT = 5;
const SECTION_ID = "inbox";

export const InboxSection = observer(function InboxSection() {
  const { workspaceSlug } = useParams();
  const { currentWorkspace } = useWorkspace();
  const { getNotifications, notificationIdsByWorkspaceId, unreadNotificationsCount } = useWorkspaceNotifications();
  const sectionRef = useRef<HTMLElement>(null);

  // The home page lives inside a nested scroll container, so the browser's
  // built-in anchor-scroll on hash change doesn't reach it. When the URL hash
  // matches this section, imperatively scroll it into view.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const scrollIfTargeted = () => {
      if (window.location.hash === `#${SECTION_ID}`) {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    scrollIfTargeted();
    window.addEventListener("hashchange", scrollIfTargeted);
    return () => window.removeEventListener("hashchange", scrollIfTargeted);
  }, []);

  const slug = workspaceSlug?.toString();

  useSWR(
    slug ? `HOME_INBOX_NOTIFICATIONS_${slug}` : null,
    slug ? () => getNotifications(slug, ENotificationLoader.INIT_LOADER, ENotificationQueryParamType.INIT) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const notificationIds = currentWorkspace ? notificationIdsByWorkspaceId(currentWorkspace.id) : undefined;
  const previewIds = (notificationIds ?? []).slice(0, PREVIEW_COUNT);
  const unread = unreadNotificationsCount.total_unread_notifications_count;

  return (
    <section ref={sectionRef} id={SECTION_ID} className="flex scroll-mt-4 flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-tertiary" />
          <h3 className="text-14 font-semibold text-secondary">Inbox</h3>
          {unread > 0 && (
            <span className="rounded-full bg-danger-primary px-1.5 py-px text-11 font-medium text-white">{unread}</span>
          )}
        </div>
      </div>
      <div className="rounded-[18px] border border-subtle bg-surface-1">
        {previewIds.length === 0 ? (
          <div className="px-3 py-6 text-center text-12 text-placeholder">You're all caught up.</div>
        ) : (
          <div className="divide-y divide-subtle">
            {previewIds.map((notificationId) => (
              <NotificationItem key={notificationId} workspaceSlug={slug ?? ""} notificationId={notificationId} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Avatar } from "@plane/propel/avatar";
import { calculateTimeAgo, getFileURL } from "@plane/utils";
import { ActivityMessage, IssueLink } from "@/components/core/activity";
import { Activity } from "@/components/icons/lucide-shim";
import { useUser } from "@/hooks/store/user";
import { UserService } from "@/services/user.service";

const PREVIEW_COUNT = 8;
const userService = new UserService();

export const RecentActivitySection = observer(function RecentActivitySection() {
  const { workspaceSlug } = useParams();
  const { data: currentUser } = useUser();

  const slug = workspaceSlug?.toString();
  const userId = currentUser?.id;

  const { data } = useSWR(
    slug && userId ? `HOME_RECENT_ACTIVITY_${slug}_${userId}` : null,
    slug && userId ? () => userService.getUserProfileActivity(slug, userId, { per_page: PREVIEW_COUNT }) : null,
    { revalidateOnFocus: false }
  );

  const activities = data?.results ?? [];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-tertiary" />
          <h3 className="text-14 font-semibold text-secondary">Recent activity</h3>
        </div>
      </div>
      <div>
        {data === undefined ? (
          <div className="px-2 py-6 text-center text-12 text-placeholder">Loading…</div>
        ) : activities.length === 0 ? (
          <div className="px-2 py-6 text-center text-12 text-placeholder">No recent activity.</div>
        ) : (
          <ul className="flex flex-col">
            {activities.map((activity) => (
              <li key={activity.id} className="flex items-start gap-3 rounded-lg px-2 py-2.5">
                <Avatar
                  name={activity.actor_detail?.display_name}
                  src={getFileURL(activity.actor_detail?.avatar_url)}
                  size="base"
                  shape="square"
                />
                <div className="min-w-0 flex-1 break-words">
                  <p className="text-13 leading-snug text-secondary">
                    <span className="font-medium text-primary">
                      {currentUser?.id === activity.actor_detail?.id ? "You" : activity.actor_detail?.display_name}{" "}
                    </span>
                    {activity.field ? (
                      <ActivityMessage activity={activity} showIssue />
                    ) : (
                      <span>
                        created <IssueLink activity={activity} />
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-11 text-tertiary">{calculateTimeAgo(activity.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
});

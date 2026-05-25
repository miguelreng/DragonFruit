/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// ui
import { useTranslation } from "@plane/i18n";
import { Avatar } from "@plane/propel/avatar";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { Loader } from "@plane/ui";
import { calculateTimeAgo, getFileURL } from "@plane/utils";
// components
import { ActivityMessage, IssueLink } from "@/components/core/activity";
// constants
import { USER_PROFILE_ACTIVITY } from "@/constants/fetch-keys";
// hooks
import { useUser } from "@/hooks/store/user";
// services
import { UserService } from "@/services/user.service";

const userService = new UserService();

export const ProfileActivity = observer(function ProfileActivity() {
  const { workspaceSlug, userId } = useParams();
  const { data: currentUser } = useUser();
  const { t } = useTranslation();

  const { data: userProfileActivity } = useSWR(
    workspaceSlug && userId ? USER_PROFILE_ACTIVITY(workspaceSlug.toString(), userId.toString(), {}) : null,
    workspaceSlug && userId
      ? () =>
          userService.getUserProfileActivity(workspaceSlug.toString(), userId.toString(), {
            per_page: 10,
          })
      : null
  );

  return (
    <section className="space-y-3">
      <h3 className="text-13 font-medium text-tertiary">{t("profile.stats.recent_activity.title")}</h3>
      <div className="rounded-lg border-[0.5px] border-subtle bg-surface-1">
        {userProfileActivity ? (
          userProfileActivity.results.length > 0 ? (
            <ul className="divide-y divide-subtle">
              {userProfileActivity.results.map((activity) => (
                <li key={activity.id} className="flex items-start gap-3 px-5 py-3.5">
                  <Avatar
                    name={activity.actor_detail?.display_name}
                    src={getFileURL(activity.actor_detail?.avatar_url)}
                    size="base"
                    shape="square"
                  />
                  <div className="min-w-0 flex-1 break-words">
                    <p className="text-13 leading-snug text-secondary">
                      <span className="font-medium text-primary">
                        {currentUser?.id === activity.actor_detail?.id
                          ? "You"
                          : activity.actor_detail?.display_name}{" "}
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
          ) : (
            <div className="p-6">
              <EmptyStateCompact title={t("no_data_yet")} assetKey="work-item" assetClassName="size-20" />
            </div>
          )
        ) : (
          <Loader className="space-y-3 p-5">
            <Loader.Item height="40px" />
            <Loader.Item height="40px" />
            <Loader.Item height="40px" />
            <Loader.Item height="40px" />
            <Loader.Item height="40px" />
          </Loader>
        )}
      </div>
    </section>
  );
});

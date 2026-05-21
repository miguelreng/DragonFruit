/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { useTranslation } from "@plane/i18n";
import { BarChart } from "@plane/propel/charts/bar-chart";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import type { IUserProfileData } from "@plane/types";
import { Loader } from "@plane/ui";
import { capitalizeFirstLetter } from "@plane/utils";

type Props = {
  userProfile: IUserProfileData | undefined;
};

const priorityColors = {
  urgent: "#991b1b",
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#16a34a",
  none: "#e5e5e5",
};

export function ProfilePriorityDistribution({ userProfile }: Props) {
  const { t } = useTranslation();
  const hasData = (userProfile?.priority_distribution?.length ?? 0) > 0;

  return (
    <section className="flex flex-col space-y-3">
      <h3 className="text-13 font-medium text-tertiary">{t("profile.stats.priority_distribution.title")}</h3>
      <div className="flex h-full flex-col rounded-lg border-[0.5px] border-subtle bg-surface-1 p-5">
        {userProfile ? (
          hasData ? (
            <BarChart
              className="h-[280px] w-full"
              margin={{ top: 16, right: 16, bottom: 4, left: 0 }}
              data={userProfile.priority_distribution.map((priority) => ({
                key: priority.priority ?? "None",
                name: capitalizeFirstLetter(priority.priority ?? "None"),
                count: priority.priority_count,
              }))}
              bars={[
                {
                  key: "count",
                  label: "Count",
                  stackId: "bar-one",
                  fill: (payload: any) => priorityColors[payload.key as keyof typeof priorityColors], // TODO: fix types
                  textClassName: "",
                  showPercentage: false,
                  showTopBorderRadius: () => true,
                  showBottomBorderRadius: () => true,
                },
              ]}
              xAxis={{
                key: "name",
                label: t("common.priority"),
              }}
              yAxis={{
                key: "count",
                label: "",
              }}
              barSize={24}
            />
          ) : (
            <EmptyStateCompact
              assetKey="priority"
              assetClassName="size-20"
              title={t("workspace_empty_state.your_work_by_priority.title")}
            />
          )
        ) : (
          <div className="grid h-[280px] place-items-center">
            <Loader className="flex items-end gap-8">
              <Loader.Item width="24px" height="180px" />
              <Loader.Item width="24px" height="140px" />
              <Loader.Item width="24px" height="220px" />
              <Loader.Item width="24px" height="140px" />
              <Loader.Item width="24px" height="90px" />
            </Loader>
          </div>
        )}
      </div>
    </section>
  );
}

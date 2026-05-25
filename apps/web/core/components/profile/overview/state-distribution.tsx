/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { PieChart } from "@plane/propel/charts/pie-chart";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import type { IUserProfileData, IUserStateDistribution } from "@plane/types";
import { capitalizeFirstLetter } from "@plane/utils";

type Props = {
  stateDistribution: IUserStateDistribution[];
  userProfile: IUserProfileData | undefined;
};

export function ProfileStateDistribution({ stateDistribution, userProfile }: Props) {
  const { t } = useTranslation();
  if (!userProfile) return null;

  const hasData = userProfile.state_distribution.length > 0;
  const total = stateDistribution.reduce((acc, group) => acc + group.state_count, 0);

  return (
    <section className="flex flex-col space-y-3">
      <h3 className="text-13 font-medium text-tertiary">{t("profile.stats.state_distribution.title")}</h3>
      <div className="flex h-full flex-col rounded-lg border-[0.5px] border-subtle bg-surface-2 p-5">
        {hasData ? (
          <div className="grid h-[280px] w-full grid-cols-1 items-center gap-6 md:grid-cols-[1fr_1fr]">
            <PieChart
              className="size-full"
              dataKey="value"
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              data={
                userProfile.state_distribution.map((group) => ({
                  id: group.state_group,
                  key: group.state_group,
                  value: group.state_count,
                  name: capitalizeFirstLetter(group.state_group),
                  color: STATE_GROUPS[group.state_group]?.color,
                })) ?? []
              }
              cells={userProfile.state_distribution.map((group) => ({
                key: group.state_group,
                fill: STATE_GROUPS[group.state_group]?.color,
              }))}
              showTooltip
              tooltipLabel="Count"
              paddingAngle={4}
              cornerRadius={4}
              innerRadius="60%"
              showLabel={false}
            />
            <div className="flex flex-col gap-3">
              {stateDistribution.map((group) => {
                const percentage = total > 0 ? Math.round((group.state_count / total) * 100) : 0;
                return (
                  <div key={group.state_group} className="flex items-center justify-between gap-3 text-13">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            STATE_GROUPS[group.state_group]?.color ?? "var(--background-color-accent-primary)",
                        }}
                        aria-hidden
                      />
                      <span className="truncate text-secondary">{STATE_GROUPS[group.state_group].label}</span>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="text-11 text-tertiary">{percentage}%</span>
                      <span className="min-w-[1.5ch] text-right font-medium">{group.state_count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyStateCompact
            assetKey="priority"
            assetClassName="size-20"
            title={t("workspace_empty_state.your_work_by_priority.title")}
          />
        )}
      </div>
    </section>
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IUserStateDistribution } from "@plane/types";

type Props = {
  stateDistribution: IUserStateDistribution[];
};

const STATE_LABEL_OVERRIDES: Record<string, string> = {
  unstarted: "Not started",
  started: "Working on",
};

export function ProfileWorkload({ stateDistribution }: Props) {
  const { t } = useTranslation();

  return (
    <section className="space-y-3">
      <h3 className="text-13 font-medium text-tertiary">{t("profile.stats.workload")}</h3>
      <div className="bg-subtle grid grid-cols-1 gap-px overflow-hidden rounded-lg border-[0.5px] border-subtle sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {stateDistribution.map((group) => {
          const color = STATE_GROUPS[group.state_group]?.color;
          const label = STATE_LABEL_OVERRIDES[group.state_group] ?? STATE_GROUPS[group.state_group]?.label;
          return (
            <div key={group.state_group} className="flex flex-col gap-2 bg-surface-1 px-5 py-4">
              <div className="flex items-center gap-2 text-13 text-tertiary">
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                <span className="truncate">{label}</span>
              </div>
              <p className="text-24 font-semibold tabular-nums">{group.state_count}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

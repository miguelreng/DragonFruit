/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
// ui
import { useTranslation } from "@plane/i18n";
import { UserCirclePropertyIcon, CreateIcon, LayerStackIcon } from "@plane/propel/icons";
import type { IUserProfileData } from "@plane/types";
import { Loader } from "@plane/ui";

type Props = {
  userProfile: IUserProfileData | undefined;
};

export function ProfileStats({ userProfile }: Props) {
  const { workspaceSlug, userId } = useParams();
  const { t } = useTranslation();

  const overviewCards = [
    {
      icon: CreateIcon,
      route: "created",
      i18n_title: "profile.stats.created",
      value: userProfile?.created_issues ?? 0,
    },
    {
      icon: UserCirclePropertyIcon,
      route: "assigned",
      i18n_title: "profile.stats.assigned",
      value: userProfile?.assigned_issues ?? 0,
    },
    {
      icon: LayerStackIcon,
      route: "subscribed",
      i18n_title: "profile.stats.subscribed",
      value: userProfile?.subscribed_issues ?? 0,
    },
  ];

  return (
    <section className="space-y-3">
      <h3 className="text-13 font-medium text-tertiary">{t("profile.stats.overview")}</h3>
      {userProfile ? (
        <div className="bg-subtle grid grid-cols-1 gap-px overflow-hidden rounded-lg border-[0.5px] border-subtle md:grid-cols-3">
          {overviewCards.map((card) => (
            <Link
              key={card.route}
              href={`/${workspaceSlug}/profile/${userId}/${card.route}`}
              className="group flex items-center gap-4 bg-surface-2 px-5 py-4 transition-colors hover:bg-layer-1"
            >
              <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-md bg-layer-1 text-tertiary transition-colors group-hover:bg-layer-1-hover group-hover:text-secondary">
                <card.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-13 text-tertiary">{t(card.i18n_title)}</p>
                <p className="mt-0.5 text-24 font-semibold tabular-nums">{card.value}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Loader className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Loader.Item height="72px" />
          <Loader.Item height="72px" />
          <Loader.Item height="72px" />
        </Loader>
      )}
    </section>
  );
}

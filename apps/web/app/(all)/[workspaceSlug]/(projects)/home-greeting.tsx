/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUser } from "@plane/types";
// hooks
import { useCurrentTime } from "@/hooks/use-current-time";
// assets
import dragonMark from "@/app/assets/branding/dragon.svg?url";

interface Props {
  user: IUser;
}

export function HomeGreeting({ user }: Props) {
  const { currentTime } = useCurrentTime();

  const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(currentTime);
  const weekDay = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(currentTime);
  const name = user.first_name?.trim() || user.display_name?.trim() || "there";

  return (
    <header className="flex flex-col items-start gap-3">
      <img src={dragonMark} alt="" aria-hidden className="h-12 w-auto" />
      <div className="min-w-0">
        <h1 className="font-serif text-22 font-normal text-primary">Welcome back, {name}</h1>
        <p className="mt-1 text-13 text-tertiary">
          {weekDay}, {date}
        </p>
      </div>
    </header>
  );
}

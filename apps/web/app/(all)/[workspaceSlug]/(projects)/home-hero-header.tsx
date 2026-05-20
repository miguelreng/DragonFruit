/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUser } from "@plane/types";
// hooks
import { useCurrentTime } from "@/hooks/use-current-time";
// Hero backgrounds — three Renaissance paintings, one per time of day. Public domain,
// sourced from Wikimedia Commons. Swap any import (or the file at the imported path)
// to change the image for that time slot.
// Morning  → Caravaggio, "The Calling of Saint Matthew" (1599–1600) — shaft of dawn light
// Afternoon → Raphael, "The School of Athens" (1509–1511) — broad daylight
// Evening   → Elsheimer, "The Flight into Egypt" (1609) — nocturne with starlit Milky Way
import heroBgMorning from "@/app/assets/home/calling-of-saint-matthew.jpg?url";
import heroBgAfternoon from "@/app/assets/home/school-of-athens.jpg?url";
import heroBgEvening from "@/app/assets/home/flight-into-egypt.jpg?url";

interface Props {
  user: IUser;
}

export function HomeHeroHeader({ user }: Props) {
  const { currentTime } = useCurrentTime();

  const hour = new Intl.DateTimeFormat("en-US", {
    hour12: false,
    hour: "numeric",
  }).format(currentTime);

  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(currentTime);

  const weekDay = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(currentTime);

  const timeString = new Intl.DateTimeFormat("en-US", {
    timeZone: user?.user_timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).format(currentTime);

  const greeting = parseInt(hour, 10) < 12 ? "morning" : parseInt(hour, 10) < 18 ? "afternoon" : "evening";
  const emoji = greeting === "morning" ? "🌤️" : greeting === "afternoon" ? "🌥️" : "🌙️";
  const heroBg = greeting === "morning" ? heroBgMorning : greeting === "afternoon" ? heroBgAfternoon : heroBgEvening;

  return (
    <div
      className="relative flex w-full shrink-0 items-center overflow-hidden"
      style={{ height: 250 }}
    >
      {/* Background image — replaceable */}
      <div aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroBg})` }} />
      {/* Backdrop — full-cover dark tint for text legibility */}
      <div aria-hidden className="absolute inset-0 bg-black/40" />
      {/* Greeting */}
      <div className="relative z-10 flex w-full flex-col items-center px-page-x text-center">
        <h2 className="text-22 font-semibold text-white drop-shadow-sm">
          Good {greeting}, {user.first_name} {user.last_name}
        </h2>
        <p className="mt-1 flex items-center gap-2 text-13 font-medium text-white/85 drop-shadow-sm">
          <span>{emoji}</span>
          <span>
            {weekDay}, {date} {timeString}
          </span>
        </p>
      </div>
    </div>
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect } from "react";
import { useTheme } from "next-themes";
import { AuthRoot } from "@/components/account/auth-forms/auth-root";
import { EAuthModes } from "@/helpers/authentication.helper";
import { useCurrentTime } from "@/hooks/use-current-time";
// Renaissance paintings — same set as the workspace home hero, keyed by time of day.
// Public domain via Wikimedia Commons.
import heroBgMorning from "@/app/assets/home/calling-of-saint-matthew.jpg?url";
import heroBgAfternoon from "@/app/assets/home/school-of-athens.jpg?url";
import heroBgEvening from "@/app/assets/home/flight-into-egypt.jpg?url";
import { AuthHeader } from "./header";

type AuthBaseProps = {
  authType: EAuthModes;
};

const HERO_MORNING = {
  src: heroBgMorning,
  title: "The Calling of Saint Matthew",
  year: "1599–1600",
  artist: "Caravaggio",
};
const HERO_AFTERNOON = {
  src: heroBgAfternoon,
  title: "The School of Athens",
  year: "1509–1511",
  artist: "Raphael",
};
const HERO_EVENING = {
  src: heroBgEvening,
  title: "The Flight into Egypt",
  year: "1609",
  artist: "Adam Elsheimer",
};

export function AuthBase({ authType }: AuthBaseProps) {
  // Auth screens are always presented in light mode — the form is designed
  // against the painting backdrop and dark mode breaks the contrast.
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme("light");
  }, [setTheme]);

  const { currentTime } = useCurrentTime();
  const hour = parseInt(new Intl.DateTimeFormat("en-US", { hour12: false, hour: "numeric" }).format(currentTime), 10);
  // Sign-in and sign-up use offset rotations so the two screens always show
  // a different painting at the same hour.
  const rotation =
    authType === EAuthModes.SIGN_UP
      ? [HERO_AFTERNOON, HERO_EVENING, HERO_MORNING]
      : [HERO_MORNING, HERO_AFTERNOON, HERO_EVENING];
  const hero = hour < 12 ? rotation[0] : hour < 18 ? rotation[1] : rotation[2];

  return (
    <div className="relative z-10 flex h-screen w-screen overflow-hidden">
      <div className="flex w-full flex-col overflow-y-auto px-8 pt-6 pb-10 lg:w-1/2 lg:px-12">
        <AuthHeader type={authType} />
        <div className="flex flex-1 items-center justify-center">
          <AuthRoot authMode={authType} />
        </div>
      </div>
      <div className="hidden p-3 lg:block lg:w-1/2">
        <div
          className="relative h-full w-full overflow-hidden rounded-[18px]"
          style={{
            backgroundImage: `url(${hero.src})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-tr from-black/30 via-transparent to-transparent"
          />
          <p className="font-normal absolute right-4 bottom-4 text-12 leading-tight text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
            <span className="font-normal italic">{hero.title}</span>, {hero.year} — {hero.artist}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
// assets
//
// Three backdrops, one per loading "intent". All public domain via Wikimedia Commons.
// cold-boot → Bosch, "The Garden of Earthly Delights" (c. 1490–1510)
// login     → Velázquez, "Las Meninas" (1656) — stepping into the workspace
// logout    → Rembrandt, "Return of the Prodigal Son" (c. 1668) — closing the chapter
import GardenBg from "@/app/assets/loading/garden-of-earthly-delights.jpg?url";
import MeninasBg from "@/app/assets/loading/las-meninas.jpg?url";
import ProdigalBg from "@/app/assets/loading/return-of-the-prodigal-son.jpg?url";
import LogoBlack from "@/app/assets/plane-logos/logo-black.svg?url";

// SessionStorage key written by login/logout handlers just before the page-navigating
// form submit; cleared by the loading screen on first read so a subsequent refresh
// falls back to the cold-boot painting.
const LOADING_INTENT_KEY = "df-loading-intent";

type LoadingIntent = "login" | "logout" | "cold-boot";

const INTENTS: Record<LoadingIntent, { src: string; title: string; meta: string }> = {
  "cold-boot": {
    src: GardenBg,
    title: "The Garden of Earthly Delights",
    meta: "Hieronymus Bosch · c. 1490–1510",
  },
  login: {
    src: MeninasBg,
    title: "Las Meninas",
    meta: "Diego Velázquez · 1656",
  },
  logout: {
    src: ProdigalBg,
    title: "Return of the Prodigal Son",
    meta: "Rembrandt van Rijn · c. 1668",
  },
};

// Cached at module scope so the value survives the loading screen unmounting and
// remounting as boot hands off between wrappers — without this, the second instance
// would read empty storage and revert to cold-boot mid-flow.
let cachedIntent: LoadingIntent | undefined;

function resolveIntent(): LoadingIntent {
  if (cachedIntent !== undefined) return cachedIntent;
  if (typeof window === "undefined") return "cold-boot";
  const raw = window.sessionStorage.getItem(LOADING_INTENT_KEY);
  window.sessionStorage.removeItem(LOADING_INTENT_KEY);
  cachedIntent = raw === "login" || raw === "logout" ? raw : "cold-boot";
  return cachedIntent;
}

// Module-level guard so the fade-in only plays the first time this screen appears
// in a page load. The screen is re-rendered as boot hands off between wrappers
// (HydrateFallback → InstanceWrapper → AuthenticationWrapper) — without this,
// each remount restarts the CSS keyframes and the animation visibly replays.
let lastUnmountAt = 0;
const REPLAY_GAP_MS = 4000;

// Morphing-infinity loader — the same "Thinking…" animation Atlas uses in the
// chat sidebar (web + mac app). One SVG path morphs circle → infinity → circle
// on a 5s loop, animated via SMIL so it needs no motion library. The three
// keyframe paths share an identical command structure (M + 4×C + Z) so `d`
// interpolates smoothly.
const MI_CIRCLE_A =
  "M 12 8 C 14.21 8 16 9.79 16 12 C 16 14.21 14.21 16 12 16 C 9.79 16 8 14.21 8 12 C 8 9.79 9.79 8 12 8 Z";
const MI_INFINITY =
  "M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z";
const MI_CIRCLE_B =
  "M 12 16 C 14.21 16 16 14.21 16 12 C 16 9.79 14.21 8 12 8 C 9.79 8 8 9.79 8 12 C 8 14.21 9.79 16 12 16 Z";

function CardSpinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="status"
      aria-label="Loading"
      className="size-12"
      style={{ color: "#3F3F3F" }}
    >
      <path d={MI_CIRCLE_A}>
        <animate
          attributeName="d"
          dur="5s"
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0;0.25;0.5;0.75;1"
          keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
          values={`${MI_CIRCLE_A};${MI_INFINITY};${MI_CIRCLE_B};${MI_INFINITY};${MI_CIRCLE_A}`}
        />
      </path>
    </svg>
  );
}

export function AppLoadingScreen() {
  // capture once at mount: if a previous instance just unmounted, skip the entrance animation
  const [skipAnim, setSkipAnim] = useState(false);
  // Intent depends on sessionStorage which doesn't exist during SSR, so the first
  // client render must match the server (always "cold-boot"). We resolve the real
  // intent in an effect — a brief swap is invisible inside the fade-in animation.
  const [intent, setIntent] = useState<LoadingIntent>("cold-boot");
  const painting = INTENTS[intent];

  useEffect(() => {
    setSkipAnim(lastUnmountAt !== 0 && Date.now() - lastUnmountAt < REPLAY_GAP_MS);
    const resolved = resolveIntent();
    if (resolved !== intent) setIntent(resolved);
    return () => {
      lastUnmountAt = Date.now();
    };
    // Intentionally run once on mount; intent is module-cached so re-runs are idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={"relative h-screen w-full overflow-hidden bg-black" + (skipAnim ? "" : "df-loading-anim")}>
      <style>{`
        @keyframes dfLoadingBgIn {
          0%   { opacity: 0; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes dfLoadingCardIn {
          0%   { opacity: 0; transform: translateY(8px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .df-loading-anim .df-loading-bg     { animation: dfLoadingBgIn   900ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .df-loading-anim .df-loading-veil   { animation: dfLoadingBgIn   900ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .df-loading-anim .df-loading-card   { animation: dfLoadingCardIn 700ms cubic-bezier(0.22, 1, 0.36, 1) 350ms both; }
        .df-loading-anim .df-loading-legend { animation: dfLoadingCardIn 700ms cubic-bezier(0.22, 1, 0.36, 1) 600ms both; }
      `}</style>

      {/* Backdrop image — picked per loading intent */}
      <img
        src={painting.src}
        alt=""
        aria-hidden
        className="df-loading-bg absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* Flat black 30% overlay sitting on top of the painting */}
      <div className="df-loading-veil absolute inset-0" style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }} />

      {/* Bottom-up gradient so the museum plaque reads cleanly */}
      <div
        className="df-loading-veil pointer-events-none absolute inset-x-0 bottom-0 h-56"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.45) 45%, rgba(0, 0, 0, 0) 100%)",
        }}
      />

      {/* Card */}
      <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
        <div
          className="df-loading-card flex w-72 flex-col items-center gap-5 rounded-lg bg-white px-10 py-9 text-center shadow-[0_30px_90px_-20px_rgba(0,0,0,0.65),0_2px_0_rgba(255,255,255,0.75)_inset]"
          style={{
            border: "1px solid rgba(17, 24, 39, 0.12)",
          }}
        >
          <img src={LogoBlack} alt="DragonFruit" className="h-8 w-auto opacity-80" draggable={false} />
          <CardSpinner />
        </div>
      </div>

      {/* Museum-plaque legend, bottom center */}
      <div
        className="df-loading-legend font-normal pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-center leading-snug"
        style={{ color: "rgba(246, 239, 221, 0.88)" }}
      >
        <div className="font-normal text-[14px]">{painting.title}</div>
        <div className="mt-0.5 text-[14px]" style={{ opacity: 0.8 }}>
          {painting.meta}
        </div>
      </div>
    </div>
  );
}

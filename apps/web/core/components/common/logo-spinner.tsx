/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTheme } from "next-themes";

/**
 * Loading spinner — the same morphing-infinity "Thinking…" animation Atlas uses
 * in the chat sidebar (web + mac app). One SVG path morphs circle → infinity →
 * circle on a quick loop, animated via SMIL so it needs no motion library. The three
 * keyframe paths share an identical command structure (M + 4×C + Z) so `d`
 * interpolates smoothly.
 *
 * Light mode renders in brand magenta, dark mode in white.
 */
const MI_CIRCLE_A =
  "M 12 8 C 14.21 8 16 9.79 16 12 C 16 14.21 14.21 16 12 16 C 9.79 16 8 14.21 8 12 C 8 9.79 9.79 8 12 8 Z";
const MI_INFINITY =
  "M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z";
const MI_CIRCLE_B =
  "M 12 16 C 14.21 16 16 14.21 16 12 C 16 9.79 14.21 8 12 8 C 9.79 8 8 9.79 8 12 C 8 14.21 9.79 16 12 16 Z";

export function LogoSpinner() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

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
      className="size-14"
      style={{ color: isDark ? "#FFFFFF" : "#8A0052" }}
    >
      <path d={MI_CIRCLE_A}>
        <animate
          attributeName="d"
          dur="1.8s"
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

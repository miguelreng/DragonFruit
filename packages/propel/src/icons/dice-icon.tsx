/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Gamepad } from "@solar-icons/react/ssr";

import type { ISvgIcons } from "./type";

export function DiceIcon({ color, width, height, ...rest }: ISvgIcons) {
  const size = (width ?? height) as number | string | undefined;

  return <Gamepad {...rest} color={(color as string) ?? "currentColor"} size={size ?? "1em"} />;
}

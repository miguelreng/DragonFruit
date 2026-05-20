/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import type { ISvgIcons } from "./type";

/**
 * Wraps a HugeIcons icon definition as a component that accepts the same
 * prop surface our propel icons used (className, color, width, height, etc.),
 * so call-sites importing `{ CloseIcon } from "@plane/propel/icons"` keep
 * working unchanged after the swap from custom SVG → HugeIcons stroke-rounded.
 */
export function hugeIcon(icon: IconSvgElement) {
  return function HugeIconShim({ color, width, height, ...rest }: ISvgIcons) {
    const size = (width ?? height) as number | string | undefined;
    return (
      <HugeiconsIcon
        icon={icon}
        color={(color as string) ?? "currentColor"}
        strokeWidth={1.5}
        size={size ?? "1em"}
        {...rest}
      />
    );
  };
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
// plane utils — pre-baked unicode braille spinners (see packages/utils/src/unicode-spinners.ts)
import { UNICODE_SPINNERS, type UnicodeSpinnerName } from "@plane/utils";

const SPINNER_NAME: UnicodeSpinnerName = "helix";

export function LogoSpinner() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { frames, interval } = UNICODE_SPINNERS[SPINNER_NAME];
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % frames.length), interval);
    return () => window.clearInterval(id);
  }, [frames.length, interval]);

  return (
    <div
      role="status"
      aria-label="Loading"
      className="font-mono flex items-center justify-center leading-none whitespace-pre select-none"
      style={{ color: isDark ? "#FFFFFF" : "#8A0052", fontSize: "2.25rem" }}
    >
      {frames[i]}
    </div>
  );
}

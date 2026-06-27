/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@plane/utils";

type CollapseProps = {
  /** Whether the content is shown. */
  open: boolean;
  children: ReactNode;
  /** Extra classes on the outer grid wrapper. */
  className?: string;
};

/**
 * Controlled height-accordion for inline content — the app's standard open/close motion
 * (220ms ease-in-out, matching the tab band). Uses the CSS grid-rows `0fr ↔ 1fr` trick plus a
 * fade, so it animates height without measuring. Overflow only opens up once fully expanded so
 * nested menus/popovers aren't clipped, and it never animates on first paint.
 *
 * Bring your own header/trigger and pass the resulting boolean as `open` — this renders content
 * only (unlike `@plane/ui`'s `Collapsible`, which owns its title button).
 */
export function Collapse({ open, children, className }: CollapseProps) {
  const [animating, setAnimating] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setAnimating(true);
  }, [open]);

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-[220ms] ease-in-out motion-reduce:transition-none",
        className
      )}
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      onTransitionEnd={() => setAnimating(false)}
    >
      <div
        className={cn(
          "min-h-0 transition-opacity duration-[220ms] ease-in-out motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
          open && !animating ? "overflow-visible" : "overflow-hidden"
        )}
      >
        {children}
      </div>
    </div>
  );
}

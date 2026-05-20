/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";

/**
 * Holds a loader visible for at least `minMs` after mount, but only when we were
 * actually loading at mount time. Lets the loading screen's painting + entrance
 * animation be seen even if data resolves in a few hundred ms — without inserting
 * any delay on re-renders where data is already cached.
 */
export function useMinimumLoaderDuration(isLoading: boolean, minMs = 2000): boolean {
  const [mountedLoading] = useState(isLoading);
  const [held, setHeld] = useState(mountedLoading);

  useEffect(() => {
    if (!mountedLoading) return;
    const id = window.setTimeout(() => setHeld(false), minMs);
    return () => window.clearTimeout(id);
  }, [mountedLoading, minMs]);

  return isLoading || held;
}

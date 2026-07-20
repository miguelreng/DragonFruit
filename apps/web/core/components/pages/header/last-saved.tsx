/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { calculateTimeAgoShort } from "@plane/utils";
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
};

// "Last saved 2m ago" indicator for the page topbar. Saves made in this session
// (page.lastSavedAt, stamped by updateDescription) win over the server timestamp
// the page loaded with.
export const PageLastSaved = observer(function PageLastSaved({ page }: Props) {
  // Re-render on an interval so the relative label stays current while idle.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const savedAt = page.lastSavedAt ?? page.updated_at;
  if (!savedAt) return null;
  const justNow = Date.now() - new Date(savedAt).getTime() < 60_000;
  const label = justNow ? "Last saved just now" : `Last saved ${calculateTimeAgoShort(savedAt)} ago`;
  return (
    <span className="hidden shrink-0 whitespace-nowrap px-1 text-11 text-tertiary sm:block" title={label}>
      {label}
    </span>
  );
});

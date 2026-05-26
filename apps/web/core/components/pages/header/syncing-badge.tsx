/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useEffect, useRef } from "react";
import { CloudOff, Dot } from "@/components/icons/lucide-shim";
import { Tooltip } from "@plane/propel/tooltip";
import { Badge } from "@plane/propel/badge";

type Props = {
  syncStatus: "syncing" | "synced" | "error";
};

export function PageSyncingBadge({ syncStatus }: Props) {
  const prevSyncStatusRef = useRef<"syncing" | "synced" | "error" | null>(null);
  const [isVisible, setIsVisible] = useState(syncStatus !== "synced");

  useEffect(() => {
    let hideBadgeTimer: ReturnType<typeof setTimeout> | undefined;

    // Only handle transitions when there's a change
    if (prevSyncStatusRef.current !== syncStatus) {
      if (syncStatus === "synced") {
        // Delay hiding to allow exit animation to complete
        hideBadgeTimer = setTimeout(() => {
          setIsVisible(false);
        }, 300); // match animation duration
      } else {
        setIsVisible(true);
      }
      prevSyncStatusRef.current = syncStatus;
    }

    return () => {
      if (hideBadgeTimer) clearTimeout(hideBadgeTimer);
    };
  }, [syncStatus]);

  if (!isVisible || syncStatus === "synced") return null;

  const badgeContent = {
    syncing: {
      label: "Syncing...",
      tooltipHeading: "Syncing...",
      tooltipContent: "Your changes are being synced with the server. You can continue making changes.",
    },
    error: {
      label: "Connection lost",
      tooltipHeading: "Connection lost",
      tooltipContent:
        "We're having trouble connecting to the websocket server. Your changes will be synced and saved every 10 seconds.",
    },
  };

  // This way we guarantee badgeContent is defined
  const content = badgeContent[syncStatus];

  return (
    <Tooltip tooltipHeading={content.tooltipHeading} tooltipContent={content.tooltipContent}>
      <span className="animate-quickFadeIn">
        <Badge
          variant={syncStatus === "syncing" ? "brand" : "danger"}
          size="lg"
          prependIcon={syncStatus === "syncing" ? <Dot /> : <CloudOff />}
        >
          {content.label}
        </Badge>
      </span>
    </Tooltip>
  );
}

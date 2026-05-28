/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import {
  AlertCircleIcon,
  ArrowDown02Icon,
  ArrowRight02Icon,
  ArrowUp02Icon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "../utils";

export type TIssuePriorities = "urgent" | "high" | "medium" | "low" | "none";

interface IPriorityIcon {
  className?: string;
  containerClassName?: string;
  priority: TIssuePriorities | undefined | null;
  size?: number;
  withContainer?: boolean;
}

export function PriorityIcon(props: IPriorityIcon) {
  const { priority, className = "", containerClassName = "", size = 14, withContainer = false } = props;
  const resolvedPriority = priority ?? "none";

  const priorityClasses = {
    urgent:
      "border border-[color-mix(in_srgb,var(--priority-urgent)_42%,white)] bg-[color-mix(in_srgb,var(--priority-urgent)_30%,var(--bg-layer-2))] text-[color-mix(in_srgb,var(--priority-urgent)_98%,black)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
    high: "border border-[color-mix(in_srgb,var(--priority-high)_38%,white)] bg-[color-mix(in_srgb,var(--priority-high)_28%,var(--bg-layer-2))] text-[color-mix(in_srgb,var(--priority-high)_96%,black)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
    medium:
      "border border-[color-mix(in_srgb,var(--priority-medium)_38%,white)] bg-[color-mix(in_srgb,var(--priority-medium)_30%,var(--bg-layer-2))] text-[color-mix(in_srgb,var(--priority-medium)_95%,black)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
    low: "border border-[color-mix(in_srgb,var(--priority-low)_38%,white)] bg-[color-mix(in_srgb,var(--priority-low)_28%,var(--bg-layer-2))] text-[color-mix(in_srgb,var(--priority-low)_96%,black)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
    none: "border border-subtle bg-layer-3 text-placeholder",
  };

  // get priority icon
  const icons: Record<TIssuePriorities, IconSvgElement> = {
    urgent: AlertCircleIcon,
    high: ArrowUp02Icon,
    medium: ArrowRight02Icon,
    low: ArrowDown02Icon,
    none: MinusSignIcon,
  };
  const Icon = icons[resolvedPriority];

  if (!Icon) return null;

  return (
    <>
      {withContainer ? (
        <div
          className={cn(
            "flex size-5 flex-shrink-0 items-center justify-center rounded-lg",
            priorityClasses[resolvedPriority],
            containerClassName
          )}
        >
          <HugeiconsIcon
            icon={Icon}
            size={size}
            color="currentColor"
            strokeWidth={1.5}
            className={cn("stroke-2", className)}
          />
        </div>
      ) : (
        <HugeiconsIcon
          icon={Icon}
          size={size}
          color="currentColor"
          strokeWidth={1.5}
          className={cn(
            "flex-shrink-0",
            {
              "text-[color-mix(in_srgb,var(--priority-urgent)_94%,black)]": resolvedPriority === "urgent",
              "text-[color-mix(in_srgb,var(--priority-high)_92%,black)]": resolvedPriority === "high",
              "text-[color-mix(in_srgb,var(--priority-medium)_90%,black)]": resolvedPriority === "medium",
              "text-[color-mix(in_srgb,var(--priority-low)_92%,black)]": resolvedPriority === "low",
              "text-placeholder": resolvedPriority === "none",
            },
            className
          )}
        />
      )}
    </>
  );
}

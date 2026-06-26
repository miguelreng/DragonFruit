/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { ArrowDown, ArrowRight, ArrowUp, DangerTriangle } from "@solar-icons/react/ssr";
import { Minus } from "@plane/icons";
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
  const icons: Record<TIssuePriorities, React.ElementType> = {
    urgent: DangerTriangle,
    high: ArrowUp,
    medium: ArrowRight,
    low: ArrowDown,
    none: Minus,
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
          <Icon className={cn("flex-shrink-0", className)} style={{ width: size, height: size }} aria-hidden />
        </div>
      ) : (
        <Icon
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
          style={{ width: size, height: size }}
          aria-hidden
        />
      )}
    </>
  );
}

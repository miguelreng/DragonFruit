/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { cn } from "@plane/ui";

type Props = {
  className?: string;
  control?: React.ReactNode;
  description?: React.ReactNode;
  title?: React.ReactNode;
  variant?: "h3" | "h4" | "h5" | "h6";
};

export function SettingsHeading({ className, control, description, title, variant = "h5" }: Props) {
  return (
    <div className={cn("flex flex-col items-start justify-between gap-4 md:flex-row md:items-center", className)}>
      <div className="flex flex-col items-start gap-1">
        {title && (
          <h3
            className={cn("text-primary", {
              "text-h3-medium": variant === "h3",
              "text-h4-medium": variant === "h4",
              "text-h5-medium": variant === "h5",
              "text-h6-medium": variant === "h6",
            })}
          >
            {title}
          </h3>
        )}
        {description && <p className="text-body-xs-regular text-tertiary">{description}</p>}
      </div>
      {control}
    </div>
  );
}

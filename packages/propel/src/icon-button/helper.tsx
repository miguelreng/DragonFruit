/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type React from "react";

export const iconButtonVariants = cva(
  "t-colors t-press t-focus inline-flex aspect-square items-center justify-center gap-1 whitespace-nowrap disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "bg-[#e548a5] text-white hover:bg-[#d93d9a] focus-visible:bg-[#c9368e] active:bg-[#c9368e] disabled:bg-layer-disabled disabled:text-on-color-disabled",
        "error-fill":
          "bg-danger-primary text-on-color hover:bg-danger-primary-hover focus-visible:bg-danger-primary-active active:bg-danger-primary-active disabled:bg-layer-disabled disabled:text-disabled",
        "error-outline":
          "border border-danger-strong bg-layer-2 text-danger-primary hover:bg-danger-subtle focus-visible:bg-danger-subtle-hover active:bg-danger-subtle-hover disabled:border-subtle-1 disabled:bg-layer-2 disabled:text-disabled",
        // Mirror of error-outline. Exists so a confirm/discard pair reads as a
        // pair — the app had these hand-rolled with matching subtle fills.
        "success-outline":
          "border border-success-strong bg-layer-2 text-success-primary hover:bg-success-subtle focus-visible:bg-success-subtle-1 active:bg-success-subtle-1 disabled:border-subtle-1 disabled:bg-layer-2 disabled:text-disabled",
        secondary:
          "border border-strong bg-layer-2 text-secondary shadow-raised-100 hover:bg-layer-2-hover focus-visible:bg-layer-2-active active:bg-layer-2-active disabled:border-subtle-1 disabled:bg-layer-transparent disabled:text-disabled",
        tertiary:
          "bg-layer-3 text-secondary hover:bg-layer-3-hover focus-visible:bg-layer-3-active active:bg-layer-3-active disabled:bg-layer-transparent disabled:text-disabled",
        // Rest quiet, brighten on hover: the behaviour ~53 hand-rolled icon
        // buttons converged on independently. The background stays the alpha
        // overlay (composites over any layer, unlike an opaque bg-layer-1).
        ghost:
          "bg-layer-transparent text-tertiary hover:bg-layer-transparent-hover hover:text-primary focus-visible:bg-layer-transparent-active active:bg-layer-transparent-active disabled:bg-layer-transparent disabled:text-disabled",
      },
      size: {
        sm: "size-5 rounded-lg",
        base: "size-6 rounded-lg",
        lg: "size-7 rounded-lg",
        xl: "size-8 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "base",
    },
  }
);

type IconButtonPropsWithChildren = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof iconButtonVariants> & {
    /** ComponentType, not FC: class components and forwardRef icons are valid too. */
    icon: React.ComponentType<{ className?: string }>;
    loading?: boolean;
    iconClassName?: string;
  };
export type IconButtonProps = Omit<IconButtonPropsWithChildren, "children">;

export function getIconButtonStyling(
  variant: NonNullable<IconButtonProps["variant"]>,
  size: NonNullable<IconButtonProps["size"]>
): string {
  return iconButtonVariants({ variant, size });
}

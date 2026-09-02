/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "../utils";
import type { IconButtonProps } from "./helper";
import { CircularBarSpinner } from "../spinners";
import { iconButtonVariants } from "./helper";

const IconButton = React.forwardRef(function IconButton(
  props: IconButtonProps,
  ref: React.ForwardedRef<HTMLButtonElement>
) {
  const {
    variant = "primary",
    size = "base",
    className = "",
    type = "button",
    loading = false,
    disabled = false,
    icon: Icon,
    iconClassName = "",
    ...rest
  } = props;

  return (
    <button
      ref={ref}
      type={type}
      className={cn(iconButtonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <CircularBarSpinner
          height={size === "sm" ? "14px" : size === "xl" ? "20px" : "16px"}
          width={size === "sm" ? "14px" : size === "xl" ? "20px" : "16px"}
        />
      ) : (
        <Icon
          className={cn(
            {
              "size-3.5": size === "sm",
              "size-4": size === "base" || size === "lg",
              "size-5": size === "xl",
            },
            iconClassName
          )}
        />
      )}
    </button>
  );
});

IconButton.displayName = "plane-ui-icon-button";

export { IconButton };

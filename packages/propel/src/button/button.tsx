/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "../utils";
import type { ButtonProps } from "./helper";
import { CircularBarSpinner } from "../spinners";
import { getIconStyling, getIconSizePx, buttonVariants } from "./helper";

const Button = React.forwardRef(function Button(props: ButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) {
  const {
    variant = "primary",
    size = "base",
    className = "",
    type = "button",
    loading = false,
    disabled = false,
    prependIcon = null,
    appendIcon = null,
    children,
    ...rest
  } = props;

  const buttonIconStyle = getIconStyling(size ?? "base");
  const buttonIconPx = getIconSizePx(size ?? "base");

  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        buttonVariants({ variant, size }),
        // Press feedback on real buttons; link variants are inline text and
        // shouldn't scale. t-press supersedes the base t-colors transition.
        variant !== "link" && variant !== "link-accent" && "t-press",
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <CircularBarSpinner className="shrink-0" height={buttonIconPx} width={buttonIconPx} />
      ) : (
        prependIcon &&
        React.cloneElement(prependIcon, { className: cn("shrink-0", buttonIconStyle), strokeWidth: 2 })
      )}
      {/* Text labels ride ~1px high inside the fixed-height pill: flex centers the
          line box, but the font's ascent/descent are asymmetric so the glyphs sit
          above the optical center. Trim the label box to cap-height/baseline so
          what gets centered is the ink. Element children stay unwrapped to keep
          gap-1 spacing between them. */}
      {typeof children === "string" || typeof children === "number" ? (
        <span className="[text-box:trim-both_cap_alphabetic]">{children}</span>
      ) : (
        children
      )}
      {appendIcon && React.cloneElement(appendIcon, { className: cn("shrink-0", buttonIconStyle), strokeWidth: 2 })}
    </button>
  );
});

Button.displayName = "plane-ui-button";

export { Button };

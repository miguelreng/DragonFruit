/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { Input as BaseInput } from "@base-ui-components/react/input";
// helpers
import { cn } from "../utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mode?: "primary" | "transparent" | "true-transparent";
  inputSize?: "xs" | "sm" | "md";
  hasError?: boolean;
}

const Input = React.forwardRef(function Input(props: InputProps, ref: React.ForwardedRef<HTMLInputElement>) {
  const {
    id,
    type,
    name,
    mode = "primary",
    inputSize = "sm",
    hasError = false,
    className = "",
    autoComplete = "off",
    ...rest
  } = props;

  return (
    <BaseInput
      id={id}
      ref={ref}
      type={type}
      name={name}
      className={cn(
        "placeholder-tertiary block rounded-lg border-subtle-1 bg-layer-2 text-13 focus:outline-none",
        {
          "rounded-lg border-[0.5px]": mode === "primary",
          "t-field rounded-lg border-none bg-transparent ring-0 focus:ring-1 focus:ring-accent-strong":
            mode === "transparent",
          "rounded-lg border-none bg-transparent ring-0": mode === "true-transparent",
          "border-danger-strong": hasError,
          "px-1 py-0.5": inputSize === "xs",
          "px-2.5 py-1.5": inputSize === "sm",
          "p-2.5": inputSize === "md",
        },
        className
      )}
      aria-invalid={hasError || undefined}
      autoComplete={autoComplete}
      {...rest}
    />
  );
});

Input.displayName = "form-input-field";

export { Input };

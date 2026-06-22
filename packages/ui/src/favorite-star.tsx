/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Star } from "@solar-icons/react/ssr";
import React from "react";
// helpers
import { cn } from "./utils";

type Props = {
  buttonClassName?: string;
  iconClassName?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  selected: boolean;
};

export const FavoriteStar = React.forwardRef<HTMLButtonElement, Props>(function FavoriteStar(props, ref) {
  const { buttonClassName, iconClassName, onClick, selected } = props;

  return (
    <button
      ref={ref}
      type="button"
      // outline-none kills the default focus rectangle; a subtle ring still shows
      // for keyboard users (focus-visible) so the control stays accessible.
      className={cn(
        "grid h-4 w-4 place-items-center rounded outline-none focus-visible:ring-1 focus-visible:ring-accent-primary/40",
        buttonClassName
      )}
      onClick={onClick}
    >
      <Star
        weight={selected ? "Bold" : "Linear"}
        color={selected ? "#facc15" : undefined}
        className={cn("h-4 w-4 transition-all", selected ? "" : "text-tertiary", iconClassName)}
      />
    </button>
  );
});

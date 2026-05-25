/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Star } from "lucide-react";
import React from "react";
// helpers
import { cn } from "./utils";

type Props = {
  buttonClassName?: string;
  iconClassName?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  selected: boolean;
};

export function FavoriteStar(props: Props) {
  const { buttonClassName, iconClassName, onClick, selected } = props;

  return (
    <button type="button" className={cn("grid h-4 w-4 place-items-center", buttonClassName)} onClick={onClick}>
      <Star
        className={cn(
          "h-4 w-4 text-tertiary transition-all",
          {
            "fill-[#facc15] stroke-[#ca8a04]": selected,
          },
          iconClassName
        )}
      />
    </button>
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cn } from "@plane/utils";
import { POWER_K_SCOPE_CHIPS, type TPowerKScope } from "../../core/scope";

type Props = {
  scope: TPowerKScope;
  onChange: (scope: TPowerKScope) => void;
};

export function PowerKScopeChips(props: Props) {
  const { scope, onChange } = props;
  return (
    <div className="flex shrink-0 items-center gap-1 px-3 pt-2 pb-1">
      {POWER_K_SCOPE_CHIPS.map((chip) => {
        const active = chip.id === scope;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onChange(chip.id)}
            className={cn(
              "rounded px-2 py-0.5 text-11 transition-colors",
              active
                ? "bg-accent-subtle text-accent-primary"
                : "text-tertiary hover:bg-layer-1-hover hover:text-secondary"
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

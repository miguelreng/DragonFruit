/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";

// icons
import { CloseIcon, PriorityIcon } from "@/components/icons/propel-shim";
import type { TIssuePriorities } from "@plane/types";
// types

type Props = {
  handleRemove: (val: string) => void;
  values: string[];
  editable: boolean | undefined;
};

export const AppliedPriorityFilters = observer(function AppliedPriorityFilters(props: Props) {
  const { handleRemove, values, editable } = props;

  return (
    <>
      {values.map((priority) => (
        <div
          key={priority}
          className="shadow-sm flex items-center gap-1.5 rounded-lg border border-strong bg-layer-2 px-1.5 py-1 text-11 font-medium text-primary"
        >
          <PriorityIcon priority={priority as TIssuePriorities} className="h-3.5 w-3.5" />
          {priority}
          {editable && (
            <button
              type="button"
              className="grid place-items-center text-secondary transition-colors hover:text-primary"
              onClick={() => handleRemove(priority)}
            >
              <CloseIcon height={10} width={10} strokeWidth={2} />
            </button>
          )}
        </div>
      ))}
    </>
  );
});

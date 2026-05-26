/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CloseIcon, PriorityIcon } from "@plane/propel/icons";
import type { TIssuePriorities } from "@plane/propel/icons";

type Props = {
  handleRemove: (val: string) => void;
  values: TIssuePriorities[];
};

export function AppliedPriorityFilters(props: Props) {
  const { handleRemove, values } = props;

  return (
    <>
      {values?.map((priority) => (
        <div
          key={priority}
          className="shadow-sm flex items-center gap-1.5 rounded-md border border-strong bg-layer-2 px-1.5 py-1 text-11 font-medium text-primary"
        >
          <PriorityIcon priority={priority} className="h-3.5 w-3.5" />
          {priority}
          <button
            type="button"
            className="grid place-items-center text-secondary transition-colors hover:text-primary"
            onClick={() => handleRemove(priority)}
          >
            <CloseIcon height={10} width={10} strokeWidth={2} />
          </button>
        </div>
      ))}
    </>
  );
}

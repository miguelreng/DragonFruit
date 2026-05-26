/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CloseIcon } from "@plane/propel/icons";
// types
import type { IIssueLabel } from "@/types/issue";

type Props = {
  handleRemove: (val: string) => void;
  labels: IIssueLabel[] | undefined;
  values: string[];
};

export function AppliedLabelsFilters(props: Props) {
  const { handleRemove, labels, values } = props;

  return (
    <>
      {values.map((labelId) => {
        const labelDetails = labels?.find((l) => l.id === labelId);

        if (!labelDetails) return null;

        return (
          <div
            key={labelId}
            className="shadow-sm flex items-center gap-1.5 rounded-md border border-strong bg-layer-2 px-1.5 py-1 text-11 font-medium text-primary"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: labelDetails.color,
              }}
            />
            <span className="normal-case">{labelDetails.name}</span>
            <button
              type="button"
              className="grid place-items-center text-secondary transition-colors hover:text-primary"
              onClick={() => handleRemove(labelId)}
            >
              <CloseIcon height={10} width={10} strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </>
  );
}

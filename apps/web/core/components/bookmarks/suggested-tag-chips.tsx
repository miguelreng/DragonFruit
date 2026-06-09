/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MouseEvent } from "react";
import { CancelCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@plane/utils";

export function SuggestedTagChips(props: {
  tags: string[];
  onAccept: (tag: string) => void;
  onDismiss: (tag: string) => void;
  className?: string;
  // When rendered inside a clickable card/row, swallow the click so accepting a
  // tag doesn't also navigate to the bookmark.
  stopPropagation?: boolean;
}) {
  const { tags, onAccept, onDismiss, className, stopPropagation } = props;
  if (tags.length === 0) return null;
  const guard = (handler: (tag: string) => void, tag: string) => (event: MouseEvent) => {
    if (stopPropagation) {
      event.preventDefault();
      event.stopPropagation();
    }
    handler(tag);
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <span className="text-11 font-medium tracking-wide text-tertiary uppercase">Suggested</span>
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-strong px-1.5 py-0.5 text-11 text-secondary"
        >
          <button type="button" title="Add tag" onClick={guard(onAccept, tag)} className="hover:text-primary">
            {tag}
          </button>
          <button
            type="button"
            aria-label={`Dismiss ${tag}`}
            onClick={guard(onDismiss, tag)}
            className="hover:text-red-500 grid place-items-center text-tertiary"
          >
            <HugeiconsIcon icon={CancelCircleIcon} className="size-3" color="currentColor" strokeWidth={1.5} />
          </button>
        </span>
      ))}
    </div>
  );
}

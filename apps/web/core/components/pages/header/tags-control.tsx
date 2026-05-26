/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import type { TPageInstance } from "@/store/pages/base-page";
import { TagIcon } from "@/components/icons/lucide-shim";
import { normalizeTags, parseTagsInput } from "@/helpers/tags";

type Props = {
  page: TPageInstance;
};

export const PageTagsControl = observer(function PageTagsControl({ page }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const tags = normalizeTags((page.view_props as Record<string, unknown> | undefined)?.tags);

  useOutsideClickDetector(containerRef, () => setIsOpen(false));

  useEffect(() => {
    setInputValue(tags.join(", "));
  }, [tags]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const nextTags = parseTagsInput(inputValue);
      await page.updateViewProps({
        tags: nextTags.length > 0 ? nextTags : undefined,
      });
      setIsOpen(false);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't update tags",
        message: "Try again in a moment.",
      });
    } finally {
      setIsSaving(false);
    }
  }, [inputValue, page]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-7 items-center gap-1.5 rounded-md border border-subtle-1 bg-surface-1 px-2.5 text-12 font-medium text-secondary transition-colors hover:bg-layer-2"
      >
        <TagIcon className="size-3.5" />
        {tags.length > 0 ? (
          <div className="flex max-w-[160px] items-center gap-1 overflow-hidden">
            {tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="max-w-[72px] truncate rounded-sm border border-subtle-1 bg-layer-1 px-1.5 py-0.5 text-10 font-medium"
              >
                {tag}
              </span>
            ))}
            {tags.length > 2 && <span className="text-11 text-tertiary">+{tags.length - 2}</span>}
          </div>
        ) : (
          <span>Tags</span>
        )}
      </button>

      {isOpen && (
        <div className="shadow-lg absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border border-subtle-1 bg-surface-1 p-3">
          <p className="mb-1 text-11 font-medium text-secondary">Doc tags</p>
          <p className="mb-2 text-11 text-tertiary">Add comma-separated tags.</p>
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSave();
              }
            }}
            placeholder="e.g. product, launch, q3"
            className="w-full rounded-sm border border-subtle-1 bg-layer-1 px-2 py-1.5 text-12 text-primary outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-1">
              {tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className={cn("rounded-sm border border-subtle-1 bg-layer-1 px-1.5 py-0.5 text-10 font-medium")}
                >
                  {tag}
                </span>
              ))}
              {tags.length > 4 && <span className="text-11 text-tertiary">+{tags.length - 4} more</span>}
            </div>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSave()}
              className="rounded-sm bg-accent-primary px-2 py-1 text-11 font-medium text-white disabled:cursor-wait disabled:opacity-70"
            >
              {isSaving ? "Saving" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

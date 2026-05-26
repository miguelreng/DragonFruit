/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPageInstance } from "@/store/pages/base-page";
import { TagIcon, XIcon } from "@/components/icons/lucide-shim";
import { normalizeTags, parseTagsInput } from "@/helpers/tags";

type Props = {
  page: TPageInstance;
};

export const PageTagsControl = observer(function PageTagsControl({ page }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rawTags = (page.view_props as Record<string, unknown> | undefined)?.tags;
  const tags = useMemo(() => normalizeTags(rawTags), [rawTags]);

  useOutsideClickDetector(containerRef, () => setIsOpen(false));

  useEffect(() => {
    setDraftTags(tags);
    setTagDraft("");
  }, [tags]);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
  }, [isOpen]);

  const openTagsEditor = () => {
    if (!isOpen) {
      setDraftTags(tags);
      setTagDraft("");
    }
    setIsOpen((prev) => !prev);
  };

  const handleTagDraftChange = useCallback(
    (value: string) => {
      if (!value.includes(",")) {
        setTagDraft(value);
        return;
      }

      const parts = value.split(",");
      const completedTags = parseTagsInput(parts.slice(0, -1).join(","));
      setDraftTags((prevTags) => normalizeTags([...prevTags, ...completedTags]));
      setTagDraft(parts.at(-1) ?? "");
    },
    [setDraftTags]
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const nextTags = normalizeTags([...draftTags, ...parseTagsInput(tagDraft)]);
      setDraftTags(nextTags);
      setTagDraft("");
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
  }, [draftTags, page, tagDraft]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={openTagsEditor}
        className="flex h-7 items-center gap-1.5 rounded-lg border border-subtle-1 bg-surface-1 px-2.5 text-12 font-medium text-secondary transition-colors hover:bg-layer-2"
      >
        <TagIcon className="size-3.5" />
        {tags.length > 0 ? (
          <div className="flex max-w-[160px] items-center gap-1 overflow-hidden">
            {tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="max-w-[72px] truncate rounded-lg border border-subtle-1 bg-layer-1 px-1.5 py-0.5 text-10 font-medium"
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
        <div className="shadow-lg absolute top-full right-0 z-50 mt-2 w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-subtle-1 bg-surface-1 p-2">
          <div className="focus-within:border-accent-primary flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-subtle-1 bg-layer-1 px-2 py-1.5">
            {draftTags.map((tag, index) => (
              <button
                key={tag}
                type="button"
                onClick={() => setDraftTags((prevTags) => prevTags.filter((_, tagIndex) => tagIndex !== index))}
                className="group hover:border-accent-primary inline-flex max-w-[120px] items-center gap-1 rounded-lg border border-subtle-1 bg-surface-1 px-1.5 py-0.5 text-10 font-medium text-secondary transition-colors hover:text-primary"
                aria-label={`Remove ${tag} tag`}
              >
                <span className="truncate">{tag}</span>
                <XIcon className="size-2.5 text-tertiary group-hover:text-primary" />
              </button>
            ))}
            <input
              ref={inputRef}
              value={tagDraft}
              onChange={(e) => handleTagDraftChange(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setIsOpen(false);
                }
                if (e.key === "Backspace" && tagDraft.length === 0 && draftTags.length > 0) {
                  e.preventDefault();
                  setDraftTags((prevTags) => prevTags.slice(0, -1));
                }
              }}
              placeholder={draftTags.length > 0 ? "Add tag" : "e.g. product, launch, q3"}
              className="h-6 min-w-[120px] flex-1 rounded-lg border-none bg-transparent px-1 text-12 text-primary outline-none placeholder:text-tertiary"
            />
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSave()}
              className="ml-auto rounded-lg bg-accent-primary px-2.5 py-1 text-11 font-medium text-white transition-opacity disabled:cursor-wait disabled:opacity-70"
            >
              {isSaving ? "Saving" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPageInstance } from "@/store/pages/base-page";
import { TagIcon, XIcon } from "@/components/icons/lucide-shim";
import { normalizeTags, parseTagsInput } from "@/helpers/tags";

type Props = {
  page: TPageInstance;
};

export const PageTagsControl = observer(function PageTagsControl({ page }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const rawTags = (page.view_props as Record<string, unknown> | undefined)?.tags;
  const tags = useMemo(() => normalizeTags(rawTags), [rawTags]);

  useEffect(() => {
    if (!isEditing) setDraftTags(tags);
    setTagDraft("");
  }, [isEditing, tags]);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
  }, [isEditing]);

  const handleStartEditing = useCallback(() => {
    setDraftTags(tags);
    setTagDraft("");
    setIsEditing(true);
  }, [tags]);

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

  const persistTags = useCallback(
    async (nextTags: string[]) => {
      setIsSaving(true);
      try {
        await page.updateViewProps({
          tags: nextTags.length > 0 ? nextTags : undefined,
        });
        setDraftTags(nextTags);
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Couldn't update tags",
          message: "Try again in a moment.",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [page]
  );

  const handleCommitTag = useCallback(async () => {
    const nextTags = normalizeTags([...draftTags, ...parseTagsInput(tagDraft)]);
    setTagDraft("");
    await persistTags(nextTags);
    inputRef.current?.focus();
  }, [draftTags, persistTags, tagDraft]);

  const handleRemoveTag = useCallback(
    async (index: number) => {
      const nextTags = draftTags.filter((_, tagIndex) => tagIndex !== index);
      await persistTags(nextTags);
      inputRef.current?.focus();
    },
    [draftTags, persistTags]
  );

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={handleStartEditing}
        className="inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-lg border border-subtle-1 bg-surface-1 px-2.5 text-12 font-medium text-secondary transition-colors hover:bg-layer-2"
      >
        <TagIcon className="size-3.5 shrink-0" />
        {tags.length > 0 ? (
          <span className="max-w-[150px] truncate">{tags.slice(0, 2).join(", ")}</span>
        ) : (
          <span>Tags</span>
        )}
        {tags.length > 2 && <span className="text-11 text-tertiary">+{tags.length - 2}</span>}
      </button>
    );
  }

  return (
    <div className="focus-within:border-accent-primary inline-flex h-7 max-w-[360px] items-center gap-1.5 rounded-lg border border-subtle-1 bg-surface-1 px-2 text-12 font-medium text-secondary transition-colors">
      <TagIcon className="size-3.5 shrink-0" />
      {draftTags.map((tag, index) => (
        <button
          key={tag}
          type="button"
          onClick={() => void handleRemoveTag(index)}
          className="group hover:border-accent-primary inline-flex max-w-[96px] items-center gap-1 rounded-md border border-subtle-1 bg-layer-1 px-1.5 py-0.5 text-10 font-medium text-secondary transition-colors hover:text-primary"
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
            void handleCommitTag();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setIsEditing(false);
          }
          if (e.key === "Backspace" && tagDraft.length === 0 && draftTags.length > 0) {
            e.preventDefault();
            void handleRemoveTag(draftTags.length - 1);
          }
        }}
        placeholder="Add tag"
        className="h-5 min-w-[72px] flex-1 bg-transparent px-0 text-12 text-primary outline-none placeholder:text-tertiary"
      />
      {isSaving && <span className="text-10 font-medium text-tertiary">Saving</span>}
    </div>
  );
});

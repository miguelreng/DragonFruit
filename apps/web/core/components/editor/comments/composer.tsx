/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle } from "@/components/icons/lucide-shim";
// plane imports
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// services
import { BlockCommentService } from "@/services/block-comment.service";

const service = new BlockCommentService();

type Props = {
  isOpen: boolean;
  workspaceSlug: string | undefined;
  projectId: string | undefined;
  pageId: string | undefined;
  commentId: string | null;
  onSubmitted: () => void;
  onCancel: () => void;
};

export function BlockCommentComposer(props: Props) {
  const { isOpen, workspaceSlug, projectId, pageId, commentId, onSubmitted, onCancel } = props;
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setContent("");
    setError(null);
    setSaving(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    if (!workspaceSlug || !projectId || !pageId || !commentId) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await service.create(workspaceSlug, projectId, pageId, {
        block_id: commentId,
        content: trimmed,
      });
      onSubmitted();
    } catch {
      setError("Couldn't save the comment.");
    } finally {
      setSaving(false);
    }
  }, [workspaceSlug, projectId, pageId, commentId, content, onSubmitted]);

  return (
    <ModalCore isOpen={isOpen} handleClose={onCancel} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex flex-col">
        <div className="flex items-center gap-2 border-b border-subtle px-5 py-3">
          <MessageCircle className="size-4 shrink-0 text-accent-primary" />
          <h2 className="text-14 font-medium text-primary">Add a comment</h2>
        </div>
        <div className="px-5 py-4">
          <textarea
            ref={inputRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind about this block?"
            rows={4}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            className="w-full resize-y rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary placeholder:text-placeholder focus:border-strong focus:outline-none"
          />
          {error && <p className="text-error mt-2 text-12">{error}</p>}
          <p className="mt-2 text-11 text-tertiary">⌘+Enter to post</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-1.5 text-13 text-primary hover:bg-layer-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || content.trim().length === 0}
            onClick={() => void handleSubmit()}
            className={cn(
              "text-on-accent-primary flex items-center gap-1.5 rounded-md bg-accent-primary px-3 py-1.5 text-13 font-medium",
              (saving || content.trim().length === 0) && "cursor-not-allowed opacity-50"
            )}
          >
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Post comment"
            )}
          </button>
        </div>
      </div>
    </ModalCore>
  );
}

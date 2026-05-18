/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, MessageCircle, X } from "@/components/icons/lucide-shim";
// plane imports
import { cn } from "@plane/utils";
// services
import { BlockCommentService } from "@/services/block-comment.service";
import type { TBlockComment } from "@/services/block-comment.service";

const service = new BlockCommentService();

type Props = {
  isOpen: boolean;
  workspaceSlug: string | undefined;
  projectId: string | undefined;
  pageId: string | undefined;
  onClose: () => void;
  /** Bump this number to force a refetch (e.g. after a new comment is posted). */
  refreshKey: number;
};

export function BlockCommentsPanel(props: Props) {
  const { isOpen, workspaceSlug, projectId, pageId, onClose, refreshKey } = props;
  const [comments, setComments] = useState<TBlockComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!workspaceSlug || !projectId || !pageId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await service.list(workspaceSlug, projectId, pageId);
      if (mountedRef.current) setComments(res.comments ?? []);
    } catch {
      if (mountedRef.current) setError("Couldn't load comments.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [workspaceSlug, projectId, pageId]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, refreshKey, load]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, TBlockComment[]>();
    for (const c of comments) {
      const arr = buckets.get(c.block_id) ?? [];
      arr.push(c);
      buckets.set(c.block_id, arr);
    }
    return Array.from(buckets.entries());
  }, [comments]);

  const handleResolve = useCallback(
    async (comment: TBlockComment) => {
      if (!workspaceSlug || !projectId || !pageId) return;
      try {
        await service.update(workspaceSlug, projectId, pageId, comment.id, { resolved: true });
        void load();
      } catch {
        setError("Couldn't resolve the comment.");
      }
    },
    [workspaceSlug, projectId, pageId, load]
  );

  const handleJumpTo = useCallback((blockId: string) => {
    const target = document.querySelector<HTMLElement>(`[data-block-comment-id="${blockId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.setAttribute("data-active", "true");
    window.setTimeout(() => target.removeAttribute("data-active"), 1600);
  }, []);

  if (!isOpen) return null;

  return (
    <aside
      className={cn(
        "fixed top-20 right-4 z-30 flex max-h-[70vh] w-80 flex-col rounded-md border-[0.5px] border-strong bg-surface-1 shadow-raised-200"
      )}
    >
      <header className="flex items-center justify-between border-b border-subtle px-4 py-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="size-4 text-accent-primary" />
          <h3 className="text-13 font-medium text-primary">
            Comments {grouped.length > 0 && <span className="text-tertiary">({grouped.length})</span>}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-tertiary hover:bg-layer-2 hover:text-primary"
        >
          <X className="size-3.5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="px-4 py-3 text-12 text-tertiary">Loading…</div>}
        {error && <div className="text-error px-4 py-3 text-12">{error}</div>}
        {!loading && !error && grouped.length === 0 && (
          <div className="px-4 py-6 text-center text-12 text-tertiary">
            No comments yet. Use <span className="font-medium">/comment</span> in a block to start a thread.
          </div>
        )}
        {grouped.map(([blockId, thread]) => (
          <div key={blockId} className="border-b border-subtle px-4 py-3 last:border-b-0">
            <button
              type="button"
              onClick={() => handleJumpTo(blockId)}
              className="mb-2 flex items-center gap-1 text-11 font-medium text-tertiary hover:text-accent-primary"
            >
              Jump to block
            </button>
            <div className="flex flex-col gap-2">
              {thread.map((comment) => (
                <div key={comment.id} className="rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-2">
                  <p className="text-13 whitespace-pre-wrap text-primary">{comment.content}</p>
                  <div className="mt-1 flex items-center justify-between text-11 text-tertiary">
                    <span>{new Date(comment.created_at).toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={() => void handleResolve(comment)}
                      className="flex items-center gap-1 hover:text-accent-primary"
                    >
                      <Check className="size-3" />
                      Resolve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePopper } from "react-popper";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import { cn, isCommentEmpty } from "@plane/utils";
// components
import { Check, Loader2, X } from "@/components/icons/lucide-shim";
import { LiteTextEditor } from "@/components/editor/lite-text";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import { BlockCommentService } from "@/services/block-comment.service";
import type { TBlockComment } from "@/services/block-comment.service";

const service = new BlockCommentService();

type Props = {
  /**
   * The marked span in the doc this thread anchors to. The popover
   * positions next to it via Popper, and re-positions on resize/scroll
   * thanks to the modifiers below.
   */
  referenceEl: HTMLElement | null;
  /**
   * The `block_id` (UUID stamped on the BlockComment mark). Drives
   * what we fetch and what we POST against. When opened from the
   * bubble menu / slash command on a fresh selection there's no
   * thread yet — the composer below handles the empty state.
   */
  blockId: string | null;
  workspaceSlug: string | undefined;
  projectId: string | undefined;
  pageId: string | undefined;
  /**
   * Called when the popover wants to close (Esc, outside click,
   * dismiss button). The host clears the anchor + blockId so this
   * unmounts.
   */
  onClose: () => void;
  /**
   * Called when the popover wants to be dismissed AND the underlying
   * mark rolled back — used when the user opens the composer via
   * the bubble menu / slash command and bails without posting a single
   * comment. Stale `data-block-comment-id` attributes shouldn't linger
   * on the doc with no thread behind them. If the popover is for an
   * existing thread (i.e. there are already comments), the host passes
   * the same callback as onClose — there's nothing to roll back.
   */
  onCancelEmpty: () => void;
};

/**
 * Floating widget that anchors next to a marked span in the doc and
 * shows the thread + an inline composer. Replaces the modal-style
 * composer and the right-rail panel for the primary creation/view UX.
 *
 * Empty state: just the composer (placeholder asks for a comment).
 * Populated: list of existing comments + a reply composer below.
 *
 * Why Popper + a portal-style fixed element rather than absolute
 * positioning inside the editor DOM: ProseMirror re-renders the doc
 * tree on every keystroke. Anchoring a React subtree inside it would
 * either get blown away or fight with the editor's vdom. Popper
 * positions in the viewport against a non-React anchor, so the editor
 * is free to do whatever it likes with the span.
 */
export function BlockCommentFloating(props: Props) {
  const { referenceEl, blockId, workspaceSlug, projectId, pageId, onClose, onCancelEmpty } = props;
  const [popperEl, setPopperEl] = useState<HTMLDivElement | null>(null);
  const [comments, setComments] = useState<TBlockComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftHtml, setDraftHtml] = useState("<p></p>");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<EditorRefApi>(null);
  const mounted = useRef(true);
  // store hooks
  const workspaceStore = useWorkspace();
  const workspaceId = (workspaceSlug ? workspaceStore.getWorkspaceBySlug(workspaceSlug)?.id : "") as string;

  // Popper wiring. `offset` so the card doesn't touch the marked
  // span; `flip` so it bounces above when there's no room below;
  // `preventOverflow` so it stays inside the viewport on small
  // screens. The container is fixed so scroll moves it with the doc.
  const { styles, attributes } = usePopper(referenceEl, popperEl, {
    placement: "bottom-start",
    strategy: "fixed",
    modifiers: [
      { name: "offset", options: { offset: [0, 8] } },
      { name: "flip", options: { padding: 8 } },
      { name: "preventOverflow", options: { padding: 8 } },
    ],
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Fetch comments for the anchor. We load every time blockId
  // changes — i.e. when the user opens the widget on a different
  // marked span. The list endpoint is cheap (one page worth of
  // rows, scoped to the page) and caching it would risk staleness
  // when a teammate is replying concurrently.
  const load = useCallback(async () => {
    if (!workspaceSlug || !projectId || !pageId || !blockId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await service.list(workspaceSlug, projectId, pageId);
      if (!mounted.current) return;
      // Narrow to just this block_id. A page can host many threads;
      // the API returns everything for the page so we filter client-
      // side to avoid an extra endpoint.
      setComments((res.comments ?? []).filter((c) => c.block_id === blockId));
    } catch {
      if (mounted.current) setError("Couldn't load comments.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [workspaceSlug, projectId, pageId, blockId]);

  useEffect(() => {
    if (!blockId) return;
    void load();
  }, [blockId, load]);

  // Group into a single thread: parent (oldest top-level) + replies.
  // PageBlockComment supports `parent` for one-level threading; we
  // hoist the first top-level comment as the thread head and treat
  // everything else as replies under it (matches the issue-comment
  // pattern). If multiple top-level comments share one block_id —
  // they shouldn't in practice — we render each as its own sub-card.
  const { tops, repliesByParent } = useMemo(() => {
    const tops_: TBlockComment[] = [];
    const repliesByParent_ = new Map<string, TBlockComment[]>();
    for (const c of comments) {
      if (!c.parent) tops_.push(c);
      else {
        const arr = repliesByParent_.get(c.parent) ?? [];
        arr.push(c);
        repliesByParent_.set(c.parent, arr);
      }
    }
    const cmp = (a: TBlockComment, b: TBlockComment) => (a.created_at < b.created_at ? -1 : 1);
    // `toSorted` (ES2023) isn't in this app's TS lib config; the spread
    // gives us a fresh array so the in-place sort is local-only.
    // oxlint-disable-next-line no-array-sort
    const sortedTops = [...tops_].sort(cmp);
    for (const [k, arr] of repliesByParent_.entries()) {
      // oxlint-disable-next-line no-array-sort
      repliesByParent_.set(k, [...arr].sort(cmp));
    }
    return { tops: sortedTops, repliesByParent: repliesByParent_ };
  }, [comments]);

  const isEmptyThread = !loading && tops.length === 0;
  const draftEmpty = isCommentEmpty(draftHtml);

  // The first thread's id is the parent of subsequent replies.
  // When the thread is empty we POST without a parent — the API
  // treats that row as the new top-level for this block_id.
  const replyParentId = tops[0]?.id;

  const handlePost = useCallback(async () => {
    if (!workspaceSlug || !projectId || !pageId || !blockId) return;
    if (draftEmpty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await service.create(workspaceSlug, projectId, pageId, {
        block_id: blockId,
        content: draftHtml,
        ...(replyParentId ? { parent: replyParentId } : {}),
      });
      if (!mounted.current) return;
      setDraftHtml("<p></p>");
      editorRef.current?.clearEditor?.();
      void load();
    } catch {
      if (mounted.current) setError("Couldn't post the comment.");
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [workspaceSlug, projectId, pageId, blockId, draftEmpty, draftHtml, replyParentId, saving, load]);

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

  // Close on Escape. Outside-click is handled by a ref-aware
  // mousedown listener — we don't want the editor's own clicks
  // (which can land outside this popover but inside the marked
  // span) to dismiss us.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Same logic as cancel button: if the thread is empty, the
        // dismiss should roll back the orphan mark.
        if (isEmptyThread) onCancelEmpty();
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isEmptyThread, onCancelEmpty, onClose]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target || !popperEl) return;
      if (popperEl.contains(target)) return;
      // Click on the marked span itself shouldn't close — the user
      // is just re-clicking the anchor. Anywhere else dismisses.
      if (referenceEl && referenceEl.contains(target)) return;
      if (isEmptyThread) onCancelEmpty();
      else onClose();
    }
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [popperEl, referenceEl, isEmptyThread, onCancelEmpty, onClose]);

  if (!referenceEl || !blockId) return null;

  return (
    <div
      ref={setPopperEl}
      // popper applies inline transform styles; the z-index keeps us
      // above the editor's own floating menus (which sit at z<=10).
      style={{ ...styles.popper, zIndex: 50 }}
      {...attributes.popper}
      className={cn("w-96 max-w-[90vw] rounded-2xl border-[0.5px] border-strong bg-surface-1 shadow-raised-200")}
    >
      {/* The empty "add comment" state needs no header — the placeholder says
          it, and Esc / click-away both dismiss. Headers only add context once
          there's an actual thread to label. */}
      {!isEmptyThread && (
        <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
          <div className="text-caption-md-medium text-primary">{tops.length === 1 ? "Comment" : "Comments"}</div>
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded p-1 text-tertiary hover:bg-layer-2 hover:text-primary"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="flex max-h-[60vh] flex-col overflow-y-auto">
        {loading && <div className="px-3 py-2 text-12 text-tertiary">Loading…</div>}
        {error && <div className="text-error px-3 py-2 text-12">{error}</div>}
        {tops.map((parent) => (
          <div key={parent.id} className="border-b border-subtle px-3 py-2 last:border-b-0">
            <CommentBody
              html={parent.content}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              projectId={projectId}
            />
            <div className="mt-1 flex items-center justify-between text-11 text-tertiary">
              <span>{new Date(parent.created_at).toLocaleString()}</span>
              <button
                type="button"
                onClick={() => void handleResolve(parent)}
                className="flex items-center gap-1 hover:text-accent-primary"
              >
                <Check className="size-3" />
                Resolve
              </button>
            </div>
            {(repliesByParent.get(parent.id) ?? []).map((reply) => (
              <div key={reply.id} className="mt-2 border-l border-subtle pl-3">
                <CommentBody
                  html={reply.content}
                  workspaceSlug={workspaceSlug}
                  workspaceId={workspaceId}
                  projectId={projectId}
                />
                <span className="text-11 text-tertiary">{new Date(reply.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div
        className={cn("px-3 py-2", !isEmptyThread && "border-t border-subtle")}
        // `role="presentation"` because the div itself isn't
        // interactive — it just catches Enter that bubbles up from
        // the editor. The actual interactive element is the LiteText
        // editor inside, which is already keyboard-accessible.
        role="presentation"
        // Enter submits, Shift+Enter inserts a newline (standard chat
        // composer feel). We listen at the wrapper level too because
        // the LiteTextEditor's own onEnterKeyPress only fires when its
        // internal dropdowns (mention picker, slash menu) aren't open —
        // exactly the behavior we want. `isEditorReadyToDiscard`
        // returns false while the mention picker is open, so the
        // catch-here-too path bails out and lets the picker handle
        // Enter as a selection commit.
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.shiftKey &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey &&
            !draftEmpty &&
            !saving &&
            editorRef.current?.isEditorReadyToDiscard?.()
          ) {
            e.preventDefault();
            void handlePost();
          }
        }}
      >
        {workspaceSlug && workspaceId ? (
          <LiteTextEditor
            editable
            ref={editorRef}
            id={`block-comment-floating-${blockId}`}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            value={"<p></p>"}
            initialValue={"<p></p>"}
            onChange={(_j, html) => setDraftHtml(html)}
            onEnterKeyPress={() => {
              if (!draftEmpty && !saving) void handlePost();
            }}
            uploadFile={async () => {
              throw new Error("File uploads not supported in doc comments yet.");
            }}
            duplicateFile={async () => {
              throw new Error("File uploads not supported in doc comments yet.");
            }}
            parentClassName="p-2"
            containerClassName="min-h-min"
            displayConfig={{ fontSize: "small-font" }}
            showSubmitButton={false}
            variant="none"
          />
        ) : null}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-11 text-tertiary">
            <span className="font-medium">Enter</span> to post
          </span>
          <button
            type="button"
            onClick={() => void handlePost()}
            disabled={saving || draftEmpty}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1 text-12 font-medium text-on-color",
              (saving || draftEmpty) && "cursor-not-allowed opacity-60"
            )}
          >
            {saving ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Posting
              </>
            ) : isEmptyThread ? (
              "Post"
            ) : (
              "Reply"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentBody(props: {
  html: string;
  workspaceSlug: string | undefined;
  workspaceId: string;
  projectId: string | undefined;
}) {
  const { html, workspaceSlug, workspaceId, projectId } = props;
  const ref = useRef<EditorRefApi>(null);
  if (!workspaceSlug || !workspaceId) {
    return <p className="text-13 whitespace-pre-wrap text-primary">{html.replace(/<[^>]+>/g, "")}</p>;
  }
  return (
    <LiteTextEditor
      editable={false}
      ref={ref}
      id={`block-comment-body-${Math.random()}`}
      initialValue={html ?? ""}
      workspaceId={workspaceId}
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      parentClassName="border-none"
      containerClassName="!py-0"
      displayConfig={{ fontSize: "small-font" }}
    />
  );
}

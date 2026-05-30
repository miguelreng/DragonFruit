/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * "Reply to selection" bridge.
 *
 * The page editor lives in `packages/editor`, so its bubble menu can't reach
 * the host app's stores. When the user highlights a passage and hits "Ask
 * Atlas", the bubble menu dispatches a DOM CustomEvent (bubbles: true) on
 * `editor.view.dom`; it bubbles to `window` where the WorkspaceContentWrapper
 * catches it, opens the Atlas drawer, and stashes the snippet here.
 *
 * The Atlas drawer is *conditionally mounted* (only while open), so a plain
 * window listener inside it would miss the event that opens it. This tiny
 * module holds the latest pending snippet plus a subscribe channel, so the
 * drawer can read it on mount *and* react to new picks while already open.
 */

/** Dispatched on `editor.view.dom` by the editor bubble menu. The editor
 * package emits the literal string — keep this in sync with it. */
export const REPLY_TO_SELECTION_EVENT = "dragonfruit:reply-to-selection";

/** Payload carried on the CustomEvent from the editor. */
export type ReplyToSelectionDetail = {
  /** Plain text of the highlighted passage. */
  text: string;
  /** ProseMirror positions of the selection at pick time. Used to anchor an
   * inline edit back onto the same range. */
  from: number;
  to: number;
};

export type PendingReplyContext = ReplyToSelectionDetail;

let pending: PendingReplyContext | null = null;
const subscribers = new Set<(ctx: PendingReplyContext | null) => void>();

/** Stash a snippet and notify any mounted drawer. */
export function setPendingReplyContext(ctx: PendingReplyContext | null): void {
  pending = ctx;
  subscribers.forEach((fn) => fn(pending));
}

/** Read *and clear* the pending snippet — used by the drawer on mount so a
 * stale snippet never resurfaces on a later remount. */
export function consumePendingReplyContext(): PendingReplyContext | null {
  const ctx = pending;
  pending = null;
  return ctx;
}

/** Subscribe to new picks while the drawer is already mounted. */
export function subscribePendingReplyContext(fn: (ctx: PendingReplyContext | null) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

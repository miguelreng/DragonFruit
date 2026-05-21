/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Tiny event bus so the editor (which lives inside `packages/editor`) can
 * ask the host app to open the floating block-comment popover without us
 * adding more callbacks to the editor's public props.
 *
 * Events are dispatched on `editor.view.dom` (bubbles: true) and
 * intercepted on `window` by the page editor body.
 */

export const BLOCK_COMMENT_REQUEST_EVENT = "dragonfruit:request-block-comment";

export type BlockCommentRequestDetail = {
  /** UUID stamped on the BlockComment mark — both the anchor key in
   * the DOM (`data-block-comment-id`) and the `block_id` we POST. */
  commentId: string;
  /** Roll back the mark if the user dismisses without posting. The
   * host invokes this from `onCancelEmpty` so orphan dotted
   * underlines never linger on the doc. */
  cancel: () => void;
};

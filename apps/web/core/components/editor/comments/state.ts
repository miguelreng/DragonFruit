/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Tiny event bus so the editor (which lives inside `packages/editor`) can ask
 * the host app to open a comment composer popover or toggle the comments side panel,
 * without us adding more callbacks to the editor's public props.
 *
 * Events are dispatched on `editor.view.dom` and intercepted by host components
 * mounted next to the editor.
 */

export const BLOCK_COMMENT_REQUEST_EVENT = "dragonfruit:request-block-comment";
export const BLOCK_COMMENT_TOGGLE_PANEL_EVENT = "dragonfruit:toggle-comments-panel";

export type BlockCommentRequestDetail = {
  commentId: string;
  cancel: () => void;
};

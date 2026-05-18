/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Mark, mergeAttributes } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";

export type BlockCommentAttrs = {
  commentId: string | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.BLOCK_COMMENT]: {
      /** Wrap the current selection with a comment marker tied to a UUID. */
      setBlockComment: (commentId: string) => ReturnType;
      /** Remove any block-comment marker overlapping the current selection. */
      unsetBlockComment: () => ReturnType;
    };
  }
}

/**
 * A text-range mark that flags a span as the target of one or more block comments.
 * The mark stores a single `data-block-comment-id` attribute; the actual thread content
 * lives in the Django `PageBlockComment` table keyed by that id.
 *
 * Rendering: a subtle dotted underline + cursor:help. Hover styles tighten via CSS.
 */
export const BlockCommentExtension = Mark.create({
  name: CORE_EXTENSIONS.BLOCK_COMMENT,
  exitable: true,
  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-comment-id"),
        renderHTML: (attrs) => {
          if (!attrs.commentId) return {};
          return { "data-block-comment-id": attrs.commentId };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-block-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "dragonfruit-block-comment",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setBlockComment:
        (commentId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId }),
      unsetBlockComment:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

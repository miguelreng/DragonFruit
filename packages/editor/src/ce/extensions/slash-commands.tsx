/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Sparkles } from "@plane/icons";
// extensions
import type { TSlashCommandAdditionalOption } from "@/extensions";
// types
import type { IEditorProps } from "@/types";

type Props = Pick<IEditorProps, "disabledExtensions" | "flaggedExtensions">;

/**
 * DragonFruit: `/agent` slash command.
 *
 * The editor dispatches a `dragonfruit:agent-invoke` CustomEvent with
 * best-effort context about the current paragraph so the floating Ask AI bar
 * can pick it up and prefill its working context.
 */
export const coreEditorAdditionalSlashCommandOptions = (_props: Props): TSlashCommandAdditionalOption[] => [
  {
    commandKey: "agent",
    key: "agent",
    title: "Ask AI",
    description: "Open the writing AI bar with the current block as context.",
    searchTerms: ["ai", "agent", "assistant", "delegate", "draft"],
    icon: <Sparkles className="size-3.5" />,
    section: "general",
    pushAfter: "text",
    command: ({ editor, range }) => {
      // Pull the paragraph the slash was invoked from (best-effort).
      const $from = editor.state.doc.resolve(range.from);
      const blockNode = $from.node($from.depth);
      const paragraphText = blockNode?.textContent ?? "";
      const blockId = blockNode?.attrs?.id ?? null;
      const selectionText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " ");

      // Remove the `/agent` trigger so the slash doesn't linger in the doc.
      editor.chain().focus().deleteRange(range).run();

      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent("dragonfruit:agent-invoke", {
          detail: { paragraphText, selectionText, blockId },
        })
      );
    },
  },
];

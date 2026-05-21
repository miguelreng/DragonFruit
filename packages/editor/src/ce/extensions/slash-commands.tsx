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
 * The editor doesn't talk to any model directly. It deletes the slash trigger
 * and dispatches a `dragonfruit:agent-invoke` CustomEvent with context about
 * the current paragraph. The web app's AgentDispatchListener catches it,
 * collects a prompt from the user, and POSTs to the workspace's configured
 * agent webhook. Whatever's on the other end is free to write back via the
 * regular Pages/Issues API.
 */
export const coreEditorAdditionalSlashCommandOptions = (_props: Props): TSlashCommandAdditionalOption[] => [
  {
    commandKey: "agent",
    key: "agent",
    title: "Ask an agent",
    description: "Hand the current block to your workspace's agent.",
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
      const selectionText = editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        " "
      );

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

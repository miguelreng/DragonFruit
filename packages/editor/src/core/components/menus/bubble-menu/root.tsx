/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isNodeSelection } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { BubbleMenu, useEditorState } from "@tiptap/react";
import type { BubbleMenuProps } from "@tiptap/react";
import { MessageCircle, Sparkles } from "@plane/icons";
import { useEffect, useState, useRef } from "react";
import { v4 as generateUuid } from "uuid";
// plane utils
import { cn } from "@plane/utils";
// components
import { GoogleLogo } from "@/components/logos";
import type { EditorMenuItem } from "@/components/menus";
import {
  BackgroundColorItem,
  BoldItem,
  BubbleMenuColorSelector,
  BubbleMenuNodeSelector,
  CodeItem,
  ItalicItem,
  StrikeThroughItem,
  TextAlignItem,
  TextColorItem,
  UnderLineItem,
} from "@/components/menus";
// constants
import { COLORS_LIST } from "@/constants/common";
import { CORE_EXTENSIONS } from "@/constants/extension";
// extensions
import { isCellSelection } from "@/extensions/table/table/utilities/helpers";
// types
import type { IEditorPropsExtended, TEditorCommands, TExtensions } from "@/types";
// local imports
import { TextAlignmentSelector } from "./alignment-selector";
import { BubbleMenuLinkSelector } from "./link-selector";

type EditorBubbleMenuProps = Omit<BubbleMenuProps, "children">;

export type EditorStateType = {
  code: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  left: boolean;
  right: boolean;
  center: boolean;
  color:
    | {
        key: string;
        label: string;
        textColor: string;
        backgroundColor: string;
      }
    | undefined;
  backgroundColor:
    | {
        key: string;
        label: string;
        textColor: string;
        backgroundColor: string;
      }
    | undefined;
};

type Props = {
  disabledExtensions: TExtensions[];
  editor: Editor;
  extendedEditorProps: IEditorPropsExtended;
  flaggedExtensions: TExtensions[];
};

export function EditorBubbleMenu(props: Props) {
  const { editor } = props;
  // states
  const [isSelecting, setIsSelecting] = useState(false);
  // refs
  const menuRef = useRef<HTMLDivElement>(null);

  const formattingItems = {
    code: CodeItem(editor),
    bold: BoldItem(editor),
    italic: ItalicItem(editor),
    underline: UnderLineItem(editor),
    strikethrough: StrikeThroughItem(editor),
    "text-align": TextAlignItem(editor),
  } satisfies {
    [K in TEditorCommands]?: EditorMenuItem<K>;
  };

  const editorState: EditorStateType = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) => ({
      code: formattingItems.code.isActive(),
      bold: formattingItems.bold.isActive(),
      italic: formattingItems.italic.isActive(),
      underline: formattingItems.underline.isActive(),
      strikethrough: formattingItems.strikethrough.isActive(),
      left: formattingItems["text-align"].isActive({ alignment: "left" }),
      right: formattingItems["text-align"].isActive({ alignment: "right" }),
      center: formattingItems["text-align"].isActive({ alignment: "center" }),
      color: COLORS_LIST.find((c) => TextColorItem(activeEditor).isActive({ color: c.key })),
      backgroundColor: COLORS_LIST.find((c) => BackgroundColorItem(activeEditor).isActive({ color: c.key })),
    }),
  });

  const basicFormattingOptions = editorState.code
    ? [formattingItems.code]
    : [formattingItems.bold, formattingItems.italic, formattingItems.underline, formattingItems.strikethrough];

  const bubbleMenuProps: EditorBubbleMenuProps = {
    editor,
    shouldShow: ({ state, editor: activeEditor }) => {
      const { selection } = state;
      const { empty } = selection;

      if (
        empty ||
        !activeEditor.isEditable ||
        activeEditor.isActive(CORE_EXTENSIONS.IMAGE) ||
        activeEditor.isActive(CORE_EXTENSIONS.CUSTOM_IMAGE) ||
        isNodeSelection(selection) ||
        isCellSelection(selection) ||
        isSelecting
      ) {
        return false;
      }
      return true;
    },
    tippyOptions: {
      moveTransition: "transform 0.15s ease-out",
      duration: [300, 0],
      zIndex: 90,
      onShow: () => {
        if (editor.storage.link) {
          editor.storage.link.isBubbleMenuOpen = true;
        }
        editor.commands.addActiveDropbarExtension("bubble-menu");
      },
      onHide: () => {
        if (editor.storage.link) {
          editor.storage.link.isBubbleMenuOpen = false;
        }
        setTimeout(() => {
          editor.commands.removeActiveDropbarExtension("bubble-menu");
        }, 0);
      },
      onHidden: () => {
        if (editor.storage.link) {
          editor.storage.link.isBubbleMenuOpen = false;
        }
        setTimeout(() => {
          editor.commands.removeActiveDropbarExtension("bubble-menu");
        }, 0);
      },
    },
  };

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;

      function handleMouseMove() {
        if (!editor.state.selection.empty) {
          setIsSelecting(true);
          document.removeEventListener("mousemove", handleMouseMove);
        }
      }

      function handleMouseUp() {
        setIsSelecting(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      }

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [editor]);

  return (
    <BubbleMenu {...bubbleMenuProps}>
      {!isSelecting && (
        <div
          ref={menuRef}
          className="horizontal-scrollbar flex scrollbar-xs divide-x divide-subtle-1 overflow-x-scroll rounded-lg border border-subtle bg-surface-1 py-2 shadow-raised-200"
        >
          <div className="px-2">
            <BubbleMenuNodeSelector editor={editor} />
          </div>
          {!editorState.code && (
            <div className="px-2">
              <BubbleMenuLinkSelector editor={editor} />
            </div>
          )}
          {!editorState.code && (
            <div className="px-2">
              <BubbleMenuColorSelector editor={editor} editorState={editorState} />
            </div>
          )}
          <div className="flex gap-0.5 px-2">
            {basicFormattingOptions.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={(e) => {
                  item.command();
                  e.stopPropagation();
                }}
                className={cn(
                  "grid size-7 place-items-center rounded-lg text-tertiary transition-colors hover:bg-layer-1 active:bg-layer-1",
                  {
                    "bg-layer-1 text-primary": editorState[item.key],
                  }
                )}
              >
                <item.icon className="size-4" />
              </button>
            ))}
          </div>
          <TextAlignmentSelector editor={editor} editorState={editorState} />
          {/* Comment-on-selection action. Mirrors the slash command
              `/Comment on this block`, but anchors the BlockComment
              mark to the *current text selection* rather than the
              whole block — closer to the Notion / Google Docs pattern
              the user expects when highlighting text. The host app
              listens for `dragonfruit:request-block-comment` and pops
              the composer. */}
          {/* Reply to selection with Atlas. Same DOM event-bus pattern as
              the comment button below — the host app catches
              `dragonfruit:reply-to-selection` on `window`, opens the Atlas
              drawer, and pins the highlighted passage as a "replying to"
              chip in the composer. No mark is left on the doc; the snippet
              text travels in the event payload. */}
          <div className="flex gap-0.5 px-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const { from, to } = editor.state.selection;
                if (from === to) return;
                const text = editor.state.doc.textBetween(from, to, "\n").trim();
                if (!text) return;
                editor.view.dom.dispatchEvent(
                  new CustomEvent("dragonfruit:reply-to-selection", {
                    bubbles: true,
                    detail: { text, from, to },
                  })
                );
              }}
              aria-label="Reply to selection with Atlas"
              title="Reply with Atlas"
              className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-12 font-medium text-accent-primary transition-colors hover:bg-accent-subtle hover:text-accent-secondary active:bg-accent-subtle"
            >
              <Sparkles className="size-4" />
              <span>Reply with Atlas</span>
            </button>
          </div>
          <div className="flex gap-0.5 px-2">
            {/* Select-to-explain: the host app catches
                `dragonfruit:explain-selection` and shows a Wikipedia
                summary card anchored at the selection. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const { from, to } = editor.state.selection;
                if (from === to) return;
                const text = editor.state.doc.textBetween(from, to, " ").trim();
                if (!text) return;
                const coords = editor.view.coordsAtPos(from);
                editor.view.dom.dispatchEvent(
                  new CustomEvent("dragonfruit:explain-selection", {
                    bubbles: true,
                    detail: { text, x: coords.left, y: coords.bottom },
                  })
                );
              }}
              aria-label="Explain selection"
              title="Explain"
              className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-12 font-medium text-tertiary transition-colors hover:bg-layer-1 hover:text-primary active:bg-layer-1"
            >
              <GoogleLogo className="size-3.5 flex-shrink-0" />
              <span>Explain</span>
            </button>
          </div>
          <div className="flex gap-0.5 px-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const { from, to } = editor.state.selection;
                if (from === to) return;
                const commentId = generateUuid();
                editor.chain().focus().setBlockComment(commentId).run();
                editor.view.dom.dispatchEvent(
                  new CustomEvent("dragonfruit:request-block-comment", {
                    bubbles: true,
                    detail: {
                      commentId,
                      cancel: () => {
                        // Roll back the mark if the user dismisses the
                        // composer without posting — otherwise an
                        // orphan `data-block-comment-id` lingers on
                        // the doc with no thread behind it.
                        editor.chain().setTextSelection({ from, to }).unsetBlockComment().setTextSelection(to).run();
                      },
                    },
                  })
                );
              }}
              aria-label="Comment on selection"
              title="Comment"
              className="grid size-7 place-items-center rounded-lg text-tertiary transition-colors hover:bg-layer-1 hover:text-primary active:bg-layer-1"
            >
              <MessageCircle className="size-4" />
            </button>
          </div>
        </div>
      )}
    </BubbleMenu>
  );
}

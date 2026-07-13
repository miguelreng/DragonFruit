/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {
  ALargeSmall,
  CaseSensitive,
  ChartNoAxesColumn,
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  ImageIcon,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  ListTodo,
  MessageCircle,
  MessageSquareText,
  MinusSquare,
  PanelRightOpen,
  PenTool,
  Plus,
  Smile,
  Sparkles,
  StickyNote,
  Table,
  TextQuote,
} from "@plane/icons";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { v4 as generateUuid } from "uuid";
// constants
import { COLORS_LIST } from "@/constants/common";
import { CORE_EXTENSIONS } from "@/constants/extension";
// helpers
import {
  insertTableCommand,
  toggleBlockquote,
  toggleBulletList,
  toggleOrderedList,
  toggleTaskList,
  toggleHeading,
  toggleTextColor,
  toggleBackgroundColor,
  insertImage,
  insertCallout,
  setText,
  openEmojiPicker,
} from "@/helpers/editor-commands";
// plane editor extensions
import { coreEditorAdditionalSlashCommandOptions } from "@/plane-editor/extensions";
// types
import type { CommandProps, ISlashCommandItem, TSlashCommandSectionKeys } from "@/types";
// local types
import type { TExtensionProps, TSlashCommandAdditionalOption } from "./root";

export type TSlashCommandSection = {
  key: TSlashCommandSectionKeys;
  title?: string;
  items: ISlashCommandItem[];
};

const applyCalloutPreset = (
  editor: CommandProps["editor"],
  range: CommandProps["range"],
  preset: { emoji: string; background: string | null }
) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      "editor-calloutComponent-logo",
      JSON.stringify({
        in_use: "emoji",
        emoji: { value: preset.emoji },
      })
    );
    if (preset.background) window.localStorage.setItem("editor-calloutComponent-background", preset.background);
    else window.localStorage.removeItem("editor-calloutComponent-background");
  }
  insertCallout(editor, range);
};

const insertDocEmbed = ({
  editor,
  range,
  embedType,
  attrs,
}: CommandProps & {
  embedType: "whiteboard" | "sticky" | "task_view" | "google_drive";
  attrs: {
    entityId: string;
    projectId?: string;
    workspaceSlug: string;
    title?: string;
    snapshot?: unknown;
  };
}) => {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent({
      type: CORE_EXTENSIONS.DOC_EMBED,
      attrs: {
        embed_type: embedType,
        entity_identifier: attrs.entityId,
        project_identifier: attrs.projectId,
        workspace_identifier: attrs.workspaceSlug,
        title: attrs.title,
        snapshot: attrs.snapshot,
      },
    })
    .run();
};

export const getSlashCommandFilteredSections =
  (args: TExtensionProps) =>
  ({ query }: { query: string }): TSlashCommandSection[] => {
    const { additionalOptions: externalAdditionalOptions, disabledExtensions, embedConfig, flaggedExtensions } = args;
    const SLASH_COMMAND_SECTIONS: TSlashCommandSection[] = [
      {
        key: "general",
        items: [
          {
            commandKey: "text",
            key: "text",
            title: "Text",
            description: "Just start typing with plain text.",
            searchTerms: ["p", "paragraph"],
            icon: <CaseSensitive className="size-3.5" />,
            command: ({ editor, range }) => setText(editor, range),
          },
          {
            commandKey: "h1",
            key: "h1",
            title: "Heading 1",
            description: "Big section heading.",
            searchTerms: ["title", "big", "large"],
            icon: <Heading1 className="size-3.5" />,
            command: ({ editor, range }) => toggleHeading(editor, 1, range),
          },
          {
            commandKey: "h2",
            key: "h2",
            title: "Heading 2",
            description: "Medium section heading.",
            searchTerms: ["subtitle", "medium"],
            icon: <Heading2 className="size-3.5" />,
            command: ({ editor, range }) => toggleHeading(editor, 2, range),
          },
          {
            commandKey: "h3",
            key: "h3",
            title: "Heading 3",
            description: "Small section heading.",
            searchTerms: ["subtitle", "small"],
            icon: <Heading3 className="size-3.5" />,
            command: ({ editor, range }) => toggleHeading(editor, 3, range),
          },
          {
            commandKey: "h4",
            key: "h4",
            title: "Heading 4",
            description: "Small section heading.",
            searchTerms: ["subtitle", "small"],
            icon: <Heading4 className="size-3.5" />,
            command: ({ editor, range }) => toggleHeading(editor, 4, range),
          },
          {
            commandKey: "h5",
            key: "h5",
            title: "Heading 5",
            description: "Small section heading.",
            searchTerms: ["subtitle", "small"],
            icon: <Heading5 className="size-3.5" />,
            command: ({ editor, range }) => toggleHeading(editor, 5, range),
          },
          {
            commandKey: "h6",
            key: "h6",
            title: "Heading 6",
            description: "Small section heading.",
            searchTerms: ["subtitle", "small"],
            icon: <Heading6 className="size-3.5" />,
            command: ({ editor, range }) => toggleHeading(editor, 6, range),
          },

          {
            commandKey: "numbered-list",
            key: "numbered-list",
            title: "Numbered list",
            description: "Create a numbered list.",
            searchTerms: ["ordered"],
            icon: <ListOrdered className="size-3.5" />,
            command: ({ editor, range }) => toggleOrderedList(editor, range),
          },
          {
            commandKey: "bulleted-list",
            key: "bulleted-list",
            title: "Bulleted list",
            description: "Create a bulleted list.",
            searchTerms: ["unordered", "point"],
            icon: <List className="size-3.5" />,
            command: ({ editor, range }) => toggleBulletList(editor, range),
          },
          {
            commandKey: "to-do-list",
            key: "to-do-list",
            title: "To-do list",
            description: "Create a to-do list.",
            searchTerms: ["todo", "task", "list", "check", "checkbox"],
            icon: <ListTodo className="size-3.5" />,
            command: ({ editor, range }) => toggleTaskList(editor, range),
          },
          {
            commandKey: "table",
            key: "table",
            title: "Table",
            description: "Create a table",
            searchTerms: ["table", "cell", "db", "data", "tabular"],
            icon: <Table className="size-3.5" />,
            command: ({ editor, range }) => insertTableCommand(editor, range),
          },
          {
            commandKey: "quote",
            key: "quote",
            title: "Quote",
            description: "Capture a quote.",
            searchTerms: ["blockquote"],
            icon: <TextQuote className="size-3.5" />,
            command: ({ editor, range }) => toggleBlockquote(editor, range),
          },
          {
            commandKey: "code",
            key: "code",
            title: "Code",
            description: "Capture a code snippet.",
            searchTerms: ["codeblock"],
            icon: <Code2 className="size-3.5" />,
            command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
          },
          {
            commandKey: "callout",
            key: "callout",
            title: "Callout",
            icon: <MessageSquareText className="size-3.5" />,
            description: "Insert callout",
            searchTerms: ["callout", "comment", "message", "info", "alert"],
            command: ({ editor, range }: CommandProps) => insertCallout(editor, range),
          },
          {
            commandKey: "callout",
            key: "callout-tip",
            title: "Tip callout",
            icon: <Sparkles className="size-3.5" />,
            description: "Callout with a tip preset",
            searchTerms: ["callout", "tip", "hint", "craft"],
            command: ({ editor, range }: CommandProps) =>
              applyCalloutPreset(editor, range, { emoji: "128161", background: "yellow" }),
          },
          {
            commandKey: "callout",
            key: "callout-warning",
            title: "Warning callout",
            icon: <MessageCircle className="size-3.5" />,
            description: "Callout with a warning preset",
            searchTerms: ["callout", "warning", "alert", "caution"],
            command: ({ editor, range }: CommandProps) =>
              applyCalloutPreset(editor, range, { emoji: "9888", background: "orange" }),
          },
          {
            commandKey: "quote",
            key: "pull-quote",
            title: "Pull quote",
            description: "Large quote block starter",
            searchTerms: ["quote", "pull", "blockquote"],
            icon: <TextQuote className="size-3.5" />,
            command: ({ editor, range }) => {
              toggleBlockquote(editor, range);
              editor.chain().focus().toggleItalic().run();
            },
          },
          {
            commandKey: "divider",
            key: "divider",
            title: "Divider",
            description: "Visually divide blocks.",
            searchTerms: ["line", "divider", "horizontal", "rule", "separate"],
            icon: <MinusSquare className="size-3.5" />,
            command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
          },
          {
            commandKey: "emoji",
            key: "emoji",
            title: "Emoji",
            description: "Insert an emoji",
            searchTerms: ["emoji", "icons", "reaction", "emoticon", "emotags"],
            icon: <Smile className="size-3.5" />,
            command: ({ editor, range }) => {
              openEmojiPicker(editor, range);
            },
          },
        ],
      },
      ...(() => {
        const workItems: ISlashCommandItem[] = [];
        if (embedConfig?.issue?.onPickerRequest) {
          workItems.push({
            commandKey: "issue-embed",
            key: "embed-work-item",
            title: "Embed task",
            description: "Search and link an existing task",
            searchTerms: ["embed", "issue", "task", "task", "link"],
            icon: <LinkIcon className="size-3.5" />,
            command: ({ editor, range }: CommandProps) => {
              embedConfig.issue?.onPickerRequest?.({
                mode: "embed",
                insertEmbed: ({ workItemId, projectId, workspaceSlug }) => {
                  editor
                    .chain()
                    .focus()
                    .deleteRange(range)
                    .insertContent({
                      type: CORE_EXTENSIONS.WORK_ITEM_EMBED,
                      attrs: {
                        entity_identifier: workItemId,
                        project_identifier: projectId,
                        workspace_identifier: workspaceSlug,
                        entity_name: "work_item",
                      },
                    })
                    .run();
                },
              });
            },
          });
          workItems.push({
            commandKey: "issue-embed",
            key: "new-work-item",
            title: "New task",
            description: "Create a task here and embed it",
            searchTerms: ["new", "create", "task", "task", "issue"],
            icon: <Plus className="size-3.5" />,
            command: ({ editor, range }: CommandProps) => {
              embedConfig.issue?.onPickerRequest?.({
                mode: "create",
                insertEmbed: ({ workItemId, projectId, workspaceSlug }) => {
                  editor
                    .chain()
                    .focus()
                    .deleteRange(range)
                    .insertContent({
                      type: CORE_EXTENSIONS.WORK_ITEM_EMBED,
                      attrs: {
                        entity_identifier: workItemId,
                        project_identifier: projectId,
                        workspace_identifier: workspaceSlug,
                        entity_name: "work_item",
                      },
                    })
                    .run();
                },
              });
            },
          });
        }
        if (embedConfig?.issue?.onConvertToTask) {
          const issueConfig = embedConfig.issue;
          const sourceProjectId = issueConfig.projectId;
          const sourceWorkspaceSlug = issueConfig.workspaceSlug;
          workItems.push({
            commandKey: "issue-embed",
            key: "turn-into-task",
            title: "Turn into task",
            description: "Convert this line into a task in the current project",
            searchTerms: ["convert", "turn", "task", "issue", "create", "checkbox", "todo", "checklist"],
            icon: <CheckSquare className="size-3.5" />,
            command: ({ editor, range }: CommandProps) => {
              // Prefer the enclosing taskItem; otherwise fall back to a top-level paragraph.
              const { $from } = editor.state.selection;
              let blockDepth = -1;
              for (let d = $from.depth; d >= 0; d--) {
                if ($from.node(d).type.name === CORE_EXTENSIONS.TASK_ITEM) {
                  blockDepth = d;
                  break;
                }
              }
              if (blockDepth === -1) {
                for (let d = $from.depth; d >= 0; d--) {
                  const n = $from.node(d);
                  if (n.type.name === CORE_EXTENSIONS.PARAGRAPH && d === 1) {
                    // top-level paragraph (direct child of doc)
                    blockDepth = d;
                    break;
                  }
                }
              }
              const blockText = blockDepth === -1 ? "" : $from.node(blockDepth).textContent.trim();
              if (blockDepth === -1 || !blockText) {
                editor.chain().focus().deleteRange(range).run();
                return;
              }
              const blockStart = $from.before(blockDepth);
              const blockEnd = $from.after(blockDepth);
              const nodeId = generateUuid();

              editor
                .chain()
                .focus()
                .insertContentAt(
                  { from: blockStart, to: blockEnd },
                  {
                    type: CORE_EXTENSIONS.WORK_ITEM_EMBED,
                    attrs: {
                      id: nodeId,
                      draft: true,
                      draft_title: blockText,
                      project_identifier: sourceProjectId,
                      workspace_identifier: sourceWorkspaceSlug,
                      entity_name: "work_item",
                    },
                  }
                )
                .run();

              void (async () => {
                const attrs = await issueConfig.onConvertToTask?.({ title: blockText });
                if (!attrs) return; // creation failed — leave the draft card so the user can retry
                let foundPos = -1;
                let foundAttrs: Record<string, unknown> = {};
                editor.state.doc.descendants((node: ProseMirrorNode, pos: number) => {
                  if (foundPos !== -1) return false;
                  if (node.type.name === CORE_EXTENSIONS.WORK_ITEM_EMBED && node.attrs.id === nodeId) {
                    foundPos = pos;
                    foundAttrs = node.attrs;
                    return false;
                  }
                  return true;
                });
                if (foundPos === -1) return;
                const tr = editor.state.tr.setNodeMarkup(foundPos, undefined, {
                  ...foundAttrs,
                  draft: false,
                  draft_title: undefined,
                  draft_description: undefined,
                  entity_identifier: attrs.workItemId,
                  project_identifier: attrs.projectId,
                  workspace_identifier: attrs.workspaceSlug,
                  entity_name: "work_item",
                });
                editor.view.dispatch(tr);
              })();
            },
          });
        }
        if (embedConfig?.issue?.onTranscriptRequest) {
          workItems.push({
            commandKey: "issue-embed",
            key: "spec-from-transcript",
            title: "Spec from transcript",
            description: "Paste a meeting, get a draft",
            searchTerms: ["spec", "transcript", "meeting", "ai", "summary", "draft"],
            icon: <Sparkles className="size-3.5" />,
            command: ({ editor, range }: CommandProps) => {
              editor.chain().focus().deleteRange(range).run();
              embedConfig.issue?.onTranscriptRequest?.();
            },
          });
        }
        if (embedConfig?.whiteboard?.onPickerRequest) {
          workItems.push({
            commandKey: "external-embed",
            key: "embed-whiteboard",
            title: "Whiteboard",
            description: "Embed a whiteboard canvas",
            searchTerms: ["whiteboard", "whiteboards", "canvas", "draw", "diagram", "sketch"],
            icon: <PenTool className="size-3.5" />,
            command: ({ editor, range }: CommandProps) => {
              embedConfig.whiteboard?.onPickerRequest?.({
                embedType: "whiteboard",
                mode: "embed",
                insertEmbed: (attrs) =>
                  insertDocEmbed({
                    editor,
                    range,
                    embedType: "whiteboard",
                    attrs: {
                      entityId: attrs.entityId,
                      projectId: attrs.projectId,
                      workspaceSlug: attrs.workspaceSlug,
                      title: attrs.title,
                      snapshot: attrs.snapshot,
                    },
                  }),
              });
            },
          });
        }
        if (embedConfig?.sticky?.onPickerRequest) {
          workItems.push({
            commandKey: "external-embed",
            key: "embed-sticky",
            title: "Sticky",
            description: "Embed a sticky note",
            searchTerms: ["sticky", "stickies", "note", "notes", "memo", "post-it"],
            icon: <StickyNote className="size-3.5" />,
            command: ({ editor, range }: CommandProps) => {
              embedConfig.sticky?.onPickerRequest?.({
                embedType: "sticky",
                mode: "embed",
                insertEmbed: (attrs) =>
                  insertDocEmbed({
                    editor,
                    range,
                    embedType: "sticky",
                    attrs: {
                      entityId: attrs.entityId,
                      projectId: attrs.projectId,
                      workspaceSlug: attrs.workspaceSlug,
                      title: attrs.title,
                      snapshot: attrs.snapshot,
                    },
                  }),
              });
            },
          });
        }
        if (embedConfig?.taskView?.onPickerRequest) {
          workItems.push({
            commandKey: "external-embed",
            key: "embed-task-view",
            title: "Task view",
            description: "Embed a saved task view",
            searchTerms: ["task view", "task views", "view", "views", "issues", "tasks", "filter", "list"],
            icon: <ListChecks className="size-3.5" />,
            command: ({ editor, range }: CommandProps) => {
              embedConfig.taskView?.onPickerRequest?.({
                embedType: "task_view",
                mode: "embed",
                insertEmbed: (attrs) =>
                  insertDocEmbed({
                    editor,
                    range,
                    embedType: "task_view",
                    attrs: {
                      entityId: attrs.entityId,
                      projectId: attrs.projectId,
                      workspaceSlug: attrs.workspaceSlug,
                      title: attrs.title,
                      snapshot: attrs.snapshot,
                    },
                  }),
              });
            },
          });
        }
        if (embedConfig?.googleDrive?.onPickerRequest) {
          workItems.push({
            commandKey: "external-embed",
            key: "embed-google-drive",
            title: "Google Drive file",
            description: "Embed a Google Drive file",
            searchTerms: ["google drive", "drive", "doc", "docs", "sheet", "slide", "file"],
            icon: <LinkIcon className="size-3.5" />,
            command: ({ editor, range }: CommandProps) => {
              embedConfig.googleDrive?.onPickerRequest?.({
                embedType: "google_drive",
                mode: "embed",
                insertEmbed: (attrs) =>
                  insertDocEmbed({
                    editor,
                    range,
                    embedType: "google_drive",
                    attrs: {
                      entityId: attrs.entityId,
                      projectId: attrs.projectId,
                      workspaceSlug: attrs.workspaceSlug,
                      title: attrs.title,
                      snapshot: attrs.snapshot,
                    },
                  }),
              });
            },
          });
        }
        if (embedConfig?.chart?.widgetCallback) {
          workItems.push({
            commandKey: "external-embed",
            key: "insert-chart",
            title: "Chart",
            description: "Insert a data chart",
            searchTerms: ["chart", "graph", "bar", "line", "area", "pie", "donut", "data", "visualization"],
            icon: <ChartNoAxesColumn className="size-3.5" />,
            command: ({ editor, range }: CommandProps) => {
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .insertContent({
                  type: CORE_EXTENSIONS.CHART,
                  attrs: {
                    chart: embedConfig.chart?.defaultChart,
                  },
                })
                .run();
            },
          });
        }
        workItems.push({
          commandKey: "issue-embed",
          key: "add-block-comment",
          title: "Comment on this block",
          description: "Leave a comment thread on the current block",
          searchTerms: ["comment", "feedback", "review", "suggest", "thread"],
          icon: <MessageCircle className="size-3.5" />,
          command: ({ editor, range }: CommandProps) => {
            // Remove the slash text first.
            editor.chain().focus().deleteRange(range).run();
            // Mark the parent block's text range with a fresh comment id.
            const { $from } = editor.state.selection;
            const start = $from.start();
            const end = $from.end();
            if (start === end) return; // empty block — nothing to mark
            const commentId = generateUuid();
            editor
              .chain()
              .setTextSelection({ from: start, to: end })
              .setBlockComment(commentId)
              .setTextSelection($from.pos)
              .run();
            // Ask the host to open the composer popover.
            editor.view.dom.dispatchEvent(
              new CustomEvent("dragonfruit:request-block-comment", {
                bubbles: true,
                detail: {
                  commentId,
                  cancel: () => {
                    editor
                      .chain()
                      .setTextSelection({ from: start, to: end })
                      .unsetBlockComment()
                      .setTextSelection($from.pos)
                      .run();
                  },
                },
              })
            );
          },
        });
        workItems.push({
          commandKey: "issue-embed",
          key: "open-comments-panel",
          title: "Show comments",
          description: "Toggle the comments side panel",
          searchTerms: ["comments", "show", "panel", "review", "discussion"],
          icon: <PanelRightOpen className="size-3.5" />,
          command: ({ editor, range }: CommandProps) => {
            editor.chain().focus().deleteRange(range).run();
            editor.view.dom.dispatchEvent(new CustomEvent("dragonfruit:toggle-comments-panel", { bubbles: true }));
          },
        });
        if (workItems.length === 0) return [];
        return [
          {
            key: "work" as const,
            title: "Work",
            items: workItems,
          } as TSlashCommandSection,
        ];
      })(),
      {
        key: "text-colors",
        title: "Colors",
        items: [
          {
            commandKey: "text-color",
            key: "text-color-default",
            title: "Default",
            description: "Change text color",
            searchTerms: ["color", "text", "default"],
            icon: <ALargeSmall className="size-3.5 text-primary" />,
            command: ({ editor, range }) => toggleTextColor(undefined, editor, range),
          },
          ...COLORS_LIST.map(
            (color) =>
              ({
                commandKey: "text-color",
                key: `text-color-${color.key}`,
                title: color.label,
                description: "Change text color",
                searchTerms: ["color", "text", color.label],

                icon: (
                  <ALargeSmall
                    className="size-3.5"
                    style={{
                      color: color.textColor,
                    }}
                  />
                ),

                command: ({ editor, range }) => toggleTextColor(color.key, editor, range),
              }) as ISlashCommandItem
          ),
        ],
      },
      {
        key: "background-colors",
        title: "Background colors",
        items: [
          {
            commandKey: "background-color",
            key: "background-color-default",
            title: "Default background",
            description: "Change background color",
            searchTerms: ["color", "bg", "background", "default"],
            icon: <ALargeSmall className="size-3.5" />,
            iconContainerStyle: {
              borderRadius: "4px",
              backgroundColor: "var(--background-color-surface-1)",
              border: "1px solid var(--border-color-strong)",
            },
            command: ({ editor, range }) => toggleTextColor(undefined, editor, range),
          },
          ...COLORS_LIST.map(
            (color) =>
              ({
                commandKey: "background-color",
                key: `background-color-${color.key}`,
                title: color.label,
                description: "Change background color",
                searchTerms: ["color", "bg", "background", color.label],
                icon: <ALargeSmall className="size-3.5" />,

                iconContainerStyle: {
                  borderRadius: "4px",
                  backgroundColor: color.backgroundColor,
                },

                command: ({ editor, range }) => toggleBackgroundColor(color.key, editor, range),
              }) as ISlashCommandItem
          ),
        ],
      },
    ];

    const internalAdditionalOptions: TSlashCommandAdditionalOption[] = [];
    if (!disabledExtensions?.includes("image")) {
      internalAdditionalOptions.push({
        commandKey: "image",
        key: "image",
        title: "Image",
        icon: <ImageIcon className="size-3.5" />,
        description: "Insert an image",
        searchTerms: ["img", "photo", "picture", "media", "upload"],
        command: ({ editor, range }: CommandProps) => insertImage({ editor, event: "insert", range }),
        section: "general",
        pushAfter: "code",
      });
    }

    [
      ...internalAdditionalOptions,
      ...(externalAdditionalOptions ?? []),
      ...coreEditorAdditionalSlashCommandOptions({
        disabledExtensions,
        flaggedExtensions,
      }),
    ]?.forEach((item) => {
      const sectionToPushTo = SLASH_COMMAND_SECTIONS.find((s) => s.key === item.section) ?? SLASH_COMMAND_SECTIONS[0];
      const itemIndexToPushAfter = sectionToPushTo.items.findIndex((i) => i.commandKey === item.pushAfter);
      if (itemIndexToPushAfter !== -1) {
        sectionToPushTo.items.splice(itemIndexToPushAfter + 1, 0, item);
      } else {
        sectionToPushTo.items.push(item);
      }
    });

    const lowercaseQuery = typeof query === "string" ? query.toLowerCase() : null;
    // "/wiki photosynthesis" — the first word selects an argument-taking
    // command; the rest is its argument and must not break the match.
    const [queryCommandWord = ""] = lowercaseQuery?.split(/\s+/) ?? [];
    const queryHasArgument = !!lowercaseQuery?.trim().includes(" ");
    for (const section of SLASH_COMMAND_SECTIONS) {
      if (lowercaseQuery === null) {
        section.items = [];
        continue;
      }
      section.items = section.items.filter((item) => {
        const matchesFullQuery =
          item.title.toLowerCase().includes(lowercaseQuery) ||
          item.description.toLowerCase().includes(lowercaseQuery) ||
          item.searchTerms.some((t) => t.includes(lowercaseQuery));
        if (!queryHasArgument) return matchesFullQuery;
        return (
          matchesFullQuery ||
          (item.acceptsArguments === true &&
            (item.key === queryCommandWord || item.searchTerms.includes(queryCommandWord)))
        );
      });
    }

    return SLASH_COMMAND_SECTIONS.filter((s) => s.items.length !== 0);
  };

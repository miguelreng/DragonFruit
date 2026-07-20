/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TableMap } from "@tiptap/pm/tables";
import type { Editor } from "@tiptap/react";
import { v4 as generateUuid } from "uuid";
import { CheckSquare, Expand, MoveHorizontal } from "@plane/icons";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// plane editor types
import type { TEmbedConfig } from "@/plane-editor/types/issue-embed";
// types
import type { BlockMenuOption } from "./block-menu";

const findSelectedTable = (editor: Editor): { tableNode: ProseMirrorNode | null; tablePos: number } => {
  const { state } = editor;
  const selectedNode = state.selection.content().content.firstChild;

  if (selectedNode?.type.name === CORE_EXTENSIONS.TABLE) {
    return {
      tableNode: selectedNode,
      tablePos: state.selection.from,
    };
  }

  return { tableNode: null, tablePos: -1 };
};

const distributeTableColumns = (editor: Editor, getTargetWidth: (tablePos: number) => number | null): void => {
  try {
    const { state, view } = editor;

    // Find the selected table
    const { tableNode, tablePos } = findSelectedTable(editor);
    if (!tableNode) return;

    const targetWidth = getTargetWidth(tablePos);
    if (!targetWidth || isNaN(targetWidth) || targetWidth <= 0) return;

    // Calculate equal width for each column
    const map = TableMap.get(tableNode);
    const equalWidth = Math.floor(targetWidth / map.width);

    // Update all cell widths
    const tr = state.tr;
    const tableStart = tablePos + 1;
    const updatedCells = new Set<number>();

    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const cellIndex = row * map.width + col;
        const cellPos = map.map[cellIndex];

        // Skip if cell already updated (for merged cells)
        if (updatedCells.has(cellPos)) continue;

        const cell = state.doc.nodeAt(tableStart + cellPos);
        if (!cell) continue;

        // Handle colspan for merged cells
        const colspan = cell.attrs.colspan || 1;
        tr.setNodeMarkup(tableStart + cellPos, null, {
          ...cell.attrs,
          colwidth: Array(colspan).fill(equalWidth),
        });

        updatedCells.add(cellPos);
      }
    }

    view.dispatch(tr);
  } catch (error) {
    console.error("Error distributing table columns:", error);
  }
};

const setTableToFullWidth = (editor: Editor): void =>
  distributeTableColumns(editor, () => {
    // Get content width from CSS variable
    const editorContainer = editor.view.dom.closest(".editor-container");
    if (!editorContainer) return null;

    const contentWidthVar = getComputedStyle(editorContainer).getPropertyValue("--editor-content-width").trim();
    if (!contentWidthVar) return null;

    return parseInt(contentWidthVar);
  });

const setTableToPageWidth = (editor: Editor): void =>
  distributeTableColumns(editor, (tablePos) => {
    // The table wrapper is an editor-full-width-block whose padding aligns the
    // table with the content column; the inner width is the full page width
    const wrapper = editor.view.nodeDOM(tablePos);
    if (!(wrapper instanceof HTMLElement)) return null;

    const wrapperStyles = getComputedStyle(wrapper);
    return wrapper.clientWidth - parseFloat(wrapperStyles.paddingLeft) - parseFloat(wrapperStyles.paddingRight);
  });

const turnSelectedBlockIntoTask = (editor: Editor, embedConfig: TEmbedConfig) => {
  const issueConfig = embedConfig.issue;
  if (!issueConfig?.onConvertToTask) return;
  const { $from } = editor.state.selection;
  let blockDepth = -1;
  for (let d = $from.depth; d >= 0; d--) {
    const name = $from.node(d).type.name;
    if (name === CORE_EXTENSIONS.TASK_ITEM) {
      blockDepth = d;
      break;
    }
  }
  if (blockDepth === -1) {
    for (let d = $from.depth; d >= 0; d--) {
      const n = $from.node(d);
      if (n.type.name === CORE_EXTENSIONS.PARAGRAPH && d === 1) {
        blockDepth = d;
        break;
      }
    }
  }
  if (blockDepth === -1) return;
  const blockText = $from.node(blockDepth).textContent.trim();
  if (!blockText) return;
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
          project_identifier: issueConfig.projectId,
          workspace_identifier: issueConfig.workspaceSlug,
          entity_name: "work_item",
        },
      }
    )
    .run();

  void issueConfig.onConvertToTask({ title: blockText }).then((attrs) => {
    if (!attrs) return;
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
  });
};

const isBlockConvertibleToTask = (editor: Editor): boolean => {
  if (editor.isActive(CORE_EXTENSIONS.TASK_ITEM)) return true;
  // top-level paragraph with text content
  const { $from } = editor.state.selection;
  if ($from.depth === 1 && $from.node(1).type.name === CORE_EXTENSIONS.PARAGRAPH) {
    return $from.node(1).textContent.trim().length > 0;
  }
  return false;
};

export const getNodeOptions = (editor: Editor, embedConfig?: TEmbedConfig): BlockMenuOption[] => [
  {
    icon: MoveHorizontal,
    key: "table-full-width",
    label: "Fit to width",
    isDisabled: !editor.isActive(CORE_EXTENSIONS.TABLE),
    onClick: () => setTableToFullWidth(editor),
  },
  {
    icon: Expand,
    key: "table-page-width",
    label: "Full width",
    isDisabled: !editor.isActive(CORE_EXTENSIONS.TABLE),
    onClick: () => setTableToPageWidth(editor),
  },
  {
    icon: CheckSquare,
    key: "turn-into-task",
    label: "Turn into task",
    isDisabled: !embedConfig?.issue?.onConvertToTask || !isBlockConvertibleToTask(editor),
    onClick: () => embedConfig && turnSelectedBlockIntoTask(editor, embedConfig),
  },
];

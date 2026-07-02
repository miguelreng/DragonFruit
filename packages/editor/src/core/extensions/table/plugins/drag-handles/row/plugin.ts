/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { findParentNodeClosestToPos } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReactRenderer } from "@tiptap/react";
// extensions
import {
  findTable,
  getTableCellWidgetDecorationPos,
  getTableNodeLocation,
} from "@/extensions/table/table/utilities/helpers";
// local imports
import type { RowDragHandleProps } from "./drag-handle";
import { RowDragHandle } from "./drag-handle";

type TableRowDragHandlePluginState = {
  decorations?: DecorationSet;
  // track table structure to detect changes
  tableHeight?: number;
  tableNodePos?: number;
  // track renderers for cleanup
  renderers?: ReactRenderer[];
  // position (before the table node) of the table currently hovered by the pointer,
  // so handles can surface on hover without first placing the cursor inside the table
  hoveredTablePos?: number;
};

const TABLE_ROW_DRAG_HANDLE_PLUGIN_KEY = new PluginKey("tableRowDragHandlePlugin");

export const TableRowDragHandlePlugin = (editor: Editor): Plugin<TableRowDragHandlePluginState> => {
  // The wrapper DOM element the pointer was last seen over, used to avoid recomputing
  // the hovered table on every mousemove that stays within the same region.
  let lastHoverWrapper: HTMLElement | null = null;

  return new Plugin<TableRowDragHandlePluginState>({
    key: TABLE_ROW_DRAG_HANDLE_PLUGIN_KEY,
    state: {
      init: () => ({}),
      apply(tr, prev, oldState, newState) {
        // Resolve the hovered table position: prefer an explicit meta update, otherwise
        // map the previous one through the transaction so it survives doc edits.
        const meta = tr.getMeta(TABLE_ROW_DRAG_HANDLE_PLUGIN_KEY) as { hoveredTablePos: number | null } | undefined;
        let hoveredTablePos = prev.hoveredTablePos;
        if (meta && "hoveredTablePos" in meta) {
          hoveredTablePos = meta.hoveredTablePos ?? undefined;
        } else if (hoveredTablePos !== undefined && tr.docChanged) {
          hoveredTablePos = tr.mapping.map(hoveredTablePos);
        }

        const hoverChanged = (prev.hoveredTablePos ?? null) !== (hoveredTablePos ?? null);
        const selectionChanged = !newState.selection.eq(oldState.selection);

        // Nothing relevant changed - keep the existing decorations as-is.
        if (!tr.docChanged && !selectionChanged && !hoverChanged) {
          return { ...prev, hoveredTablePos };
        }

        // The active table is the one containing the selection, or - when the cursor is
        // outside any table - the table currently hovered by the pointer.
        const table =
          findTable(newState.selection) ??
          (hoveredTablePos !== undefined ? getTableNodeLocation(newState.doc, hoveredTablePos) : undefined);

        if (!editor.isEditable || !table) {
          prev.renderers?.forEach((renderer) => {
            try {
              renderer.destroy();
            } catch (error) {
              console.error("Error destroying renderer:", error);
            }
          });
          return { hoveredTablePos };
        }

        const tableMap = TableMap.get(table.node);

        // Check if table structure changed (height or position)
        const tableStructureChanged = prev.tableHeight !== tableMap.height || prev.tableNodePos !== table.pos;

        let isStale = tableStructureChanged;

        // Only do position-based stale check if structure hasn't changed
        if (!isStale) {
          const mapped = prev.decorations?.map(tr.mapping, tr.doc);
          for (let row = 0; row < tableMap.height; row++) {
            const pos = getTableCellWidgetDecorationPos(table, tableMap, row * tableMap.width);
            if (mapped?.find(pos, pos + 1)?.length !== 1) {
              isStale = true;
              break;
            }
          }
        }

        if (!isStale) {
          const mapped = prev.decorations?.map(tr.mapping, tr.doc);
          return {
            decorations: mapped,
            tableHeight: tableMap.height,
            tableNodePos: table.pos,
            renderers: prev.renderers,
            hoveredTablePos,
          };
        }

        // Clean up old renderers before creating new ones
        prev.renderers?.forEach((renderer) => {
          try {
            renderer.destroy();
          } catch (error) {
            console.error("Error destroying renderer:", error);
          }
        });

        // recreate all decorations
        const decorations: Decoration[] = [];
        const renderers: ReactRenderer[] = [];

        for (let row = 0; row < tableMap.height; row++) {
          const pos = getTableCellWidgetDecorationPos(table, tableMap, row * tableMap.width);

          const dragHandleComponent = new ReactRenderer(RowDragHandle, {
            props: {
              editor,
              row,
              tablePos: table.pos,
            } satisfies RowDragHandleProps,
            editor,
          });

          renderers.push(dragHandleComponent);
          decorations.push(Decoration.widget(pos, () => dragHandleComponent.element));
        }

        return {
          decorations: DecorationSet.create(newState.doc, decorations),
          tableHeight: tableMap.height,
          tableNodePos: table.pos,
          renderers,
          hoveredTablePos,
        };
      },
    },
    props: {
      decorations(state) {
        return (TABLE_ROW_DRAG_HANDLE_PLUGIN_KEY.getState(state) as TableRowDragHandlePluginState | undefined)
          ?.decorations;
      },
      handleDOMEvents: {
        mousemove: (view, event) => {
          // Handles are only actionable in editable docs.
          if (!view.editable) return false;
          // Ignore moves while a button is held (selection drags, row reordering, etc.)
          if (event.buttons !== 0) return false;

          const target = event.target as HTMLElement | null;
          const wrapper = target?.closest?.(".table-wrapper") ?? null;
          // Skip work while the pointer stays within the same region as last time.
          if (wrapper === lastHoverWrapper) return false;
          lastHoverWrapper = wrapper instanceof HTMLElement ? wrapper : null;

          const current = (
            TABLE_ROW_DRAG_HANDLE_PLUGIN_KEY.getState(view.state) as TableRowDragHandlePluginState | undefined
          )?.hoveredTablePos;

          if (!lastHoverWrapper) {
            if (current !== undefined) {
              view.dispatch(view.state.tr.setMeta(TABLE_ROW_DRAG_HANDLE_PLUGIN_KEY, { hoveredTablePos: null }));
            }
            return false;
          }

          const cell = lastHoverWrapper.querySelector("td, th");
          if (!cell) return false;
          let pos: number;
          try {
            pos = view.posAtDOM(cell, 0);
          } catch {
            return false;
          }
          const table = findParentNodeClosestToPos(
            view.state.doc.resolve(pos),
            (node) => node.type.spec.tableRole === "table"
          );
          const next = table ? table.pos : null;
          if (next !== (current ?? null)) {
            view.dispatch(view.state.tr.setMeta(TABLE_ROW_DRAG_HANDLE_PLUGIN_KEY, { hoveredTablePos: next }));
          }
          return false;
        },
      },
    },
    destroy() {
      // Clean up all renderers when plugin is destroyed
      const state =
        editor.state &&
        (TABLE_ROW_DRAG_HANDLE_PLUGIN_KEY.getState(editor.state) as TableRowDragHandlePluginState | undefined);
      state?.renderers?.forEach((renderer: ReactRenderer) => {
        try {
          renderer.destroy();
        } catch (error) {
          console.error("Error destroying renderer:", error);
        }
      });
    },
  });
};

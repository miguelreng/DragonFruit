/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";

const TASK_ITEM_SELECTOR = 'ul[data-type="taskList"] > li';

const HANDLE_WIDTH = 16;
const HANDLE_HEIGHT = 20;
const HANDLE_GAP = 2;

const gripVerticalIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-grip-vertical"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>';

const createTaskItemDragHandleElement = (): HTMLButtonElement => {
  const element = document.createElement("button");
  element.type = "button";
  element.draggable = true;
  // mouse-only affordance — keep it out of the tab order and name it for AT
  element.tabIndex = -1;
  element.setAttribute("aria-label", "Drag to reorder");
  element.dataset.taskItemDragHandle = "";
  element.classList.value =
    "task-item-drag-handle hidden sm:flex items-center justify-center w-4 h-5 rounded-xs cursor-grab outline-none hover:bg-layer-1-hover active:bg-layer-1 active:cursor-grabbing transition-[background-color,_opacity] duration-200 ease-linear";

  const iconElement = document.createElement("span");
  iconElement.classList.value = "pointer-events-none text-tertiary";
  iconElement.innerHTML = gripVerticalIcon;
  element.appendChild(iconElement);

  return element;
};

const getTaskItemPos = (item: HTMLElement, view: EditorView): number | null => {
  try {
    const posInsideItem = view.posAtDOM(item, 0);
    if (posInsideItem == null || posInsideItem < 0) return null;
    const $pos = view.state.doc.resolve(posInsideItem);
    for (let depth = $pos.depth; depth > 0; depth--) {
      if ($pos.node(depth).type.name === CORE_EXTENSIONS.TASK_ITEM) return $pos.before(depth);
    }
  } catch {
    return null;
  }
  return null;
};

/**
 * Per-item drag handle for task/todo list items (`ul[data-type="taskList"] > li`).
 *
 * The document and rich text editors already get block-level drag and drop via
 * `SideMenuExtension`, but that plugin locates blocks with viewport-wide
 * `elementsFromPoint` offsets tuned for full-width documents, which breaks in
 * narrow editors rendered side by side (e.g. stickies). This extension is
 * self-contained instead: it tracks the hovered task item from the event
 * target, floats a grab handle in the item's left gutter, and hands the drag
 * over to ProseMirror's native slice drag and drop (a `NodeSelection` on the
 * item plus `view.dragging`), so dropping reorders the item in place.
 *
 * The handle initiates a plain HTML5 drag that is never registered with
 * pragmatic-drag-and-drop, so host-level draggables (e.g. whole-sticky
 * reordering) ignore it.
 */
export const TaskItemDragHandleExtension = Extension.create({
  name: CORE_EXTENSIONS.TASK_ITEM_DRAG_HANDLE,
  addProseMirrorPlugins() {
    return [TaskItemDragHandlePlugin()];
  },
});

const TaskItemDragHandlePlugin = (): Plugin => {
  let handleElement: HTMLButtonElement | null = null;
  let activeItem: HTMLElement | null = null;

  const hideHandle = () => {
    activeItem = null;
    if (!handleElement?.classList.contains("task-item-drag-handle-hidden"))
      handleElement?.classList.add("task-item-drag-handle-hidden");
  };
  const showHandle = () => handleElement?.classList.remove("task-item-drag-handle-hidden");

  const positionHandle = (item: HTMLElement) => {
    if (!handleElement) return;
    // The handle is absolutely positioned within the editor's offset context
    // (the always-`relative` `.editor-container`) rather than fixed to the
    // viewport: `position: fixed` resolves against the nearest transformed /
    // `will-change: transform` ancestor, which mispositions the handle inside
    // popper-positioned floating composers and `.t-modal`.
    const offsetParent = handleElement.offsetParent;
    if (!(offsetParent instanceof HTMLElement)) return;
    const rect = item.getBoundingClientRect();
    const parentRect = offsetParent.getBoundingClientRect();
    const compStyle = window.getComputedStyle(item);
    const lineHeight = parseInt(compStyle.lineHeight, 10) || rect.height;
    const paddingTop = parseInt(compStyle.paddingTop, 10) || 0;
    handleElement.style.left = `${rect.left - parentRect.left + offsetParent.scrollLeft - HANDLE_WIDTH - HANDLE_GAP}px`;
    handleElement.style.top = `${rect.top - parentRect.top + offsetParent.scrollTop + paddingTop + (lineHeight - HANDLE_HEIGHT) / 2}px`;
  };

  const selectActiveItem = (view: EditorView): NodeSelection | null => {
    if (!activeItem) return null;
    const itemPos = getTaskItemPos(activeItem, view);
    if (itemPos === null) return null;
    view.focus();
    const nodeSelection = NodeSelection.create(view.state.doc, itemPos);
    view.dispatch(view.state.tr.setSelection(nodeSelection));
    return nodeSelection;
  };

  const handleDragStart = (event: DragEvent, view: EditorView) => {
    if (!event.dataTransfer || !activeItem) return;
    const item = activeItem;
    if (!selectActiveItem(view)) return;

    const slice = view.state.selection.content();
    const { dom, text } = view.serializeForClipboard(slice);

    event.dataTransfer.clearData();
    event.dataTransfer.setData("text/html", dom.innerHTML);
    event.dataTransfer.setData("text/plain", text);
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setDragImage(item, 0, 0);

    view.dragging = { slice, move: !event.ctrlKey };
  };

  const handleDragEnd = (view: EditorView) => {
    hideHandle();
    // ProseMirror's own dragend cleanup is bound to `view.dom`, but this
    // drag's source is the handle — a sibling of `view.dom` — so a cancelled
    // drag (Esc / drop outside any target) would leave `view.dragging`
    // holding the task-item slice and corrupt the next drop. Mirror PM's
    // cleanup: clear it slightly delayed so a same-view drop can still read it.
    const dragging = view.dragging;
    window.setTimeout(() => {
      if (view.dragging === dragging) view.dragging = null;
    }, 50);
  };

  return new Plugin({
    key: new PluginKey("taskItemDragHandle"),
    view: (view) => {
      let mounted = false;

      const onDragStart = (e: DragEvent) => handleDragStart(e, view);
      const onDragEnd = () => handleDragEnd(view);
      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        selectActiveItem(view);
      };
      const onMouseLeave = (e: MouseEvent) => {
        // Moving from the handle back into the editor keeps the handle alive;
        // the editor's own mousemove handler takes over from there.
        if (e.relatedTarget instanceof Node && view.dom.contains(e.relatedTarget)) return;
        hideHandle();
      };
      // The handle's position is computed on mousemove, so it goes stale as
      // soon as anything scrolls or the window resizes — hide it until the
      // pointer moves again.
      const onScrollOrResize = () => hideHandle();

      const mountHandle = () => {
        if (!view.dom.parentElement) return;
        handleElement = createTaskItemDragHandleElement();
        hideHandle();
        handleElement.addEventListener("dragstart", onDragStart);
        handleElement.addEventListener("dragend", onDragEnd);
        handleElement.addEventListener("click", onClick);
        handleElement.addEventListener("mouseleave", onMouseLeave);
        view.dom.parentElement.appendChild(handleElement);
        window.addEventListener("scroll", onScrollOrResize, true);
        window.addEventListener("resize", onScrollOrResize);
        mounted = true;
      };
      const unmountHandle = () => {
        window.removeEventListener("scroll", onScrollOrResize, true);
        window.removeEventListener("resize", onScrollOrResize);
        handleElement?.remove();
        handleElement = null;
        activeItem = null;
        mounted = false;
      };

      // The handle is an editing affordance — don't mount it in read-only
      // editors (issue comments, notification cards).
      if (view.editable) mountHandle();

      return {
        update: () => {
          if (view.editable && !mounted) mountHandle();
          else if (!view.editable && mounted) unmountHandle();
        },
        destroy: () => unmountHandle(),
      };
    },
    props: {
      handleDOMEvents: {
        mousemove: (view, event) => {
          if (!view.editable) return;
          const target = event.target instanceof Element ? event.target : null;
          const item = target?.closest<HTMLElement>(TASK_ITEM_SELECTOR);
          if (!item || !view.dom.contains(item)) {
            hideHandle();
            return;
          }
          activeItem = item;
          positionHandle(item);
          showHandle();
        },
        mouseleave: (view, event) => {
          // The handle floats just outside the editor's DOM — don't hide it
          // when the pointer moves from the editor onto the handle itself.
          if (event.relatedTarget instanceof Node && handleElement?.contains(event.relatedTarget)) return;
          hideHandle();
        },
        wheel: () => hideHandle(),
        keydown: () => hideHandle(),
        dragenter: () => hideHandle(),
      },
    },
  });
};

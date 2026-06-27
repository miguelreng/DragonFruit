/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { attachInstruction, extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { observer } from "mobx-react";
import { createRoot } from "react-dom/client";
import type { IIssueLabel, TBaseIssue, TIssuePriorities } from "@plane/types";
import { cn, getDate, renderFormattedDate } from "@plane/utils";
import { Check } from "@/components/icons/lucide-shim";
import { PRIORITY_TEXT_CLASS } from "./task-parse";

/** Deepest task level allowed: 0 (top), 1 (subtask), 2 (sub-subtask). */
export const MAX_TASK_DEPTH = 2;

/** Drag payload carried on each row (also what `getData`/`getInitialData` expose). */
type RowData = {
  id: string;
  projectId: string | null;
  /** This task's level in the tree (0 = top). */
  depth: number;
  /** Levels of descendants below this task (0 = leaf). */
  height: number;
};

export type TaskRowOps = {
  isOwnList: boolean;
  todayStart: Date;
  /** Currently active label filter (for highlighting the matching chip). */
  activeLabelId?: string | null;
  getLabelById: (id: string) => IIssueLabel | undefined;
  onComplete: (issue: TBaseIssue) => void;
  onSave: (issue: TBaseIssue, rawText: string) => Promise<void>;
  onEnter: (issue: TBaseIssue) => void;
  onIndent: (issue: TBaseIssue) => void;
  onOutdent: (issue: TBaseIssue) => void;
  onNest: (sourceId: string, targetId: string) => void;
  /** Toggle the current view's filter to this label. */
  onFilterLabel: (labelId: string) => void;
};

/**
 * Task title rendered as a borderless, always-editable field (Reminders/Things-style).
 * Enter commits + opens a sibling line; Tab/Shift+Tab indent/outdent into a subtask; Escape
 * reverts. Supports the same `#label @date !priority` tokens as the add row.
 */
const EditableTaskTitle = observer(function EditableTaskTitle({
  issue,
  isChecked,
  enableEditorKeys,
  shouldFocus,
  onFocused,
  onSave,
  onEnter,
  onIndent,
  onOutdent,
}: {
  issue: TBaseIssue;
  isChecked: boolean;
  enableEditorKeys: boolean;
  /** Take focus on mount/update (e.g. the task just created from the add row). */
  shouldFocus: boolean;
  onFocused: () => void;
  onSave: (rawText: string) => Promise<void>;
  onEnter: () => void;
  onIndent: () => void;
  onOutdent: () => void;
}) {
  const [value, setValue] = useState(issue.name ?? "");
  const isEditingRef = useRef(false);
  const lastSavedRef = useRef(issue.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditingRef.current) {
      setValue(issue.name ?? "");
      lastSavedRef.current = issue.name ?? "";
    }
  }, [issue.name]);

  // Pull focus here when this is the task that was just created from the add row.
  useEffect(() => {
    if (!shouldFocus) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Place the caret at the end so the user can keep typing.
    const end = el.value.length;
    el.setSelectionRange(end, end);
    onFocused();
  }, [shouldFocus, onFocused]);

  const save = useCallback(async () => {
    isEditingRef.current = false;
    const trimmed = value.trim();
    if (!trimmed || trimmed === lastSavedRef.current) {
      if (!trimmed) setValue(issue.name ?? "");
      return;
    }
    lastSavedRef.current = trimmed;
    try {
      await onSave(trimmed);
    } catch {
      lastSavedRef.current = issue.name ?? "";
      setValue(issue.name ?? "");
    }
  }, [value, issue.name, onSave]);

  return (
    <input
      ref={inputRef}
      value={value}
      onFocus={() => {
        isEditingRef.current = true;
      }}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
          if (enableEditorKeys) onEnter();
          else e.currentTarget.blur();
        } else if (e.key === "Tab" && enableEditorKeys) {
          e.preventDefault();
          save();
          if (e.shiftKey) onOutdent();
          else onIndent();
        } else if (e.key === "Escape") {
          setValue(issue.name ?? "");
          isEditingRef.current = false;
          e.currentTarget.blur();
        }
      }}
      onBlur={save}
      className={cn(
        "w-full truncate bg-transparent text-13 text-secondary outline-none placeholder:text-placeholder",
        isChecked && "text-placeholder line-through"
      )}
    />
  );
});

type TaskRowProps = {
  issue: TBaseIssue;
  isChecked: boolean;
  showProject: boolean;
  projectName?: string;
  /** This task's level in the tree (0 = top, 1 = subtask, 2 = sub-subtask). */
  depth: number;
  /** Levels of descendants below this task (0 = leaf, 1/2 = has nested subtasks). */
  height: number;
  /** Ids of every ancestor up the chain — used to reject drops onto own descendants. */
  ancestorIds: string[];
  /** Enable drag-to-nest (grouped tasks page on your own list only). */
  enableDrag: boolean;
  /** Take focus (the task just created from the add row). */
  shouldFocus: boolean;
  onFocused: () => void;
  ops: TaskRowOps;
};

export const TaskRow = observer(function TaskRow({
  issue,
  isChecked,
  showProject,
  projectName,
  depth,
  height,
  ancestorIds,
  shouldFocus,
  onFocused,
  enableDrag,
  ops,
}: TaskRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMakeChild, setIsMakeChild] = useState(false);

  // Stable key for the ancestor list so the drag effect doesn't re-register every render.
  const ancestorKey = ancestorIds.join(",");
  const onNest = ops.onNest;

  useEffect(() => {
    const element = rowRef.current;
    if (!element || !enableDrag) return;

    const data: RowData = {
      id: issue.id,
      projectId: issue.project_id ?? null,
      depth,
      height,
    };
    const ancestorList = ancestorKey ? ancestorKey.split(",") : [];

    return combine(
      draggable({
        element,
        getInitialData: () => data,
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            getOffset: pointerOutsideOfPreview({ x: "8px", y: "8px" }),
            render: ({ container }) => {
              const root = createRoot(container);
              root.render(
                <div className="rounded-lg border border-subtle bg-surface-1 px-3 py-1 text-13 text-secondary shadow-md">
                  {issue.name}
                </div>
              );
              return () => root.unmount();
            },
            nativeSetDragImage,
          });
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => {
          const sd = source.data as Partial<RowData>;
          if (!sd?.id || sd.id === issue.id) return false;
          // Subtasks live in the same project as their parent.
          if (sd.projectId !== (issue.project_id ?? null)) return false;
          // Can't drop a task onto one of its own descendants (would create a cycle).
          if (sd.id && ancestorList.includes(sd.id)) return false;
          // Respect the depth cap: target's level + 1 (the new child) + the source's own
          // subtree height must stay within MAX_TASK_DEPTH.
          if (depth + 1 + (sd.height ?? 0) > MAX_TASK_DEPTH) return false;
          return true;
        },
        getData: ({ input, element: dropEl }) =>
          attachInstruction(data, {
            input,
            element: dropEl,
            currentLevel: 0,
            indentPerLevel: 0,
            mode: "standard",
            block: ["reorder-above", "reorder-below"],
          }),
        onDrag: ({ self }) => setIsMakeChild(extractInstruction(self.data)?.type === "make-child"),
        onDragLeave: () => setIsMakeChild(false),
        onDrop: ({ source, self }) => {
          setIsMakeChild(false);
          const instruction = extractInstruction(self.data)?.type;
          const sourceId = (source.data as Partial<RowData>)?.id;
          if (instruction === "make-child" && sourceId) onNest(sourceId, issue.id);
        },
      })
    );
  }, [issue.id, issue.name, issue.project_id, depth, height, ancestorKey, enableDrag, onNest]);

  const dueDate = getDate(issue.target_date);
  const dueLabel = issue.target_date ? renderFormattedDate(issue.target_date, "MMM d") : undefined;
  const isOverdue = !!dueDate && dueDate < ops.todayStart;
  const priority = (issue.priority ?? "none") as TIssuePriorities | "none";
  const hasPriority = priority !== "none";
  const labels = (issue.label_ids ?? []).flatMap((id) => {
    const label = ops.getLabelById(id);
    return label ? [label] : [];
  });
  const hasAttributes = !!dueLabel || hasPriority || labels.length > 0;
  const subtitleProject = showProject ? projectName : undefined;
  const hasSubtitle = !!subtitleProject || hasAttributes;

  return (
    <li className={cn(depth === 1 && "ml-7", depth >= 2 && "ml-14")}>
      <div
        ref={rowRef}
        className={cn(
          "group flex items-center gap-2.5 rounded-lg px-3 py-1 transition hover:bg-layer-transparent-hover",
          isChecked && "opacity-60",
          isDragging && "opacity-50",
          isMakeChild && "bg-layer-transparent-hover ring-accent-primary/40 ring-1"
        )}
      >
        <button
          type="button"
          aria-label="Mark task complete"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            ops.onComplete(issue);
          }}
          className={cn(
            "flex size-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
            isChecked
              ? "border-accent-primary bg-accent-primary text-white"
              : "hover:border-accent-primary border-strong text-transparent"
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <EditableTaskTitle
            issue={issue}
            isChecked={isChecked}
            enableEditorKeys={ops.isOwnList}
            shouldFocus={shouldFocus}
            onFocused={onFocused}
            onSave={(text) => ops.onSave(issue, text)}
            onEnter={() => ops.onEnter(issue)}
            onIndent={() => ops.onIndent(issue)}
            onOutdent={() => ops.onOutdent(issue)}
          />
        </div>
        {hasSubtitle && (
          <span className="flex flex-shrink-0 items-center gap-1.5 text-11 text-placeholder">
            {subtitleProject && <span className="max-w-[140px] truncate font-medium text-tertiary">{subtitleProject}</span>}
            {subtitleProject && hasAttributes && <span aria-hidden>·</span>}
            {hasAttributes && (
              <span className="font-newsreader flex items-center gap-1.5 text-12 text-primary">
                {dueLabel && <span className={cn(isOverdue && "text-danger-primary")}>{dueLabel}</span>}
                {hasPriority && (
                  <span className={cn("font-medium capitalize", PRIORITY_TEXT_CLASS[priority])}>{priority}</span>
                )}
                {labels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      ops.onFilterLabel(label.id);
                    }}
                    className={cn(
                      "flex-shrink-0 font-body text-13 text-[#e548a5] transition hover:underline",
                      ops.activeLabelId === label.id && "font-semibold underline"
                    )}
                  >
                    #{label.name}
                  </button>
                ))}
              </span>
            )}
          </span>
        )}
      </div>
    </li>
  );
});

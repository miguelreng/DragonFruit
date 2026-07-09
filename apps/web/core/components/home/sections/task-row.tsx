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
import type { IIssueLabel, InstructionType, TBaseIssue, TIssuePriorities } from "@plane/types";
import { DropIndicator } from "@plane/ui";
import { cn, getDate, renderFormattedDate } from "@plane/utils";
import { Check, ChevronRight } from "@/components/icons/lucide-shim";
import { PRIORITY_TEXT_CLASS } from "./task-parse";

/** Deepest task level allowed: 0 (top), 1 (subtask), 2 (sub-subtask). */
export const MAX_TASK_DEPTH = 2;

/** Drag payload carried on each row (also what `getData`/`getInitialData` expose). */
type RowData = {
  id: string;
  projectId: string | null;
  /** Status group this row belongs to (project checklist); undefined elsewhere. */
  statusId: string | null;
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
  /** Reorder `sourceId` to sit immediately above/below `targetId` as its sibling. */
  onReorder: (sourceId: string, targetId: string, position: "above" | "below") => void;
  /**
   * Move `sourceId` (and its subtree) into `destProjectId` — the cross-project drop op. Omit in
   * single-project surfaces (e.g. the project checklist), where cross-project drops can't arise.
   */
  onMoveToProject?: (sourceId: string, destProjectId: string) => void;
  /** Toggle the current view's filter to this label. When omitted, labels are non-clickable. */
  onFilterLabel?: (labelId: string) => void;
  /** Open the task's detail peek overview. When omitted, no open affordance is shown. */
  onOpenDetail?: (issue: TBaseIssue) => void;
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
  /** Status group this row belongs to (project checklist) — nesting is same-status only. */
  statusId?: string;
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
  statusId,
  shouldFocus,
  onFocused,
  enableDrag,
  ops,
}: TaskRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<InstructionType | null>(null);

  // Stable key for the ancestor list so the drag effect doesn't re-register every render.
  const ancestorKey = ancestorIds.join(",");
  const onNest = ops.onNest;
  const onReorder = ops.onReorder;
  const onMoveToProject = ops.onMoveToProject;

  useEffect(() => {
    const element = rowRef.current;
    if (!element || !enableDrag) return;

    const data: RowData = {
      id: issue.id,
      projectId: issue.project_id ?? null,
      statusId: statusId ?? null,
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
          // Snapshot the live row as the drag image so the actual task card visibly
          // follows the cursor (mirrors the stickies drag). Cloning the on-screen node is
          // synchronous; re-rendering a fresh row via createRoot paints a tick too late
          // and the browser captures a blank preview.
          const node = rowRef.current;
          setCustomNativeDragPreview({
            getOffset: pointerOutsideOfPreview({ x: "16px", y: "12px" }),
            render: ({ container }) => {
              if (!node) return () => undefined;
              const { width } = node.getBoundingClientRect();
              const clone = node.cloneNode(true) as HTMLElement;
              clone.style.margin = "0";
              const preview = document.createElement("div");
              preview.className =
                "overflow-hidden rounded-lg bg-surface-1 shadow-2xl ring-1 ring-black/10 rotate-[1.5deg]";
              preview.style.width = `${width}px`;
              preview.appendChild(clone);
              container.appendChild(preview);
              return () => undefined;
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
          const isCrossProject = (sd.projectId ?? null) !== (issue.project_id ?? null);
          // A cross-project drop only makes sense where a move handler is wired up.
          if (isCrossProject && !onMoveToProject) return false;
          // A drop from another project is a whole-task move; skip the same-project checks below.
          if (!isCrossProject) {
            // Same status group only (project checklist); reorder/nest across groups isn't supported.
            if ((sd.statusId ?? null) !== (statusId ?? null)) return false;
            // Can't drop a task onto one of its own descendants (would create a cycle).
            if (sd.id && ancestorList.includes(sd.id)) return false;
          }
          return true;
        },
        getData: ({ input, element: dropEl, source }) => {
          const sd = source.data as Partial<RowData>;
          // Only offer "make-child" when the resulting subtree still fits the depth cap:
          // target's level + 1 (the new child) + the source's own subtree height.
          const nestBlocked = depth + 1 + (sd.height ?? 0) > MAX_TASK_DEPTH;
          return attachInstruction(data, {
            input,
            element: dropEl,
            currentLevel: 0,
            indentPerLevel: 0,
            mode: "standard",
            block: nestBlocked ? ["make-child"] : [],
          });
        },
        onDrag: ({ self, source }) => {
          // Cross-project = a whole-task move, not a reorder/nest; suppress the reorder/nest hints.
          if (((source.data as Partial<RowData>)?.projectId ?? null) !== (issue.project_id ?? null)) {
            setInstruction(null);
            return;
          }
          const type = extractInstruction(self.data)?.type;
          setInstruction(
            type === "reorder-above" || type === "reorder-below" || type === "make-child" ? type : null
          );
        },
        onDragLeave: () => setInstruction(null),
        onDrop: ({ source, self }) => {
          setInstruction(null);
          const sd = source.data as Partial<RowData>;
          const sourceId = sd?.id;
          if (!sourceId) return;
          // Dropped from another project → move the task into this row's project.
          if ((sd.projectId ?? null) !== (issue.project_id ?? null)) {
            if (issue.project_id) onMoveToProject?.(sourceId, issue.project_id);
            return;
          }
          const type = extractInstruction(self.data)?.type;
          if (type === "make-child") onNest(sourceId, issue.id);
          else if (type === "reorder-above") onReorder(sourceId, issue.id, "above");
          else if (type === "reorder-below") onReorder(sourceId, issue.id, "below");
        },
      })
    );
  }, [
    issue.id,
    issue.name,
    issue.project_id,
    statusId,
    depth,
    height,
    ancestorKey,
    enableDrag,
    onNest,
    onReorder,
    onMoveToProject,
  ]);

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
    <li className={cn("relative", depth === 1 && "ml-7", depth >= 2 && "ml-14")}>
      {/* Zero-height rails: the reorder lines overlay the row's edges without shifting layout. */}
      <div className="relative h-0">
        <div className="absolute inset-x-0 -top-[3px] z-[1]">
          <DropIndicator classNames="rounded-full" isVisible={instruction === "reorder-above"} />
        </div>
      </div>
      <div
        ref={rowRef}
        className={cn(
          "group flex items-center gap-2.5 rounded-lg px-3 py-1 transition hover:bg-layer-transparent-hover",
          isChecked && "opacity-60",
          isDragging && "opacity-50",
          instruction === "make-child" && "bg-layer-transparent-hover ring-accent-primary/40 ring-1"
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
              ? "border-strong bg-layer-3 text-tertiary"
              : "hover:border-strong border-strong text-transparent"
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
          <span className="font-body flex flex-shrink-0 items-center gap-1.5 text-13 text-placeholder">
            {subtitleProject && <span className="max-w-[140px] truncate font-medium text-tertiary">{subtitleProject}</span>}
            {subtitleProject && hasAttributes && <span aria-hidden>·</span>}
            {hasAttributes && (
              <span className="flex items-center gap-1.5 text-primary">
                {dueLabel && <span className={cn(isOverdue && "text-danger-primary")}>{dueLabel}</span>}
                {hasPriority && (
                  <span className={cn("font-medium capitalize", PRIORITY_TEXT_CLASS[priority])}>{priority}</span>
                )}
                {labels.map((label) =>
                  ops.onFilterLabel ? (
                    <button
                      key={label.id}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        ops.onFilterLabel?.(label.id);
                      }}
                      className={cn(
                        "flex-shrink-0 text-[#e548a5] transition hover:underline",
                        ops.activeLabelId === label.id && "font-semibold underline"
                      )}
                    >
                      #{label.name}
                    </button>
                  ) : (
                    <span key={label.id} className="flex-shrink-0 text-[#e548a5]">
                      #{label.name}
                    </span>
                  )
                )}
              </span>
            )}
          </span>
        )}
        {ops.onOpenDetail && (
          <button
            type="button"
            aria-label="Open task details"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              ops.onOpenDetail?.(issue);
            }}
            className="flex flex-shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-11 font-medium text-tertiary opacity-0 transition hover:bg-layer-transparent-active hover:text-secondary focus-visible:opacity-100 group-hover:opacity-100"
          >
            Open
            <ChevronRight className="size-3" />
          </button>
        )}
      </div>
      <div className="relative h-0">
        <div className="absolute inset-x-0 -bottom-[3px] z-[1]">
          <DropIndicator classNames="rounded-full" isVisible={instruction === "reorder-below"} />
        </div>
      </div>
    </li>
  );
});

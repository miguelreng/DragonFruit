/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { ISSUE_PRIORITIES } from "@plane/constants";
import type { TIssuePriorities } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
import { Loader, Plus } from "@/components/icons/lucide-shim";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { getActiveToken, highlightTaskTokens, normalizeProjectToken, parseQuickInput, PRIORITY_TEXT_CLASS } from "./task-parse";

const TOKEN_TEXT_CLASS = {
  project: "text-violet-500",
  label: "text-emerald-600",
  date: "text-blue-500",
} as const;

const PRIORITY_DOT: Record<TIssuePriorities, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
  none: "bg-layer-3",
};

type Suggestion = {
  key: string;
  label: string;
  /** Text inserted in place of the active token (includes the sigil). */
  insert: string;
  hint?: string;
  color?: string;
  priority?: TIssuePriorities;
};

export type TaskQuickAddCreate = (
  rawText: string,
  opts: { projectId: string; parentId?: string | null }
) => Promise<unknown>;

type TaskQuickAddProps = {
  slug: string;
  /** Project the new task lands in (the group's project, or the selected one for the bottom row). */
  projectId: string;
  /** Task to nest under when the user indents (Tab). Absent → indenting is unavailable. */
  indentTargetId?: string | null;
  /** Start indented (Enter on a subtask keeps the new line at the subtask level). */
  defaultIndented?: boolean;
  /** Focus the input on mount (the Enter-spawned draft line). */
  focusOnMount?: boolean;
  /** Bottom add row: stays mounted, keeps focus after each create, shows project picker + preview. */
  persistent?: boolean;
  /** Show the project picker (bottom row, multi-project workspaces). */
  projectSelectable?: boolean;
  onSelectProject?: (id: string) => void;
  onCreate: TaskQuickAddCreate;
  /** Called with the created task after a successful create (used to focus it). */
  onCreated?: (created: unknown) => void;
  /** Non-persistent draft: close the line (empty blur / Escape / after blur-commit). */
  onClose?: () => void;
};

/**
 * The single quick-add composer used both for the always-present bottom "Add a task" row and
 * for the Enter-spawned inline draft line. Parses `/project #label @date !priority` tokens and
 * offers an autocomplete menu for `/`, `#`, `!` as you type. Tab/Shift+Tab indent/outdent the
 * about-to-be-created task into a subtask (one level) when `indentTargetId` is provided.
 */
export const TaskQuickAdd = observer(function TaskQuickAdd({
  slug,
  projectId,
  indentTargetId,
  defaultIndented,
  focusOnMount,
  persistent,
  projectSelectable,
  onSelectProject,
  onCreate,
  onCreated,
  onClose,
}: TaskQuickAddProps) {
  const { joinedProjectIds, getProjectById } = useProject();
  const { getWorkspaceLabels } = useLabel();

  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [indented, setIndented] = useState(!!defaultIndented);
  const [isCreating, setIsCreating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [suppressMenu, setSuppressMenu] = useState(false);
  const [focused, setFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [referenceEl, setReferenceEl] = useState<HTMLDivElement | null>(null);
  const [popperEl, setPopperEl] = useState<HTMLDivElement | null>(null);
  const { styles, attributes } = usePopper(referenceEl, popperEl, {
    placement: "bottom-start",
    modifiers: [
      { name: "offset", options: { offset: [0, 4] } },
      { name: "preventOverflow", options: { padding: 8 } },
    ],
  });

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  // The token (if any) the caret is currently inside, and the options for it.
  const token = getActiveToken(value, caret);
  const suggestions: Suggestion[] = (() => {
    if (!token) return [];
    const q = token.query.toLowerCase();
    if (token.sigil === "/") {
      const nq = normalizeProjectToken(token.query);
      return joinedProjectIds
        .map((id) => getProjectById(id))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .filter(
          (p) =>
            !nq ||
            normalizeProjectToken(p.name ?? "").includes(nq) ||
            (p.identifier ?? "").toLowerCase().includes(q)
        )
        .slice(0, 6)
        .map((p) => ({
          key: p.id ?? p.name ?? "",
          label: p.name ?? "",
          hint: p.identifier,
          insert: `/${(p.identifier || p.name || "").replace(/[^A-Za-z0-9_-]/g, "")}`,
        }));
    }
    if (token.sigil === "#") {
      return (getWorkspaceLabels(slug) ?? [])
        .filter((l) => !q || l.name.toLowerCase().includes(q))
        .slice(0, 6)
        .map((l) => ({
          key: l.id,
          label: l.name,
          color: l.color,
          insert: `#${l.name.replace(/\s+/g, "")}`,
        }));
    }
    // "!"
    return ISSUE_PRIORITIES.filter((p) => p.key !== "none")
      .filter((p) => !q || p.key.includes(q) || p.title.toLowerCase().includes(q))
      .map((p) => ({ key: p.key, label: p.title, priority: p.key, insert: `!${p.key}` }));
  })();

  // Highlight segments with stable, offset-based keys (avoids array-index keys).
  const overlaySegments = useMemo(() => {
    let offset = 0;
    return highlightTaskTokens(value).map((seg) => {
      const key = `${offset}:${seg.text}`;
      offset += seg.text.length;
      return { text: seg.text, kind: seg.kind, priority: seg.priority, key };
    });
  }, [value]);

  const menuOpen = focused && !suppressMenu && !!token && suggestions.length > 0;
  const safeIndex = Math.min(activeIndex, Math.max(0, suggestions.length - 1));

  const syncCaret = (el: HTMLInputElement) => setCaret(el.selectionStart ?? el.value.length);

  const acceptSuggestion = (s: Suggestion) => {
    if (!token) return;
    const before = value.slice(0, token.start);
    const after = value.slice(token.end);
    const next = `${before}${s.insert} ${after.replace(/^\s+/, "")}`;
    const nextCaret = (before + s.insert + " ").length;
    setValue(next);
    setSuppressMenu(true);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  };

  const targetProjectId = projectId;

  const submit = async (keepOpen: boolean) => {
    const trimmed = value.trim();
    if (!trimmed || isCreating) {
      if (!trimmed && !persistent && !keepOpen) onClose?.();
      return;
    }
    setValue("");
    setSuppressMenu(false);
    setIsCreating(true);
    const created = await onCreate(trimmed, {
      projectId: targetProjectId,
      parentId: indented ? (indentTargetId ?? null) : null,
    });
    setIsCreating(false);
    if (created) {
      // Bottom "Add a task" row → hand focus to the created task so you keep editing it.
      // Draft lines stay open for rapid entry.
      if (persistent && onCreated) onCreated(created);
      else inputRef.current?.focus();
    } else {
      // Restore what they typed so a failed create isn't lost.
      setValue(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (menuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        acceptSuggestion(suggestions[safeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuppressMenu(true);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      submit(true);
    } else if (e.key === "Tab" && indentTargetId) {
      // Editor-style indent: make the about-to-be-created task a subtask (one level).
      e.preventDefault();
      setIndented(!e.shiftKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setValue("");
      if (!persistent) onClose?.();
      else inputRef.current?.blur();
    }
  };

  const preview = persistent ? parseQuickInput(value) : null;
  const previewProject = preview?.projectName
    ? joinedProjectIds.map((id) => getProjectById(id)).find((p) => normalizeProjectToken(p?.name ?? "") === normalizeProjectToken(preview.projectName ?? ""))
    : undefined;
  const hasPreview =
    !!preview && (!!preview.dueDate || !!preview.priority || preview.labelNames.length > 0 || !!preview.projectName);

  return (
    <li className={cn(indented && "ml-7")}>
      <div className="px-3 py-1">
        <div ref={setReferenceEl} className="flex items-center gap-2.5">
          <span className="flex size-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-strong text-tertiary">
            <Plus className="size-3" />
          </span>
          <div className="relative min-w-0 flex-1">
            {/* Highlight layer behind the input — colors the recognized tokens as you type. */}
            <div
              ref={overlayRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre p-0 text-13"
            >
              {overlaySegments.map((seg) =>
                seg.kind === "text" ? (
                  <span key={seg.key} className="text-secondary">
                    {seg.text}
                  </span>
                ) : (
                  <span
                    key={seg.key}
                    className={cn(
                      "font-medium",
                      seg.kind === "priority" ? PRIORITY_TEXT_CLASS[seg.priority ?? "none"] : TOKEN_TEXT_CLASS[seg.kind]
                    )}
                  >
                    {seg.text}
                  </span>
                )
              )}
            </div>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                syncCaret(e.currentTarget);
                setSuppressMenu(false);
                setActiveIndex(0);
              }}
              onScroll={(e) => {
                if (overlayRef.current) overlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
              }}
              onKeyUp={(e) => syncCaret(e.currentTarget)}
              onClick={(e) => syncCaret(e.currentTarget)}
              onFocus={() => setFocused(true)}
              onBlur={async () => {
                setFocused(false);
                if (persistent) return;
                const trimmed = value.trim();
                if (!trimmed) {
                  onClose?.();
                  return;
                }
                setValue("");
                await onCreate(trimmed, {
                  projectId: targetProjectId,
                  parentId: indented ? (indentTargetId ?? null) : null,
                });
                onClose?.();
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                indented
                  ? "New subtask"
                  : persistent
                    ? "Add a task —  /project  #label  @date  !priority"
                    : "New task"
              }
              className={cn(
                "relative z-[1] w-full bg-transparent p-0 text-13 caret-[#e548a5] outline-none placeholder:text-placeholder",
                value ? "text-transparent" : "text-secondary"
              )}
            />
          </div>
          {isCreating && <Loader className="size-3.5 flex-shrink-0 animate-spin text-placeholder" />}
          {persistent && projectSelectable && (
            <div className="flex-shrink-0">
              <ProjectDropdown
                value={projectId}
                onChange={(id) => onSelectProject?.(id)}
                multiple={false}
                buttonVariant="transparent-with-text"
                buttonClassName="text-11 text-tertiary"
                dropdownArrow={false}
              />
            </div>
          )}
        </div>

        {hasPreview && preview && (
          <div className="font-newsreader mt-1.5 flex flex-wrap items-center gap-2 pl-[30px] text-12 text-primary">
            {preview.projectName && <span>{previewProject ? `/${previewProject.name}` : `/${preview.projectName}`}</span>}
            {preview.dueDate && <span>{renderFormattedDate(preview.dueDate, "MMM d")}</span>}
            {preview.priority && <span className="capitalize">{preview.priority}</span>}
            {preview.labelNames.map((labelName) => (
              <span key={labelName}>#{labelName}</span>
            ))}
          </div>
        )}
      </div>

      {menuOpen && (
        <div
          ref={setPopperEl}
          style={styles.popper}
          {...attributes.popper}
          className="z-30 w-60 overflow-hidden rounded-lg border border-subtle bg-surface-1 py-1 shadow-md"
        >
          {suggestions.map((s, i) => (
            <button
              key={s.key}
              type="button"
              // Keep input focus so selecting doesn't blur-commit the draft.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => acceptSuggestion(s)}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-13 text-secondary",
                i === safeIndex && "bg-layer-transparent-hover"
              )}
            >
              {s.priority && <span className={cn("size-2 flex-shrink-0 rounded-full", PRIORITY_DOT[s.priority])} />}
              {s.color !== undefined && (
                <span className="size-2 flex-shrink-0 rounded-full" style={{ backgroundColor: s.color || "#9ca3af" }} />
              )}
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              {s.hint && <span className="flex-shrink-0 text-11 text-placeholder">{s.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </li>
  );
});

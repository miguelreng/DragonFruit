/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
// plane imports
import type { TIssueSearchResponse, TSearchEntityRequestPayload, TSearchResponse } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// plane editor
import type { TWorkItemEmbedInsertAttrs, TWorkItemPickerMode } from "@plane/editor";
// services
import { IssueService } from "@/services/issue";
// hooks
import { useProject } from "@/hooks/store/use-project";

const issueService = new IssueService();

type Props = {
  isOpen: boolean;
  mode: TWorkItemPickerMode;
  workspaceSlug: string | undefined;
  projectId: string | undefined;
  searchEntity: ((payload: TSearchEntityRequestPayload) => Promise<TSearchResponse>) | undefined;
  onClose: () => void;
  onInsert: (attrs: TWorkItemEmbedInsertAttrs) => void;
};

export const WorkItemPicker = observer(function WorkItemPicker(props: Props) {
  const { isOpen, mode, workspaceSlug, projectId, searchEntity, onClose, onInsert } = props;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TIssueSearchResponse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { getProjectIdentifierById } = useProject();

  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setResults([]);
    setError(null);
    setIsSearching(false);
    setIsCreating(false);
    // Defer focus until after the dialog transition finishes
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  // Debounced search — only in embed mode
  useEffect(() => {
    if (!isOpen || mode !== "embed" || !searchEntity) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const handle = window.setTimeout(async () => {
      try {
        const res = await searchEntity({
          count: 8,
          query_type: ["issue"],
          query: trimmed,
        });
        setResults(res.issue ?? []);
        setError(null);
      } catch {
        setError("Couldn't search tasks.");
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 200);
    return () => window.clearTimeout(handle);
  }, [isOpen, mode, query, searchEntity]);

  const canCreate = useMemo(
    () => Boolean(workspaceSlug && projectId && query.trim().length > 0 && !isCreating),
    [workspaceSlug, projectId, query, isCreating]
  );

  const handlePickExisting = (item: TIssueSearchResponse) => {
    if (!workspaceSlug || !item.project_id) {
      setError("Missing workspace or project context.");
      return;
    }
    onInsert({
      workItemId: item.id,
      projectId: item.project_id,
      workspaceSlug,
    });
    onClose();
  };

  const handleCreate = async () => {
    if (!workspaceSlug || !projectId) {
      setError("Open a project page to create a task.");
      return;
    }
    const title = query.trim();
    if (!title) return;
    setIsCreating(true);
    setError(null);
    try {
      const issue = await issueService.createIssue(workspaceSlug, projectId, { name: title });
      onInsert({
        workItemId: issue.id,
        projectId,
        workspaceSlug,
      });
      onClose();
    } catch {
      setError("Couldn't create the task.");
    } finally {
      setIsCreating(false);
    }
  };

  const placeholder = mode === "embed" ? "Search tasks by name or identifier…" : "Title of the new task…";

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex flex-col">
        <div className="flex items-center gap-2 border-b border-subtle px-4 py-3">
          {mode === "embed" ? (
            <Search className="size-4 shrink-0 text-tertiary" />
          ) : (
            <Plus className="size-4 shrink-0 text-tertiary" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && mode === "create") {
                e.preventDefault();
                if (canCreate) void handleCreate();
              }
            }}
            placeholder={placeholder}
            className="w-full bg-transparent text-14 text-primary outline-none placeholder:text-placeholder"
          />
          {(isSearching || isCreating) && <Loader2 className="size-4 shrink-0 animate-spin text-tertiary" />}
        </div>

        {error && <div className="text-error px-4 py-2 text-12">{error}</div>}

        {mode === "embed" && (
          <div className="max-h-80 overflow-y-auto py-1">
            {results.length === 0 && !isSearching && query.trim().length > 0 && (
              <div className="px-4 py-3 text-13 text-tertiary">No tasks match &ldquo;{query}&rdquo;.</div>
            )}
            {results.length === 0 && !isSearching && query.trim().length === 0 && (
              <div className="px-4 py-3 text-13 text-tertiary">Start typing to search.</div>
            )}
            {results.map((item) => {
              const identifier = item.project_id
                ? `${getProjectIdentifierById(item.project_id) || item.project__identifier}-${item.sequence_id}`
                : `${item.project__identifier}-${item.sequence_id}`;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePickExisting(item)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-layer-2"
                  )}
                >
                  <span className="shrink-0 text-12 font-medium whitespace-nowrap text-tertiary">{identifier}</span>
                  <span className="flex-1 truncate text-14 text-primary">{item.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {mode === "create" && (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-12 text-tertiary">
              {projectId
                ? "A new task will be created in this project and embedded here."
                : "Open a project page to create a task from a doc."}
            </p>
            <button
              type="button"
              disabled={!canCreate}
              onClick={() => void handleCreate()}
              className={cn(
                "text-on-accent-primary rounded-md bg-accent-primary px-3 py-1.5 text-13 font-medium transition-opacity",
                !canCreate && "cursor-not-allowed opacity-50"
              )}
            >
              {isCreating ? "Creating…" : "Create task"}
            </button>
          </div>
        )}
      </div>
    </ModalCore>
  );
});

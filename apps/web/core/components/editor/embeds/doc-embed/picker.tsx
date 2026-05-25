/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ListChecks, Loader2, PenTool, Plus, Search, StickyNote } from "@/components/icons/lucide-shim";
import type { TDocEmbedInsertAttrs, TDocEmbedPickerMode, TDocEmbedType } from "@plane/editor";
import type { IProjectView, TSticky } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { ProjectPageService } from "@/services/page";
import { StickyService } from "@/services/sticky.service";
import { ViewService } from "@/services/view.service";
import type { TDocEmbedSource } from "./types";

const pageService = new ProjectPageService();
const stickyService = new StickyService();
const viewService = new ViewService();
const EMBED_PICKER_RESULT_LIMIT = 8;

type Props = {
  isOpen: boolean;
  mode: TDocEmbedPickerMode;
  embedType: TDocEmbedType;
  workspaceSlug: string | undefined;
  projectId: string | undefined;
  onClose: () => void;
  onInsert: (attrs: TDocEmbedInsertAttrs) => void;
};

const TYPE_COPY = {
  whiteboard: {
    label: "whiteboard",
    plural: "whiteboards",
    placeholder: "Search whiteboards…",
    createPlaceholder: "Title of the new whiteboard…",
    Icon: PenTool,
  },
  sticky: {
    label: "sticky",
    plural: "stickies",
    placeholder: "Search stickies…",
    createPlaceholder: "Title of the new sticky…",
    Icon: StickyNote,
  },
  task_view: {
    label: "task view",
    plural: "task views",
    placeholder: "Search task views…",
    createPlaceholder: "Title of the new task view…",
    Icon: ListChecks,
  },
};

export function DocEmbedPicker(props: Props) {
  const { isOpen, mode, embedType, workspaceSlug, projectId, onClose, onInsert } = props;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TDocEmbedSource[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const copy = TYPE_COPY[embedType];
  const Icon = copy.Icon;
  const trimmedQuery = query.trim();
  const needsProject = embedType === "whiteboard" || embedType === "task_view";
  const isMissingContext = !workspaceSlug || (needsProject && !projectId);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setResults([]);
    setError(null);
    setIsSearching(false);
    setIsCreating(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isOpen, embedType, mode]);

  useEffect(() => {
    if (!isOpen || mode !== "embed" || isMissingContext) return;
    setIsSearching(true);
    const handle = window.setTimeout(async () => {
      try {
        const trimmed = trimmedQuery.toLowerCase();
        if (embedType === "whiteboard") {
          const pages = await pageService.fetchAll(workspaceSlug, projectId!, "whiteboard");
          setResults(
            pages
              .filter((page) => !trimmed || (page.name ?? "Untitled whiteboard").toLowerCase().includes(trimmed))
              .slice(0, 8)
              .map((page) => ({
                type: "whiteboard",
                id: page.id ?? "",
                title: page.name ?? "Untitled whiteboard",
                projectId,
                page,
              }))
          );
        } else if (embedType === "sticky") {
          const response = await stickyService.getStickies(
            workspaceSlug,
            `${EMBED_PICKER_RESULT_LIMIT}:0:0`,
            trimmedQuery || undefined,
            EMBED_PICKER_RESULT_LIMIT
          );
          setResults(
            response.results.map((sticky: TSticky) => ({
              type: "sticky",
              id: sticky.id,
              title: sticky.name || "Untitled sticky",
              sticky,
            }))
          );
        } else {
          const views = await viewService.getViews(workspaceSlug, projectId!);
          setResults(
            views
              .filter((view: IProjectView) => !trimmed || view.name.toLowerCase().includes(trimmed))
              .slice(0, 8)
              .map((view: IProjectView) => ({
                type: "task_view",
                id: view.id,
                title: view.name,
                projectId: view.project || projectId!,
                view,
              }))
          );
        }
        setError(null);
      } catch {
        setError(`Couldn't search ${copy.plural}.`);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 200);
    return () => window.clearTimeout(handle);
  }, [copy.plural, embedType, isMissingContext, isOpen, mode, projectId, trimmedQuery, workspaceSlug]);

  const canCreate = useMemo(() => {
    if (isMissingContext || trimmedQuery.length === 0 || isCreating) return false;
    if (needsProject) return Boolean(projectId);
    return true;
  }, [isCreating, isMissingContext, needsProject, projectId, trimmedQuery]);

  const handlePick = (source: TDocEmbedSource) => {
    if (!workspaceSlug) return;
    onInsert({
      embedType,
      entityId: source.id,
      projectId: source.type === "sticky" ? projectId : source.projectId,
      workspaceSlug,
      title: source.title,
      snapshot: source.type === "whiteboard" ? source.page.description_json : undefined,
    });
    onClose();
  };

  const handleCreate = async () => {
    if (!workspaceSlug || !canCreate) return;
    const title = trimmedQuery;
    setIsCreating(true);
    setError(null);
    try {
      if (embedType === "whiteboard") {
        const page = await pageService.create(workspaceSlug, projectId!, { name: title, page_type: "whiteboard" });
        onInsert({ embedType, entityId: page.id ?? "", projectId, workspaceSlug, title: page.name ?? title });
      } else if (embedType === "sticky") {
        const sticky = await stickyService.createSticky(workspaceSlug, { name: title, description_html: "<p></p>" });
        onInsert({ embedType, entityId: sticky.id, projectId, workspaceSlug, title: sticky.name ?? title });
      } else {
        const view = await viewService.createView(workspaceSlug, projectId!, {
          name: title,
          description: "",
          filters: {},
          display_filters: {},
          display_properties: {},
        } as Partial<IProjectView>);
        onInsert({ embedType, entityId: view.id, projectId, workspaceSlug, title: view.name ?? title });
      }
      onClose();
    } catch {
      setError(`Couldn't create the ${copy.label}.`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex flex-col">
        <div className="flex items-center gap-2 border-b border-subtle px-4 py-3">
          <Search className="size-4 text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (canCreate) void handleCreate();
              }
            }}
            placeholder={mode === "embed" ? copy.placeholder : copy.createPlaceholder}
            className="w-full bg-transparent text-14 text-primary outline-none placeholder:text-placeholder"
          />
          {(isSearching || isCreating) && <Loader2 className="size-4 animate-spin text-tertiary" />}
        </div>
        {error && <div className="text-error px-4 py-2 text-12">{error}</div>}
        <div className="max-h-80 overflow-y-auto py-1">
          {mode === "embed" &&
            results.map((source) => (
              <button
                key={`${source.type}-${source.id}`}
                type="button"
                onClick={() => handlePick(source)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-layer-2"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded border border-subtle bg-layer-1 text-tertiary">
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-14 text-primary">{source.title}</span>
              </button>
            ))}

          {trimmedQuery && (
            <button
              type="button"
              disabled={!canCreate}
              onClick={() => void handleCreate()}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-layer-2",
                !canCreate && "cursor-not-allowed opacity-50"
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded border border-subtle bg-layer-1 text-tertiary">
                <Plus className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-14 text-primary">
                {isCreating ? "Creating..." : `Create "${trimmedQuery}"`}
              </span>
            </button>
          )}

          {!isSearching && !trimmedQuery && results.length === 0 && (
            <div className="px-4 py-3 text-13 text-tertiary">
              {isMissingContext ? "Open a project page to add this block." : `No ${copy.plural} yet.`}
            </div>
          )}
        </div>
      </div>
    </ModalCore>
  );
}

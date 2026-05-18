/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import useSWR from "swr";
import { Check, ChevronDown, FileText, Search, X } from "@/components/icons/lucide-shim";
import { renderFormattedDate } from "@plane/utils";
import type { TPage } from "@plane/types";
import { useProject } from "@/hooks/store/use-project";
import { ProjectPageService } from "@/services/page/project-page.service";

const pageService = new ProjectPageService();

type Props = {
  workspaceSlug: string;
};

export const WorkspaceDocsRoot = observer(function WorkspaceDocsRoot({ workspaceSlug }: Props) {
  const { getProjectById } = useProject();
  const [search, setSearch] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [showProjectFilter, setShowProjectFilter] = useState(false);

  const { data: pages, isLoading } = useSWR(
    workspaceSlug ? `WORKSPACE_DOCS_${workspaceSlug}` : null,
    workspaceSlug ? () => pageService.fetchWorkspacePages(workspaceSlug) : null
  );

  const allProjectIds = useMemo(() => {
    const set = new Set<string>();
    (pages ?? []).forEach((p) => (p.project_ids ?? []).forEach((id) => set.add(id)));
    return [...set];
  }, [pages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (pages ?? []).filter((p) => {
      if (p.archived_at) return false;
      if (q && !(p.name ?? "").toLowerCase().includes(q)) return false;
      if (selectedProjectIds.size > 0) {
        const projectIds = p.project_ids ?? [];
        if (!projectIds.some((id) => selectedProjectIds.has(id))) return false;
      }
      return true;
    });
  }, [pages, search, selectedProjectIds]);

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-subtle-1 bg-canvas px-3 py-2">
          <Search className="size-4 text-tertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search docs by name…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-tertiary"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-tertiary hover:text-primary">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowProjectFilter((v) => !v)}
            className="flex items-center gap-2 rounded-md border border-subtle-1 bg-canvas px-3 py-2 text-sm hover:bg-layer-1-hover"
          >
            <span>
              Project
              {selectedProjectIds.size > 0 ? ` · ${selectedProjectIds.size}` : ""}
            </span>
            <ChevronDown className="size-4 text-tertiary" />
          </button>
          {showProjectFilter && (
            <div className="absolute right-0 z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-subtle-1 bg-canvas py-1 shadow-lg">
              {allProjectIds.length === 0 ? (
                <div className="px-3 py-2 text-xs text-tertiary">No projects with docs</div>
              ) : (
                allProjectIds.map((projectId) => {
                  const project = getProjectById(projectId);
                  const isSelected = selectedProjectIds.has(projectId);
                  return (
                    <button
                      key={projectId}
                      onClick={() => toggleProject(projectId)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-layer-1-hover"
                    >
                      <span className="flex size-4 items-center justify-center">
                        {isSelected && <Check className="size-3.5" />}
                      </span>
                      <span className="truncate">{project?.name ?? projectId}</span>
                    </button>
                  );
                })
              )}
              {selectedProjectIds.size > 0 && (
                <div className="border-t border-subtle-1 px-3 py-2">
                  <button
                    onClick={() => setSelectedProjectIds(new Set())}
                    className="text-xs text-tertiary hover:text-primary"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <DocsListSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState hasFilters={search.length > 0 || selectedProjectIds.size > 0} />
      ) : (
        <ul className="flex flex-col divide-y divide-subtle-1 rounded-md border border-subtle-1 bg-canvas">
          {filtered.map((page) => (
            <DocRow key={page.id} page={page} workspaceSlug={workspaceSlug} getProjectById={getProjectById} />
          ))}
        </ul>
      )}
    </div>
  );
});

type DocRowProps = {
  page: TPage;
  workspaceSlug: string;
  getProjectById: ReturnType<typeof useProject>["getProjectById"];
};

function DocRow({ page, workspaceSlug, getProjectById }: DocRowProps) {
  const projectIds = page.project_ids ?? [];
  const primaryProjectId = projectIds[0];
  const href = primaryProjectId && page.id ? `/${workspaceSlug}/projects/${primaryProjectId}/pages/${page.id}/` : "#";

  return (
    <li>
      <Link to={href} className="flex items-center gap-3 px-4 py-3 hover:bg-layer-1-hover">
        <FileText className="size-4 shrink-0 text-tertiary" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate text-sm font-medium text-primary">{page.name || "Untitled"}</div>
          <div className="flex items-center gap-2 text-xs text-tertiary">
            {projectIds.slice(0, 3).map((id) => {
              const project = getProjectById(id);
              return (
                <span key={id} className="rounded bg-layer-1 px-1.5 py-0.5">
                  {project?.name ?? "—"}
                </span>
              );
            })}
            {projectIds.length > 3 && <span>+{projectIds.length - 3}</span>}
          </div>
        </div>
        {page.updated_at && (
          <div className="shrink-0 text-xs text-tertiary">{renderFormattedDate(page.updated_at)}</div>
        )}
      </Link>
    </li>
  );
}

function DocsListSkeleton() {
  return (
    <ul className="flex flex-col divide-y divide-subtle-1 rounded-md border border-subtle-1 bg-canvas">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="size-4 animate-pulse rounded bg-layer-1" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3 w-1/3 animate-pulse rounded bg-layer-1" />
            <div className="h-2 w-1/4 animate-pulse rounded bg-layer-1" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <FileText className="size-8 text-tertiary" />
      <div className="text-sm font-medium">{hasFilters ? "No docs match your filters" : "No docs yet"}</div>
      <div className="text-xs text-tertiary">
        {hasFilters
          ? "Try clearing the search or project filter."
          : "Create your first page from inside a project to see it here."}
      </div>
    </div>
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useRef, useState } from "react";
import { sortBy } from "lodash-es";
import { observer } from "mobx-react";
import useSWR from "swr";
import { ListFilter } from "@/components/icons/lucide-shim";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { PageIcon } from "@plane/propel/icons";
import { Header, EHeaderVariant } from "@plane/ui";
import { getPageName, renderFormattedDate } from "@plane/utils";
import type { TPage } from "@plane/types";
import { ListLayout, ListItem } from "@/components/core/list";
import {
  FilterHeader,
  FilterOption,
  FiltersDropdown,
} from "@/components/issues/issue-layouts/filters";
import { PageLoader } from "@/components/pages/loaders/page-loader";
import { PageSearchInput } from "@/components/pages/list/search-input";
import { useProject } from "@/hooks/store/use-project";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { ProjectPageService } from "@/services/page/project-page.service";

const pageService = new ProjectPageService();

type Props = {
  workspaceSlug: string;
};

export const WorkspaceDocsRoot = observer(function WorkspaceDocsRoot({ workspaceSlug }: Props) {
  const { getProjectById } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const { data: pages, isLoading } = useSWR(
    workspaceSlug ? `WORKSPACE_DOCS_${workspaceSlug}` : null,
    workspaceSlug ? () => pageService.fetchWorkspacePages(workspaceSlug) : null
  );

  const visiblePages = useMemo(() => (pages ?? []).filter((p) => !p.archived_at), [pages]);

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visiblePages.filter((p) => {
      if (q && !(p.name ?? "").toLowerCase().includes(q)) return false;
      if (selectedProjectIds.length > 0) {
        const projectIds = p.project_ids ?? [];
        if (!projectIds.some((id) => selectedProjectIds.includes(id))) return false;
      }
      return true;
    });
  }, [visiblePages, searchQuery, selectedProjectIds]);

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };

  const hasFilters = searchQuery.length > 0 || selectedProjectIds.length > 0;

  if (isLoading) return <PageLoader />;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <Header variant={EHeaderVariant.SECONDARY}>
        <Header.LeftItem>
          <></>
        </Header.LeftItem>
        <Header.RightItem className="items-center">
          <PageSearchInput searchQuery={searchQuery} updateSearchQuery={setSearchQuery} />
          <FiltersDropdown
            icon={<ListFilter className="h-3 w-3" />}
            title="Filters"
            placement="bottom-end"
            isFiltersApplied={selectedProjectIds.length > 0}
          >
            <ProjectFilterSection
              appliedFilters={selectedProjectIds}
              onToggle={toggleProject}
              onClear={() => setSelectedProjectIds([])}
            />
          </FiltersDropdown>
        </Header.RightItem>
      </Header>
      {filteredPages.length === 0 ? (
        <EmptyStateDetailed
          assetKey={hasFilters ? "search" : "page"}
          title={hasFilters ? "No docs match your filters" : "No docs yet"}
          description={
            hasFilters
              ? "Try clearing the search or project filter."
              : "Create your first page from inside a project to see it here."
          }
        />
      ) : (
        <ListLayout>
          {filteredPages.map((page) => (
            <DocListItem
              key={page.id}
              page={page}
              workspaceSlug={workspaceSlug}
              getProjectById={getProjectById}
            />
          ))}
        </ListLayout>
      )}
    </div>
  );
});

type DocListItemProps = {
  page: TPage;
  workspaceSlug: string;
  getProjectById: ReturnType<typeof useProject>["getProjectById"];
};

function DocListItem({ page, workspaceSlug, getProjectById }: DocListItemProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { isMobile } = usePlatformOS();
  const projectIds = page.project_ids ?? [];
  const primaryProjectId = projectIds[0];
  const itemLink =
    primaryProjectId && page.id ? `/${workspaceSlug}/projects/${primaryProjectId}/pages/${page.id}/` : "#";

  return (
    <ListItem
      prependTitleElement={
        page.logo_props?.in_use ? (
          <Logo logo={page.logo_props} size={16} type="lucide" />
        ) : (
          <PageIcon className="h-4 w-4 text-tertiary" />
        )
      }
      title={getPageName(page.name)}
      itemLink={itemLink}
      isMobile={isMobile}
      parentRef={parentRef}
      disableLink={!primaryProjectId}
      actionableItems={
        <div className="flex items-center gap-3 text-13 text-tertiary">
          <div className="flex items-center gap-1.5">
            {projectIds.slice(0, 3).map((id) => {
              const project = getProjectById(id);
              return (
                <span key={id} className="rounded-sm bg-layer-1 px-1.5 py-0.5 text-11 text-secondary">
                  {project?.name ?? "—"}
                </span>
              );
            })}
            {projectIds.length > 3 && <span className="text-11">+{projectIds.length - 3}</span>}
          </div>
          {page.updated_at && <span className="text-11">{renderFormattedDate(page.updated_at)}</span>}
        </div>
      }
    />
  );
}

type ProjectFilterSectionProps = {
  appliedFilters: string[];
  onToggle: (projectId: string) => void;
  onClear: () => void;
};

const ProjectFilterSection = observer(function ProjectFilterSection({
  appliedFilters,
  onToggle,
  onClear,
}: ProjectFilterSectionProps) {
  const { joinedProjectIds, getProjectById } = useProject();
  const [search, setSearch] = useState("");
  const [previewEnabled, setPreviewEnabled] = useState(true);

  const sortedOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const projects = (joinedProjectIds ?? [])
      .map((id) => getProjectById(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .filter((p) => p.name.toLowerCase().includes(q));
    return sortBy(projects, [(p) => !appliedFilters.includes(p.id), (p) => p.name.toLowerCase()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, joinedProjectIds]);

  return (
    <div className="flex flex-col">
      <div className="p-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects"
          className="w-full rounded-sm border border-subtle bg-canvas px-2 py-1 text-11 text-primary outline-none placeholder:text-placeholder"
        />
      </div>
      <div className="overflow-y-auto px-2 pb-2">
        <FilterHeader
          title={`Project${appliedFilters.length > 0 ? ` (${appliedFilters.length})` : ""}`}
          isPreviewEnabled={previewEnabled}
          handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
        />
        {previewEnabled &&
          (sortedOptions.length > 0 ? (
            sortedOptions.map((project) => (
              <FilterOption
                key={`doc-project-${project.id}`}
                isChecked={appliedFilters.includes(project.id)}
                onClick={() => onToggle(project.id)}
                icon={
                  <span className="grid h-4 w-4 flex-shrink-0 place-items-center">
                    <Logo logo={project.logo_props} size={12} />
                  </span>
                }
                title={project.name}
              />
            ))
          ) : (
            <p className="px-1.5 text-11 italic text-placeholder">No matches found</p>
          ))}
        {appliedFilters.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="mt-2 w-full text-left text-11 text-tertiary hover:text-primary"
          >
            Clear filter
          </button>
        )}
      </div>
    </div>
  );
});

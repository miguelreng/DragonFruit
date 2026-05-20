/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useRef, useState, type ReactNode } from "react";
import { sortBy } from "lodash-es";
import { observer } from "mobx-react";
import { Link } from "react-router";
import useSWR from "swr";
import { ListBullets, SquaresFour } from "@phosphor-icons/react";
import { ListFilter } from "@/components/icons/lucide-shim";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { PageIcon } from "@plane/propel/icons";
import { Breadcrumbs, Header } from "@plane/ui";
import { cn, getPageName, renderFormattedDate } from "@plane/utils";
import type { TPage } from "@plane/types";
import { AppHeader } from "@/components/core/app-header";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { ListLayout, ListItem } from "@/components/core/list";
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { PageLoader } from "@/components/pages/loaders/page-loader";
import { PageSearchInput } from "@/components/pages/list/search-input";
import { useProject } from "@/hooks/store/use-project";
import { usePlatformOS } from "@/hooks/use-platform-os";
import useLocalStorage from "@/hooks/use-local-storage";
import { ProjectPageService } from "@/services/page/project-page.service";
import { WorkspaceCreateDocButton } from "./workspace-create-doc-button";

const pageService = new ProjectPageService();

type ViewMode = "list" | "grid";

type Props = {
  workspaceSlug: string;
  /** Filter the workspace pages list by type. Omit to show docs only. */
  pageType?: TPage["page_type"];
  /** Breadcrumb label shown in the page header. */
  headerLabel: string;
  /** Breadcrumb icon shown in the page header. */
  headerIcon: ReactNode;
  /** Override the empty-state copy for non-doc surfaces (Whiteboards). */
  labels?: {
    emptyTitle?: string;
    emptyDescription?: string;
    filteredEmptyTitle?: string;
  };
};

export const WorkspaceDocsRoot = observer(function WorkspaceDocsRoot({
  workspaceSlug,
  pageType = "doc",
  headerLabel,
  headerIcon,
  labels,
}: Props) {
  const { getProjectById } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const { storedValue: storedViewMode, setValue: setViewMode } = useLocalStorage<ViewMode>(
    `workspace_docs_view_mode_${pageType}`,
    "grid"
  );
  const viewMode: ViewMode = storedViewMode ?? "grid";

  const { data: pages, isLoading } = useSWR(
    workspaceSlug ? `WORKSPACE_PAGES_${workspaceSlug}_${pageType}` : null,
    workspaceSlug ? () => pageService.fetchWorkspacePages(workspaceSlug, pageType) : null
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

  const headerNode = (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item component={<BreadcrumbLink label={headerLabel} icon={headerIcon} />} />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem className="items-center">
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
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
        <WorkspaceCreateDocButton workspaceSlug={workspaceSlug} defaultType={pageType} />
      </Header.RightItem>
    </Header>
  );

  if (isLoading)
    return (
      <>
        <AppHeader header={headerNode} />
        <PageLoader />
      </>
    );

  return (
    <>
      <AppHeader header={headerNode} />
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        {filteredPages.length === 0 ? (
          <EmptyStateDetailed
            assetKey={hasFilters ? "search" : "page"}
            title={
              hasFilters
                ? (labels?.filteredEmptyTitle ?? "No docs match your filters")
                : (labels?.emptyTitle ?? "No docs yet")
            }
            description={
              hasFilters
                ? "Try clearing the search or project filter."
                : (labels?.emptyDescription ?? "Use the New button to create your first page.")
            }
          />
        ) : viewMode === "grid" ? (
          <div className="vertical-scrollbar scrollbar-lg h-full w-full overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredPages.map((page) => (
                <DocCard key={page.id} page={page} workspaceSlug={workspaceSlug} getProjectById={getProjectById} />
              ))}
            </div>
          </div>
        ) : (
          <ListLayout>
            {filteredPages.map((page) => (
              <DocListItem key={page.id} page={page} workspaceSlug={workspaceSlug} getProjectById={getProjectById} />
            ))}
          </ListLayout>
        )}
      </div>
    </>
  );
});

type ViewModeToggleProps = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  const options: Array<{ value: ViewMode; Icon: typeof ListBullets; label: string }> = [
    { value: "list", Icon: ListBullets, label: "List view" },
    { value: "grid", Icon: SquaresFour, label: "Grid view" },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-subtle p-0.5">
      {options.map(({ value, Icon, label }) => {
        const isActive = mode === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => onChange(value)}
            className={cn(
              "grid size-6 place-items-center rounded-sm text-tertiary transition-colors hover:text-primary",
              { "bg-layer-1 text-primary": isActive }
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}

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

type DocCardProps = {
  page: TPage;
  workspaceSlug: string;
  getProjectById: ReturnType<typeof useProject>["getProjectById"];
};

function DocCard({ page, workspaceSlug, getProjectById }: DocCardProps) {
  const projectIds = page.project_ids ?? [];
  const primaryProjectId = projectIds[0];
  const primaryProject = primaryProjectId ? getProjectById(primaryProjectId) : undefined;
  const itemLink =
    primaryProjectId && page.id ? `/${workspaceSlug}/projects/${primaryProjectId}/pages/${page.id}/` : null;

  const card = (
    <div
      className={cn(
        "group flex h-[260px] flex-col gap-3 rounded-md border border-subtle bg-surface-1 p-4 transition-colors",
        { "hover:border-strong": itemLink, "opacity-60": !itemLink }
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="grid size-5 shrink-0 place-items-center">
          {page.logo_props?.in_use ? (
            <Logo logo={page.logo_props} size={18} type="lucide" />
          ) : (
            <PageIcon className="size-4 text-tertiary" />
          )}
        </span>
        <h3 className="line-clamp-2 flex-1 text-13 leading-tight font-semibold text-primary">
          {getPageName(page.name)}
        </h3>
      </div>
      <div className="relative flex-1 overflow-hidden rounded-sm border border-subtle/60">
        {page.description_snippet ? (
          <p
            className="px-3 pt-3 pb-6 text-12 leading-relaxed text-secondary"
            style={{
              WebkitMaskImage: "linear-gradient(to bottom, black 65%, transparent 100%)",
              maskImage: "linear-gradient(to bottom, black 65%, transparent 100%)",
            }}
          >
            {page.description_snippet}
          </p>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-tertiary/60">
            {page.logo_props?.in_use ? (
              <Logo logo={page.logo_props} size={40} type="lucide" />
            ) : (
              <PageIcon className="size-8" />
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-11 text-tertiary">
        {primaryProject ? (
          <span className="truncate rounded-sm bg-layer-1 px-1.5 py-0.5 text-secondary">{primaryProject.name}</span>
        ) : (
          <span className="text-placeholder">No project</span>
        )}
        {projectIds.length > 1 && <span>+{projectIds.length - 1}</span>}
        {page.updated_at && <span className="ml-auto shrink-0">{renderFormattedDate(page.updated_at)}</span>}
      </div>
    </div>
  );

  if (!itemLink) return card;
  return (
    <Link
      to={itemLink}
      className="focus-visible:ring-accent-primary/40 block rounded-md focus:outline-none focus-visible:ring-2"
    >
      {card}
    </Link>
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
            <p className="px-1.5 text-11 text-placeholder italic">No matches found</p>
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

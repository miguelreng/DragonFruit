/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useRef, useState, type ReactNode } from "react";
import { sortBy } from "lodash-es";
import { observer } from "mobx-react";
import { Link } from "react-router";
import useSWR, { useSWRConfig } from "swr";
import { Archive02Icon, Copy01Icon, Delete02Icon, LinkSquare01Icon, MoreHorizontal } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListBullets, SquaresFour } from "@phosphor-icons/react";
import { ListFilter, PaintBoard } from "@/components/icons/lucide-shim";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { PageIcon } from "@plane/propel/icons";
import { ArchiveRestoreIcon } from "@plane/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Breadcrumbs, CustomMenu, Header } from "@plane/ui";
import { cn, copyUrlToClipboard, getPageName, renderFormattedDate } from "@plane/utils";
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
import { normalizeTags } from "@/helpers/tags";
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
                <DocCard
                  key={page.id}
                  page={page}
                  pageType={pageType}
                  workspaceSlug={workspaceSlug}
                  getProjectById={getProjectById}
                />
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
    <div className="flex items-center gap-0.5 rounded-lg border border-subtle p-0.5">
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
              "grid size-6 place-items-center rounded-lg text-tertiary transition-colors hover:text-primary",
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
  const FallbackIcon = page.page_type === "whiteboard" ? PaintBoard : PageIcon;
  const tags = normalizeTags((page.view_props as Record<string, unknown> | undefined)?.tags);

  return (
    <ListItem
      prependTitleElement={
        page.logo_props?.in_use ? (
          <Logo logo={page.logo_props} size={16} type="lucide" />
        ) : (
          <FallbackIcon className="h-4 w-4 text-tertiary" />
        )
      }
      title={getPageName(page.name)}
      itemLink={itemLink}
      isMobile={isMobile}
      parentRef={parentRef}
      disableLink={!primaryProjectId}
      actionableItems={
        <div className="flex items-center gap-3 text-13 text-tertiary">
          {tags.length > 0 && (
            <div className="flex max-w-[220px] items-center gap-1 overflow-hidden">
              {tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="truncate rounded-lg border border-subtle px-1.5 py-0.5 text-10 text-secondary"
                >
                  {tag}
                </span>
              ))}
              {tags.length > 2 && <span className="text-11">+{tags.length - 2}</span>}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            {projectIds.slice(0, 3).map((id) => {
              const project = getProjectById(id);
              return (
                <span key={id} className="rounded-lg bg-layer-1 px-1.5 py-0.5 text-11 text-secondary">
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
  pageType: TPage["page_type"];
  workspaceSlug: string;
  getProjectById: ReturnType<typeof useProject>["getProjectById"];
};

function DocCard({ page, pageType, workspaceSlug, getProjectById }: DocCardProps) {
  const { mutate } = useSWRConfig();
  const projectIds = page.project_ids ?? [];
  const primaryProjectId = projectIds[0];
  const primaryProject = primaryProjectId ? getProjectById(primaryProjectId) : undefined;
  const itemLink =
    primaryProjectId && page.id ? `/${workspaceSlug}/projects/${primaryProjectId}/pages/${page.id}/` : null;
  const FallbackIcon = page.page_type === "whiteboard" ? PaintBoard : PageIcon;
  const pagesKey = `WORKSPACE_PAGES_${workspaceSlug}_${pageType}`;

  const refreshPages = async () => {
    await mutate(pagesKey);
  };

  const handleCopyLink = async () => {
    if (!itemLink) return;
    await copyUrlToClipboard(itemLink);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "Link copied",
      message: "Doc link copied to clipboard.",
    });
  };

  const handleDuplicate = async () => {
    if (!primaryProjectId || !page.id) return;
    try {
      await pageService.duplicate(workspaceSlug, primaryProjectId, page.id);
      await refreshPages();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Page duplicated successfully.",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Page could not be duplicated. Please try again later.",
      });
    }
  };

  const handleArchive = async () => {
    if (!primaryProjectId || !page.id) return;
    try {
      if (page.archived_at) {
        await pageService.restore(workspaceSlug, primaryProjectId, page.id);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: "Page restored successfully.",
        });
      } else {
        await pageService.archive(workspaceSlug, primaryProjectId, page.id);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: "Page archived successfully.",
        });
      }
      await refreshPages();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: page.archived_at
          ? "Page could not be restored. Please try again later."
          : "Page could not be archived. Please try again later.",
      });
    }
  };

  const handleDelete = async () => {
    if (!primaryProjectId || !page.id) return;
    const confirmed = window.confirm(`Delete ${getPageName(page.name)}? This can't be undone.`);
    if (!confirmed) return;
    try {
      await pageService.remove(workspaceSlug, primaryProjectId, page.id);
      await refreshPages();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Page deleted successfully.",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Page could not be deleted. Please try again later.",
      });
    }
  };

  const card = (
    <div
      className={cn(
        "group relative flex h-[240px] flex-col gap-3 rounded-2xl border border-subtle bg-surface-1 p-4 transition-colors",
        { "hover:border-strong": itemLink, "opacity-60": !itemLink }
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-layer-1 text-tertiary">
          {page.logo_props?.in_use ? (
            <Logo logo={page.logo_props} size={16} type="lucide" />
          ) : (
            <FallbackIcon className="size-4 text-tertiary" />
          )}
        </span>
        <div className="min-w-0 flex-1 pr-8">
          <h3 className="line-clamp-2 text-14 leading-snug font-medium text-primary">{getPageName(page.name)}</h3>
        </div>
      </div>
      {primaryProjectId && page.id && (
        <div className="absolute top-2 right-2 z-10 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <CustomMenu
            ariaLabel="Doc actions"
            placement="bottom-end"
            closeOnSelect
            useCaptureForOutsideClick
            customButton={
              <span className="shadow-sm grid size-6 place-items-center rounded-lg bg-layer-1 text-tertiary hover:bg-layer-2 hover:text-primary">
                <HugeiconsIcon icon={MoreHorizontal} className="size-4" color="currentColor" strokeWidth={1.5} />
              </span>
            }
          >
            <CustomMenu.MenuItem onClick={() => void handleCopyLink()}>
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={LinkSquare01Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
                Copy link
              </span>
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={() => void handleDuplicate()}>
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={Copy01Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
                Duplicate
              </span>
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={() => void handleArchive()}>
              <span className="flex items-center gap-2">
                {page.archived_at ? (
                  <ArchiveRestoreIcon className="size-4" />
                ) : (
                  <HugeiconsIcon icon={Archive02Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
                )}
                {page.archived_at ? "Restore" : "Archive"}
              </span>
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem
              onClick={() => void handleDelete()}
              className="text-red-500 hover:!bg-red-500/10 hover:!text-red-500"
            >
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={Delete02Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
                Delete
              </span>
            </CustomMenu.MenuItem>
          </CustomMenu>
        </div>
      )}
      <div className="flex flex-1 flex-col">
        {page.description_snippet ? (
          <p className="line-clamp-4 text-12 leading-relaxed text-secondary">{page.description_snippet}</p>
        ) : (
          <div className="mt-1 flex flex-1 items-center justify-center rounded-xl bg-layer-1/60 text-12 text-placeholder">
            No content
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-11 text-tertiary">
        {primaryProject ? (
          <span className="truncate rounded-lg bg-layer-1 px-1.5 py-0.5 text-secondary">{primaryProject.name}</span>
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
      className="focus-visible:ring-accent-primary/40 block rounded-lg focus:outline-none focus-visible:ring-2"
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
          className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1 text-11 text-primary outline-none placeholder:text-placeholder"
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

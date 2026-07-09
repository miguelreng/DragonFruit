/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
import { Collapse } from "@/components/common/collapse";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { sortBy } from "lodash-es";
import { observer } from "mobx-react";
import { Link } from "react-router";
import useSWR, { useSWRConfig } from "swr";
import {
  Archive as Archive02Icon,
  Copy as Copy01Icon,
  ExternalLink as LinkSquare01Icon,
  MoreHorizontal,
  Trash as Delete02Icon,
} from "@/components/icons/lucide-shim";
import { List as ListBullets, LayoutGrid as SquaresFour } from "@/components/icons/lucide-shim";
import {
  ChevronDown,
  File as FileIcon,
  FileText,
  Folder,
  GridIconShim,
  Search,
  UploadCloud,
  Whiteboard,
  X,
} from "@/components/icons/lucide-shim";
import { Button, getButtonStyling } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { PageIcon } from "@/components/icons/propel-shim";
import { ArchiveRestoreIcon } from "@/components/icons/lucide-shim";
import { DocumentText } from "@solar-icons/react/ssr";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Breadcrumbs, Checkbox, CustomMenu, Header } from "@plane/ui";
import { cn, convertBytesToSize, copyUrlToClipboard, getPageName, renderFormattedDate } from "@plane/utils";
import { EPageAccess } from "@plane/types";
import type { TPage, TPageType } from "@plane/types";
import { AppHeader } from "@/components/core/app-header";
import { EmptyStateIcon } from "@/components/empty-state/empty-state-icon";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { ListLayout, ListItem } from "@/components/core/list";
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { PageLoader } from "@/components/pages/loaders/page-loader";
import { PageSearchInput } from "@/components/pages/list/search-input";
import { getBriefPageDisplayName, isBriefPage } from "@/components/project/brief/constants";
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { EUserPermissions } from "@plane/constants";
import { usePlatformOS } from "@/hooks/use-platform-os";
import useLocalStorage from "@/hooks/use-local-storage";
import { useAppRailPreferences } from "@/hooks/use-navigation-preferences";
import { normalizeTags } from "@/helpers/tags";
import { ProjectPageService } from "@/services/page/project-page.service";
import { WorkspaceCreateDocButton } from "./workspace-create-doc-button";
import { isPdfFile, useCreatePdfPage } from "./use-create-pdf-page";

type DocsIconComponent = ComponentType<{
  className?: string;
  color?: string;
  size?: number | string;
  strokeWidth?: number | string;
}>;

const DetailIcon = ({
  icon: Icon,
  className,
  color = "currentColor",
  size = "1em",
  strokeWidth,
}: {
  icon: DocsIconComponent;
  className?: string;
  color?: string;
  size?: number | string;
  strokeWidth?: number | string;
}) => <Icon className={className} color={color} size={size} strokeWidth={strokeWidth} />;

const pageService = new ProjectPageService();

// Page service methods reject with the API response body (e.g. {error: "..."}),
// a bare string, or an Axios error. Pull out the human-readable reason so the
// real cause (403/locked/not-archived) surfaces instead of a generic message.
const pageActionErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const data = error as { error?: unknown; detail?: unknown; message?: unknown };
    const detail = data.error ?? data.detail ?? data.message;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  }
  return fallback;
};

type ViewMode = "list" | "grid";

type Props = {
  workspaceSlug: string;
  /** Scope the list (and doc creation) to a single project. Hides the
   * project filter — the type filter covers in-project narrowing. */
  projectId?: string;
  /** Filter the workspace pages list by type. Omit to show docs only. */
  pageType?: TPageType;
  /** Filter the workspace pages list by multiple page types. */
  pageTypes?: TPageType[];
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
  projectId: scopeProjectId,
  pageType = "doc",
  pageTypes,
  headerLabel,
  labels,
}: Props) {
  const { getProjectById, joinedProjectIds } = useProject();
  const { data: currentUser } = useUser();
  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  // Mirrors the API's delete rule (owner OR project admin; never a brief) so we
  // only ever offer a delete that will succeed. See ProjectPagePermission.
  const canDeleteDoc = useCallback(
    (page: TPage) => {
      if (isProjectBriefPage(page)) return false;
      if (currentUser?.id && page.owned_by === currentUser.id) return true;
      return (page.project_ids ?? []).some(
        (projectId) => getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId) === EUserPermissions.ADMIN
      );
    },
    [currentUser?.id, getProjectRoleByWorkspaceSlugAndProjectId, workspaceSlug]
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<TPageType[]>([]);
  const [selectedAccess, setSelectedAccess] = useState<EPageAccess[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  // The last single-toggled doc; shift-click selects the range from here to the target.
  const [anchorDocId, setAnchorDocId] = useState<string | null>(null);
  const activePageTypes = useMemo(() => (pageTypes?.length ? pageTypes : [pageType]), [pageType, pageTypes]);
  const isWhiteboardSurface = activePageTypes.every((type) => type === "whiteboard");
  const pageTypesKey = activePageTypes.join("_");
  const requestPageType = activePageTypes.length === 1 ? activePageTypes[0] : undefined;
  const pagesKey = `WORKSPACE_PAGES_${workspaceSlug}_${pageTypesKey}`;
  const { storedValue: storedViewMode, setValue: setViewMode } = useLocalStorage<ViewMode>(
    `workspace_docs_view_mode_${pageTypesKey}`,
    "grid"
  );
  const viewMode: ViewMode = storedViewMode ?? "grid";
  // The open rail eats horizontal space, so drop the gallery from 4 to 3
  // columns at xl while it's expanded.
  const { preferences: railPreferences } = useAppRailPreferences();
  const isRailExpanded = railPreferences.displayMode === "icon_with_label";

  const {
    data: pages,
    isLoading,
    mutate: mutatePages,
  } = useSWR(
    workspaceSlug ? pagesKey : null,
    workspaceSlug ? () => pageService.fetchWorkspacePages(workspaceSlug, requestPageType) : null
  );

  const visiblePages = useMemo(
    () =>
      (pages ?? []).filter(
        (p) =>
          (showArchived ? Boolean(p.archived_at) : !p.archived_at) &&
          activePageTypes.includes(p.page_type ?? "doc") &&
          !isBriefPage(p) &&
          (!scopeProjectId || (p.project_ids ?? []).includes(scopeProjectId))
      ),
    [activePageTypes, pages, scopeProjectId, showArchived]
  );
  const pagesById = useMemo(() => {
    const map = new Map<string, TPage>();
    visiblePages.forEach((page) => {
      if (page.id) map.set(page.id, page);
    });
    return map;
  }, [visiblePages]);
  const selectedDocIdSet = useMemo(() => new Set(selectedDocIds), [selectedDocIds]);
  const selectedDocs = useMemo(
    () => selectedDocIds.map((id) => pagesById.get(id)).filter((page): page is TPage => Boolean(page)),
    [pagesById, selectedDocIds]
  );

  useEffect(() => {
    setSelectedDocIds((prev) => {
      const next = prev.filter((id) => pagesById.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [pagesById]);

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visiblePages.filter((p) => {
      const primaryProjectId = p.project_ids?.[0];
      const primaryProject = primaryProjectId ? getProjectById(primaryProjectId) : undefined;
      const displayName = getWorkspaceDocDisplayName(p, primaryProject?.name);
      if (q && !displayName.toLowerCase().includes(q) && !(p.name ?? "").toLowerCase().includes(q)) return false;
      if (selectedProjectIds.length > 0) {
        const projectIds = p.project_ids ?? [];
        if (!projectIds.some((id) => selectedProjectIds.includes(id))) return false;
      }
      if (selectedTypes.length > 0 && !selectedTypes.includes(p.page_type ?? "doc")) return false;
      if (selectedAccess.length > 0 && !selectedAccess.includes(p.access ?? EPageAccess.PUBLIC)) return false;
      return true;
    });
  }, [visiblePages, searchQuery, selectedProjectIds, selectedTypes, selectedAccess, getProjectById]);

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };
  const toggleType = (type: TPageType) => {
    setSelectedTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };
  const toggleAccess = (access: EPageAccess) => {
    setSelectedAccess((prev) => (prev.includes(access) ? prev.filter((a) => a !== access) : [...prev, access]));
  };
  const toggleDocSelection = (pageId: string) => {
    setSelectedDocIds((prev) => (prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]));
    setAnchorDocId(pageId);
  };
  // Shift-click selects every doc between the anchor and the target (inclusive),
  // in render order — classic range selection. The range is unioned into the
  // current selection and the anchor stays put so it can be re-extended.
  const selectDocRange = (targetPageId: string) => {
    const order = filteredPages.map((p) => p.id).filter((id): id is string => Boolean(id));
    const targetIdx = order.indexOf(targetPageId);
    if (targetIdx === -1) return;
    const anchorIdx = anchorDocId ? order.indexOf(anchorDocId) : -1;
    if (anchorIdx === -1) {
      // No usable anchor yet — behave like a single select and set the anchor.
      setSelectedDocIds((prev) => (prev.includes(targetPageId) ? prev : [...prev, targetPageId]));
      setAnchorDocId(targetPageId);
      return;
    }
    const [start, end] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
    const rangeIds = order.slice(start, end + 1);
    setSelectedDocIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
  };
  const handleDocSelect = (pageId: string, isRange: boolean) => {
    if (isRange) selectDocRange(pageId);
    else toggleDocSelection(pageId);
  };
  const clearDocSelection = () => {
    setSelectedDocIds([]);
    setAnchorDocId(null);
  };
  const refreshPages = async () => {
    await mutatePages();
  };

  // Drag-and-drop PDF upload. Only where PDFs are actually listed and there is a
  // project to attach the asset to (matches the New button's Upload PDF rule).
  const { createPdfPage, isUploading: isUploadingPdf } = useCreatePdfPage(workspaceSlug);
  const canDropPdf = !!scopeProjectId && activePageTypes.includes("pdf");
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragDepth = useRef(0);

  const isFileDrag = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
  const handleFileDragEnter = (event: React.DragEvent) => {
    if (!canDropPdf || !isFileDrag(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDraggingFiles(true);
  };
  const handleFileDragOver = (event: React.DragEvent) => {
    if (!canDropPdf || !isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const handleFileDragLeave = (event: React.DragEvent) => {
    if (!canDropPdf || !isFileDrag(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDraggingFiles(false);
  };
  const handleFileDrop = async (event: React.DragEvent) => {
    if (!canDropPdf || !scopeProjectId || !isFileDrag(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setIsDraggingFiles(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    const pdfs = files.filter(isPdfFile);
    if (pdfs.length === 0) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Only PDF files can be added here." });
      return;
    }
    let created = 0;
    for (const file of pdfs) {
      // Sequential so we don't fire N presign/upload chains at once.
      const page = await createPdfPage(scopeProjectId, file);
      if (page) created += 1;
    }
    if (created > 0) {
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: created === 1 ? "PDF added." : `${created} PDFs added.`,
      });
      await refreshPages();
    }
  };

  const hasFilters =
    searchQuery.length > 0 ||
    selectedProjectIds.length > 0 ||
    selectedTypes.length > 0 ||
    selectedAccess.length > 0 ||
    showArchived;
  const isSelectionActive = selectedDocIds.length > 0;

  // Filter triggers use the same secondary button as the rest of the bar.
  const pillBase = getButtonStyling("secondary", "lg");
  const pillActive = "text-accent-primary";
  const pillInactive = "";
  const projectFilterPillLabel = useMemo(() => {
    if (selectedProjectIds.length === 0) return "Project";
    if (selectedProjectIds.length > 1) return `${selectedProjectIds.length} projects`;
    return getProjectById(selectedProjectIds[0])?.name ?? "Project";
  }, [getProjectById, selectedProjectIds]);
  const accessFilterPillLabel = useMemo(() => {
    const accessLabels = [
      ...selectedAccess.map(
        (access) => ACCESS_FILTER_OPTIONS.find((option) => option.value === access)?.label ?? String(access)
      ),
      ...(showArchived ? ["Archived"] : []),
    ];
    if (accessLabels.length === 0) return "Privacy";
    if (accessLabels.length === 1) return accessLabels[0];
    return `${accessLabels.length} privacy`;
  }, [selectedAccess, showArchived]);
  const typeFilterPillLabel = useMemo(() => {
    if (selectedTypes.length === 0) return "Type";
    if (selectedTypes.length > 1) return `${selectedTypes.length} types`;
    return TYPE_FILTER_META[selectedTypes[0]].label;
  }, [selectedTypes]);

  const headerNode = (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-1.5">
          <Breadcrumbs className="flex-grow-0">
            <Breadcrumbs.Item component={<BreadcrumbLink label={headerLabel} />} />
          </Breadcrumbs>
          <span className="rounded-full bg-layer-1 px-1.5 py-px text-11 font-medium text-tertiary">
            {visiblePages.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!scopeProjectId && (
            <FiltersDropdown
              placement="bottom-start"
              menuButton={
                <FilterSummaryPill
                  label={projectFilterPillLabel}
                  isActive={selectedProjectIds.length > 0}
                  className={cn(pillBase, selectedProjectIds.length > 0 ? pillActive : pillInactive)}
                />
              }
              isFiltersApplied={selectedProjectIds.length > 0}
            >
              <ProjectFilterSection
                appliedFilters={selectedProjectIds}
                onToggle={toggleProject}
                onClear={() => setSelectedProjectIds([])}
              />
            </FiltersDropdown>
          )}
          <FiltersDropdown
            placement="bottom-start"
            menuButton={
              <FilterSummaryPill
                label={typeFilterPillLabel}
                isActive={selectedTypes.length > 0}
                className={cn(pillBase, selectedTypes.length > 0 ? pillActive : pillInactive)}
              />
            }
            isFiltersApplied={selectedTypes.length > 0}
          >
            <TypeFilterSection
              availableTypes={activePageTypes}
              appliedFilters={selectedTypes}
              onToggle={toggleType}
              onClear={() => setSelectedTypes([])}
            />
          </FiltersDropdown>
          <FiltersDropdown
            placement="bottom-start"
            menuButton={
              <FilterSummaryPill
                label={accessFilterPillLabel}
                isActive={selectedAccess.length > 0 || showArchived}
                className={cn(pillBase, selectedAccess.length > 0 || showArchived ? pillActive : pillInactive)}
              />
            }
            isFiltersApplied={selectedAccess.length > 0 || showArchived}
          >
            <AccessFilterSection
              appliedFilters={selectedAccess}
              showArchived={showArchived}
              onToggle={toggleAccess}
              onToggleArchived={() => setShowArchived((prev) => !prev)}
              onClear={() => {
                setSelectedAccess([]);
                setShowArchived(false);
              }}
            />
          </FiltersDropdown>
        </div>
      </Header.LeftItem>
      <Header.RightItem className="items-center">
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        <PageSearchInput searchQuery={searchQuery} updateSearchQuery={setSearchQuery} />
        <WorkspaceCreateDocButton
          workspaceSlug={workspaceSlug}
          defaultType={pageType}
          lockedProjectId={scopeProjectId}
        />
      </Header.RightItem>
    </Header>
  );

  if (isLoading)
    return (
      <div className="flex h-full w-full flex-col overflow-hidden">
        <AppHeader header={headerNode} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <PageLoader />
        </div>
      </div>
    );

  // Column shell: the AppHeader is pinned (shrink-0) and the content fills the
  // rest as the single scroller. Filling the parent exactly means the wrapping
  // ContentWrapper never overflows, so the header can't drift on over-scroll.
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <AppHeader header={headerNode} />
      <div
        className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
        onDragEnter={handleFileDragEnter}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
        onDrop={handleFileDrop}
      >
        {canDropPdf && (isDraggingFiles || isUploadingPdf) && (
          <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-accent-strong bg-surface-1/85 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-center">
              <UploadCloud className="size-8 text-accent-primary" />
              <p className="text-14 font-medium text-primary">
                {isUploadingPdf ? "Uploading PDF…" : "Drop PDF files to add them"}
              </p>
              {!isUploadingPdf && <p className="text-12 text-tertiary">They'll be added to this project's docs.</p>}
            </div>
          </div>
        )}
        {filteredPages.length === 0 ? (
          <EmptyStateDetailed
            assetKey={hasFilters ? "search" : undefined}
            asset={hasFilters ? undefined : <EmptyStateIcon name={isWhiteboardSurface ? "whiteboards" : "docs"} />}
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
          /* Reserve the scrollbar gutter on BOTH edges so the 16px scrollbar
             doesn't make the right margin wider than the left — content stays
             centered (net ~20px each side, aligned with the header). */
          <div className="scroll-shadow vertical-scrollbar scrollbar-lg h-full w-full overflow-y-auto px-1 pb-5 [scrollbar-gutter:stable_both-edges]">
            <div
              className={cn(
                "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
                isRailExpanded ? "xl:grid-cols-3" : "xl:grid-cols-4"
              )}
            >
              {filteredPages.map((page) => (
                <DocCard
                  key={page.id}
                  page={page}
                  pagesKey={pagesKey}
                  workspaceSlug={workspaceSlug}
                  getProjectById={getProjectById}
                  canModify={canDeleteDoc(page)}
                  isProjectScoped={Boolean(scopeProjectId)}
                  isSelected={Boolean(page.id && selectedDocIdSet.has(page.id))}
                  isSelectionActive={isSelectionActive}
                  onSelect={handleDocSelect}
                />
              ))}
            </div>
          </div>
        ) : (
          <ListLayout>
            {filteredPages.map((page) => (
              <DocListItem
                key={page.id}
                page={page}
                workspaceSlug={workspaceSlug}
                getProjectById={getProjectById}
                isSelected={Boolean(page.id && selectedDocIdSet.has(page.id))}
                isSelectionActive={isSelectionActive}
                onSelect={handleDocSelect}
              />
            ))}
          </ListLayout>
        )}
        {selectedDocs.length > 0 && (
          <DocsBulkActionBar
            selectedPages={selectedDocs}
            workspaceSlug={workspaceSlug}
            joinedProjectIds={joinedProjectIds ?? []}
            getProjectById={getProjectById}
            canDeleteDoc={canDeleteDoc}
            onClear={clearDocSelection}
            onRefresh={refreshPages}
          />
        )}
      </div>
    </div>
  );
});

type FilterSummaryPillProps = {
  label: string;
  isActive: boolean;
  className?: string;
};

function FilterSummaryPill({ label, isActive, className }: FilterSummaryPillProps) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span>{label}</span>
      <ChevronDown className={cn("size-3", { "text-accent-primary": isActive })} />
    </span>
  );
}

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
            className={cn("t-press grid size-6 place-items-center rounded-lg text-tertiary hover:text-primary", {
              "bg-layer-1 text-primary": isActive,
            })}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}

const isProjectBriefPage = (page: TPage) => isBriefPage(page);

const getWorkspaceDocDisplayName = (page: TPage, projectName: string | undefined) =>
  isProjectBriefPage(page) ? getBriefPageDisplayName(projectName) : getPageName(page.name);

type DocListItemProps = {
  page: TPage;
  workspaceSlug: string;
  getProjectById: ReturnType<typeof useProject>["getProjectById"];
  isSelected: boolean;
  isSelectionActive: boolean;
  onSelect: (pageId: string, isRange: boolean) => void;
};

function DocListItem({
  page,
  workspaceSlug,
  getProjectById,
  isSelected,
  isSelectionActive,
  onSelect,
}: DocListItemProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { isMobile } = usePlatformOS();
  const projectIds = page.project_ids ?? [];
  const primaryProjectId = projectIds[0];
  const primaryProject = primaryProjectId ? getProjectById(primaryProjectId) : undefined;
  const isProjectBrief = isProjectBriefPage(page);
  const displayName = getWorkspaceDocDisplayName(page, primaryProject?.name);
  const itemLink =
    primaryProjectId && (isProjectBrief || page.id)
      ? `/${workspaceSlug}/projects/${primaryProjectId}/${isProjectBrief ? "brief" : `pages/${page.id}/`}`
      : "#";
  const FallbackIcon =
    page.page_type === "pdf"
      ? FileText
      : page.page_type === "whiteboard"
        ? Whiteboard
        : page.page_type === "sheet"
          ? GridIconShim
          : PageIcon;
  const pdfMeta = page.page_type === "pdf" ? page.view_props?.pdf : undefined;
  const tags = normalizeTags((page.view_props as Record<string, unknown> | undefined)?.tags);

  return (
    <ListItem
      prependTitleElement={
        <span className="flex items-center gap-2">
          {page.id && (
            <DocSelectionCheckbox
              pageId={page.id}
              isSelected={isSelected}
              isSelectionActive={isSelectionActive}
              onSelect={onSelect}
            />
          )}
          {page.logo_props?.in_use ? (
            <Logo logo={page.logo_props} size={16} type="lucide" />
          ) : (
            <FallbackIcon className={cn("h-4 w-4 text-tertiary", { "text-accent-primary": isProjectBrief })} />
          )}
        </span>
      }
      title={displayName}
      itemLink={itemLink}
      onItemClick={(e) => {
        if (!page.id) return;
        // ⌘/Ctrl+click toggles; shift+click selects a range; once a selection is
        // active, a plain click keeps toggling instead of opening.
        if (e.metaKey || e.ctrlKey || e.shiftKey || isSelectionActive) {
          e.preventDefault();
          onSelect(page.id, e.shiftKey);
        }
      }}
      isMobile={isMobile}
      parentRef={parentRef}
      disableLink={!primaryProjectId}
      className={cn({
        "bg-accent-primary/5 hover:bg-accent-primary/10": isProjectBrief,
      })}
      titleClassName={cn("font-semibold text-secondary", { "text-accent-primary": isProjectBrief })}
      actionableItems={
        <div className="flex items-center gap-3 text-13 text-tertiary">
          {pdfMeta && <span className="shrink-0 text-11">PDF | {convertBytesToSize(pdfMeta.size)}</span>}
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
  pagesKey: string;
  workspaceSlug: string;
  getProjectById: ReturnType<typeof useProject>["getProjectById"];
  /** Whether the current user can archive/delete this doc (owner or project admin). */
  canModify: boolean;
  /** When viewing a single project's docs, the project name is redundant — hide it. */
  isProjectScoped: boolean;
  isSelected: boolean;
  isSelectionActive: boolean;
  onSelect: (pageId: string, isRange: boolean) => void;
};

// Muted per-type accent hues for the tinted icon tile. Briefs keep the brand
// accent instead (handled in the card). doc/whiteboard/sheet/pdf → plum/sage/steel/clay.
const DOC_CARD_TYPE_TINT: Record<string, string> = {
  doc: "#9d4b7c",
  sheet: "#5f8d6f",
  whiteboard: "#6b73a8",
  pdf: "#b5654a",
};

function DocCard({
  page,
  pagesKey,
  workspaceSlug,
  getProjectById,
  canModify,
  isProjectScoped,
  isSelected,
  isSelectionActive,
  onSelect,
}: DocCardProps) {
  const { mutate } = useSWRConfig();
  const projectIds = page.project_ids ?? [];
  const primaryProjectId = projectIds[0];
  const primaryProject = primaryProjectId ? getProjectById(primaryProjectId) : undefined;
  const isProjectBrief = isProjectBriefPage(page);
  const displayName = getWorkspaceDocDisplayName(page, primaryProject?.name);
  const itemLink =
    primaryProjectId && page.id
      ? `/${workspaceSlug}/projects/${primaryProjectId}/${isProjectBrief ? "brief" : `pages/${page.id}/`}`
      : null;
  // Per-type filled glyph for the tile; docs & briefs share the document glyph.
  const TypeIcon =
    page.page_type === "pdf"
      ? FileIcon
      : page.page_type === "whiteboard"
        ? Whiteboard
        : page.page_type === "sheet"
          ? GridIconShim
          : DocumentText;
  const typeTint = DOC_CARD_TYPE_TINT[page.page_type ?? "doc"] ?? DOC_CARD_TYPE_TINT.doc;
  // word_count is supplied by the workspace pages list endpoint; absent until the API ships it.
  const wordCount = (page as TPage & { word_count?: number }).word_count;
  const pdfMeta = page.page_type === "pdf" ? page.view_props?.pdf : undefined;
  // Type-appropriate detail: PDF size, or estimated read time (~200 wpm) for docs.
  const detail = pdfMeta
    ? convertBytesToSize(pdfMeta.size)
    : typeof wordCount === "number" && wordCount > 0
      ? `${Math.max(1, Math.round(wordCount / 200))} min read`
      : undefined;
  // Subtitle line. On a project page the project name is redundant, so we show
  // only the detail (read time); across the workspace we prefix the project name.
  const metaText = [isProjectScoped ? undefined : primaryProject?.name, detail].filter(Boolean).join(" · ");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const refreshPages = async () => {
    await mutate(pagesKey);
  };

  const handleCopyLink = async () => {
    if (!itemLink) return;
    await copyUrlToClipboard(itemLink);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "Link copied",
      message: "Page link copied to clipboard.",
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
    if (isProjectBrief) {
      setToast({
        type: TOAST_TYPE.WARNING,
        title: "Briefs are protected",
        message: "Project briefs can't be archived.",
      });
      return;
    }
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

  const handleDelete = () => {
    if (!primaryProjectId || !page.id) return;
    if (isProjectBrief) {
      setToast({
        type: TOAST_TYPE.WARNING,
        title: "Briefs are protected",
        message: "Project briefs can't be deleted.",
      });
      return;
    }
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!primaryProjectId || !page.id) return;
    setIsDeleting(true);
    try {
      if (!page.archived_at) await pageService.archive(workspaceSlug, primaryProjectId, page.id);
      await pageService.remove(workspaceSlug, primaryProjectId, page.id);
      await refreshPages();
      setIsDeleteModalOpen(false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Page deleted successfully.",
      });
    } catch (error) {
      await refreshPages().catch(() => undefined);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: pageActionErrorMessage(error, "Page could not be deleted. Please try again later."),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const card = (
    <div
      className={cn(
        "group t-press relative flex h-[156px] flex-col justify-between rounded-2xl p-4 transition-colors",
        {
          "bg-layer-1 hover:bg-layer-3": !isProjectBrief && !isSelected,
          "bg-accent-primary/5 hover:bg-accent-primary/10": isProjectBrief && !isSelected,
          "bg-layer-1 ring-1 ring-strong": isSelected,
          "opacity-60": !itemLink,
        }
      )}
    >
      {/* Selection checkbox — top-left, shown on hover or while a selection is active */}
      {page.id && (
        <button
          type="button"
          aria-label={isSelected ? "Deselect doc" : "Select doc"}
          onClick={(e) => {
            if (!page.id) return;
            e.preventDefault();
            e.stopPropagation();
            onSelect(page.id, e.shiftKey);
          }}
          className={cn(
            "absolute top-2 left-2 z-10 grid size-6 place-items-center rounded-lg bg-layer-2 transition-opacity hover:bg-layer-3",
            {
              "opacity-100": isSelected || isSelectionActive,
              "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100": !isSelected && !isSelectionActive,
            }
          )}
        >
          <Checkbox
            checked={isSelected}
            readOnly
            tabIndex={-1}
            className="pointer-events-none size-3.5 !outline-none"
            iconClassName="size-3"
          />
        </button>
      )}
      {/* Actions menu — top-right, on hover */}
      {primaryProjectId && page.id && (
        <div className="absolute top-2 right-2 z-10 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <CustomMenu
            ariaLabel="Page actions"
            placement="bottom-end"
            closeOnSelect
            useCaptureForOutsideClick
            customButton={
              <span className="shadow-sm grid size-6 place-items-center rounded-lg bg-layer-2 text-tertiary hover:bg-layer-3 hover:text-primary">
                <MoreHorizontal weight="Bold" className="size-4" />
              </span>
            }
          >
            <CustomMenu.MenuItem onClick={() => void handleCopyLink()}>
              <span className="flex items-center gap-2">
                <DetailIcon icon={LinkSquare01Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
                Copy link
              </span>
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={() => void handleDuplicate()}>
              <span className="flex items-center gap-2">
                <DetailIcon icon={Copy01Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
                Duplicate
              </span>
            </CustomMenu.MenuItem>
            {!isProjectBrief && canModify && (
              <>
                <CustomMenu.MenuItem onClick={() => void handleArchive()}>
                  <span className="flex items-center gap-2">
                    {page.archived_at ? (
                      <ArchiveRestoreIcon className="size-4" />
                    ) : (
                      <DetailIcon icon={Archive02Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
                    )}
                    {page.archived_at ? "Restore" : "Archive"}
                  </span>
                </CustomMenu.MenuItem>
                <CustomMenu.MenuItem
                  onClick={() => void handleDelete()}
                  className="text-red-500 hover:!bg-red-500/10 hover:!text-red-500"
                >
                  <span className="flex items-center gap-2">
                    <DetailIcon icon={Delete02Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
                    Delete
                  </span>
                </CustomMenu.MenuItem>
              </>
            )}
          </CustomMenu>
        </div>
      )}
      {/* Type tile — the doc's own logo, or a filled type glyph on a muted tint.
          Briefs keep the brand accent; other types use their muted per-type hue. */}
      <span
        className={cn(
          "grid size-9 place-items-center rounded-[10px]",
          isProjectBrief && "bg-accent-primary/10 text-accent-primary"
        )}
        style={
          isProjectBrief
            ? undefined
            : { color: typeTint, backgroundColor: `color-mix(in srgb, ${typeTint} 14%, transparent)` }
        }
      >
        {page.logo_props?.in_use ? (
          <Logo logo={page.logo_props} size={20} type="lucide" />
        ) : (
          <TypeIcon weight="Bold" className="size-5" />
        )}
      </span>
      <div className="flex flex-col gap-0.5">
        <h3
          className={cn(
            "line-clamp-2 text-13 leading-snug font-semibold text-secondary transition-colors group-hover:text-primary",
            { "text-accent-primary": isProjectBrief }
          )}
        >
          {displayName}
        </h3>
        {metaText && <p className="truncate text-11 text-placeholder">{metaText}</p>}
      </div>
    </div>
  );

  const deleteModal = (
    <AlertModalCore
      isOpen={isDeleteModalOpen}
      handleClose={() => {
        if (isDeleting) return;
        setIsDeleteModalOpen(false);
      }}
      handleSubmit={() => void confirmDelete()}
      isSubmitting={isDeleting}
      title="Delete doc"
      content={`Delete ${displayName}? This can't be undone.`}
    />
  );

  if (!itemLink)
    return (
      <>
        {card}
        {deleteModal}
      </>
    );
  return (
    <>
      <Link
        to={itemLink}
        className="focus-visible:ring-accent-primary/40 block rounded-lg focus:outline-none focus-visible:ring-2"
        onClick={(e) => {
          if (!page.id) return;
          // ⌘/Ctrl+click toggles; shift+click selects a range; once a selection is
          // active, a plain click keeps toggling instead of opening.
          if (e.metaKey || e.ctrlKey || e.shiftKey || isSelectionActive) {
            e.preventDefault();
            onSelect(page.id, e.shiftKey);
          }
        }}
      >
        {card}
      </Link>
      {deleteModal}
    </>
  );
}

type DocSelectionCheckboxProps = {
  pageId: string;
  isSelected: boolean;
  isSelectionActive: boolean;
  onSelect: (pageId: string, isRange: boolean) => void;
};

function DocSelectionCheckbox({ pageId, isSelected, isSelectionActive, onSelect }: DocSelectionCheckboxProps) {
  return (
    <Checkbox
      aria-label={isSelected ? "Deselect doc" : "Select doc"}
      checked={isSelected}
      className="size-3.5 !outline-none"
      containerClassName={cn("transition-opacity", {
        "pointer-events-auto opacity-100": isSelected || isSelectionActive,
        "pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100":
          !isSelected && !isSelectionActive,
      })}
      iconClassName="size-3"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(pageId, e.shiftKey);
      }}
      readOnly
    />
  );
}

type BulkOperation = "delete" | "duplicate" | "move";

type DocsBulkActionBarProps = {
  selectedPages: TPage[];
  workspaceSlug: string;
  joinedProjectIds: string[];
  getProjectById: ReturnType<typeof useProject>["getProjectById"];
  canDeleteDoc: (page: TPage) => boolean;
  onClear: () => void;
  onRefresh: () => Promise<void>;
};

type BulkActionPage = {
  page: TPage;
  pageId: string;
  projectId: string;
  isProjectBrief: boolean;
};

const docLabel = (value: number) => (value === 1 ? "doc" : "docs");
const skippedBriefMessage = (value: number) =>
  value > 0 ? ` ${value} ${value === 1 ? "brief was" : "briefs were"} skipped.` : "";
const skippedDocsMessage = (value: number) =>
  value > 0 ? ` ${value} ${value === 1 ? "doc was" : "docs were"} skipped.` : "";

function DocsBulkActionBar({
  selectedPages,
  workspaceSlug,
  joinedProjectIds,
  getProjectById,
  canDeleteDoc,
  onClear,
  onRefresh,
}: DocsBulkActionBarProps) {
  const [operation, setOperation] = useState<BulkOperation | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  // Flip on after mount so the bar rises into place (t-panel-slide) instead of
  // popping in the moment a selection is made.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isBusy = operation !== null;
  const count = selectedPages.length;
  const actionPages = useMemo(
    () =>
      selectedPages
        .map((page): BulkActionPage | undefined => {
          const pageId = page.id;
          const projectId = page.project_ids?.[0];
          if (!pageId || !projectId) return undefined;
          return { page, pageId, projectId, isProjectBrief: isProjectBriefPage(page) };
        })
        .filter((page): page is BulkActionPage => Boolean(page)),
    [selectedPages]
  );
  const movablePages = useMemo(() => actionPages.filter((page) => !page.isProjectBrief), [actionPages]);
  // Deletable = not a brief AND the user can delete it (owner or project admin),
  // so the bulk count and the modal only ever reflect docs that will succeed.
  const deletablePages = useMemo(
    () => actionPages.filter((page) => !page.isProjectBrief && canDeleteDoc(page.page)),
    [actionPages, canDeleteDoc]
  );
  const skippedFromDelete = actionPages.length - deletablePages.length;
  const moveTargetProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    return sortBy(
      (joinedProjectIds ?? [])
        .map((id) => getProjectById(id))
        .filter((project): project is NonNullable<typeof project> => Boolean(project))
        .filter((project) => (q ? project.name.toLowerCase().includes(q) : true)),
      [(project) => project.name.toLowerCase()]
    );
  }, [getProjectById, joinedProjectIds, projectSearch]);

  const finishBulkOperation = async (
    currentOperation: BulkOperation,
    pagesToProcess: BulkActionPage[],
    processPage: (page: BulkActionPage) => Promise<unknown>,
    successMessage: (processedCount: number) => string,
    errorMessage: (failedCount: number, processedCount: number) => string
  ) => {
    if (pagesToProcess.length === 0) return;
    setOperation(currentOperation);
    try {
      const results = await Promise.allSettled(pagesToProcess.map(processPage));
      const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      const failedCount = rejected.length;
      await onRefresh().catch(() => undefined);

      if (failedCount === 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: successMessage(pagesToProcess.length),
        });
        onClear();
      } else {
        // Surface the underlying API reason (e.g. permissions / not archived)
        // instead of only the count, which hides why every item failed.
        console.error(
          "Docs bulk operation failed:",
          rejected.map((result) => result.reason)
        );
        const reason = pageActionErrorMessage(rejected[0]?.reason, "");
        const baseMessage = errorMessage(failedCount, pagesToProcess.length);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: reason ? `${baseMessage} ${reason}` : baseMessage,
        });
      }
    } finally {
      setOperation(null);
    }
  };

  const handleBulkDelete = () => {
    if (isBusy || actionPages.length === 0) return;
    if (deletablePages.length === 0) {
      setToast({
        type: TOAST_TYPE.WARNING,
        title: "Nothing to delete",
        message: "You can only delete docs you own or manage as a project admin.",
      });
      return;
    }
    setIsDeleteModalOpen(true);
  };

  const confirmBulkDelete = async () => {
    await finishBulkOperation(
      "delete",
      deletablePages,
      async ({ page, pageId, projectId }) => {
        if (!page.archived_at) await pageService.archive(workspaceSlug, projectId, pageId);
        await pageService.remove(workspaceSlug, projectId, pageId);
      },
      (processedCount) =>
        `${processedCount} ${docLabel(processedCount)} deleted.${skippedDocsMessage(skippedFromDelete)}`,
      (failedCount, processedCount) =>
        `Couldn't delete ${failedCount} of ${processedCount} selected ${docLabel(processedCount)}.`
    );
    setIsDeleteModalOpen(false);
  };

  const handleBulkDuplicate = async () => {
    if (isBusy || actionPages.length === 0) return;

    await finishBulkOperation(
      "duplicate",
      actionPages,
      async ({ pageId, projectId }) => await pageService.duplicate(workspaceSlug, projectId, pageId),
      (processedCount) => `${processedCount} ${docLabel(processedCount)} duplicated.`,
      (failedCount, processedCount) =>
        `Couldn't duplicate ${failedCount} of ${processedCount} selected ${docLabel(processedCount)}.`
    );
  };

  const handleBulkMove = async (targetProjectId: string) => {
    if (isBusy) return;
    const targetProject = getProjectById(targetProjectId);
    const pagesToMove = movablePages.filter(({ projectId }) => projectId !== targetProjectId);
    const skippedBriefCount = actionPages.length - movablePages.length;

    if (pagesToMove.length === 0) {
      setToast({
        type: TOAST_TYPE.WARNING,
        title: "Nothing to move",
        message:
          skippedBriefCount > 0
            ? "Project briefs stay with their projects."
            : "The selected docs are already in that project.",
      });
      return;
    }

    await finishBulkOperation(
      "move",
      pagesToMove,
      async ({ pageId, projectId }) => await pageService.move(workspaceSlug, projectId, pageId, targetProjectId),
      (processedCount) =>
        `${processedCount} ${docLabel(processedCount)} moved${targetProject ? ` to ${targetProject.name}` : ""}.${skippedBriefMessage(skippedBriefCount)}`,
      (failedCount, processedCount) =>
        `Couldn't move ${failedCount} of ${processedCount} selected ${docLabel(processedCount)}.`
    );
  };

  return (
    <>
      <AlertModalCore
        isOpen={isDeleteModalOpen}
        handleClose={() => {
          if (isBusy) return;
          setIsDeleteModalOpen(false);
        }}
        handleSubmit={() => void confirmBulkDelete()}
        isSubmitting={isBusy}
        title={`Delete ${deletablePages.length} ${docLabel(deletablePages.length)}`}
        content={`Delete ${deletablePages.length} selected ${docLabel(deletablePages.length)}? This can't be undone.${
          skippedFromDelete > 0 ? " Docs you can't delete will be skipped." : ""
        }`}
      />
      <div
        role="toolbar"
        aria-label={`${count} docs selected`}
        className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
      >
        <div
          className="t-panel-slide shadow-lg pointer-events-auto flex max-w-full items-center gap-2 rounded-xl border border-strong bg-surface-1 px-3 py-2"
          data-open={mounted ? "true" : "false"}
        >
          <span className="shrink-0 px-1 text-11 font-medium">
            <span className="text-primary">{count}</span>{" "}
            <span className="text-tertiary">{docLabel(count)} selected</span>
          </span>
          <div className="bg-strong h-4 w-px" aria-hidden />
          <Button variant="ghost" size="lg" onClick={onClear} disabled={isBusy} aria-label="Clear selection">
            <X className="size-3.5" />
            <span>Clear</span>
          </Button>
          <CustomMenu
            ariaLabel="Move selected docs"
            placement="top-start"
            maxHeight="lg"
            closeOnSelect={false}
            disabled={isBusy || movablePages.length === 0}
            customButtonClassName={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-lg border border-strong bg-layer-2 px-2 text-11 font-medium text-secondary shadow-raised-100 hover:bg-layer-2-hover active:bg-layer-2-active",
              { "cursor-not-allowed opacity-60": isBusy || movablePages.length === 0 }
            )}
            customButton={
              <>
                <Folder className="size-3.5" />
                <span>{operation === "move" ? "Moving..." : "Move"}</span>
                <ChevronDown className="size-3" />
              </>
            }
            optionsClassName="w-64"
          >
            <div className="p-1">
              <div className="flex items-center gap-1.5 rounded-lg border border-subtle bg-canvas px-2 py-1">
                <Search className="size-3 text-tertiary" />
                <input
                  type="text"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  placeholder="Search projects"
                  className="w-full bg-transparent text-11 text-primary outline-none placeholder:text-placeholder"
                />
              </div>
            </div>
            {moveTargetProjects.length > 0 ? (
              moveTargetProjects.map((project) => {
                const alreadyInProject =
                  movablePages.length > 0 && movablePages.every((page) => page.projectId === project.id);
                return (
                  <CustomMenu.MenuItem
                    key={project.id}
                    disabled={isBusy || alreadyInProject}
                    onClick={() => void handleBulkMove(project.id)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="grid h-4 w-4 flex-shrink-0 place-items-center">
                        <Logo logo={project.logo_props} size={12} />
                      </span>
                      <span className="truncate">{project.name}</span>
                      {alreadyInProject && <span className="ml-auto shrink-0 text-10 text-tertiary">Current</span>}
                    </span>
                  </CustomMenu.MenuItem>
                );
              })
            ) : (
              <CustomMenu.MenuItem disabled>
                <span className="text-tertiary">No matching projects</span>
              </CustomMenu.MenuItem>
            )}
          </CustomMenu>
          <Button variant="secondary" size="lg" onClick={handleBulkDuplicate} disabled={isBusy} aria-label="Duplicate">
            <DetailIcon icon={Copy01Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
            <span>{operation === "duplicate" ? "Duplicating..." : "Duplicate"}</span>
          </Button>
          <Button
            variant="error-outline"
            size="lg"
            onClick={handleBulkDelete}
            disabled={isBusy || deletablePages.length === 0}
            aria-label="Delete"
          >
            <DetailIcon icon={Delete02Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
            <span>{operation === "delete" ? "Deleting..." : "Delete"}</span>
          </Button>
        </div>
      </div>
    </>
  );
}

const TYPE_FILTER_META: Record<TPageType, { label: string; Icon: typeof FileText }> = {
  doc: { label: "Docs", Icon: FileText },
  whiteboard: { label: "Whiteboards", Icon: Whiteboard },
  pdf: { label: "PDFs", Icon: FileIcon },
  sheet: { label: "Sheets", Icon: GridIconShim },
};

type TypeFilterSectionProps = {
  availableTypes: TPageType[];
  appliedFilters: TPageType[];
  onToggle: (type: TPageType) => void;
  onClear: () => void;
};

/** Doc-type filter — same FilterHeader/FilterOption pattern as My Tasks. */
function TypeFilterSection({ availableTypes, appliedFilters, onToggle, onClear }: TypeFilterSectionProps) {
  const [previewEnabled, setPreviewEnabled] = useState(true);

  return (
    <div className="flex flex-col px-2 py-2">
      <FilterHeader
        title={`Type${appliedFilters.length > 0 ? ` (${appliedFilters.length})` : ""}`}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      {previewEnabled &&
        availableTypes.map((type) => {
          const meta = TYPE_FILTER_META[type];
          return (
            <FilterOption
              key={`doc-type-${type}`}
              isChecked={appliedFilters.includes(type)}
              onClick={() => onToggle(type)}
              icon={<meta.Icon className="h-3.5 w-3.5 flex-shrink-0 text-tertiary" />}
              title={meta.label}
            />
          );
        })}
      {previewEnabled && appliedFilters.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="mt-1 w-full text-left text-11 text-tertiary hover:text-primary"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}

const ACCESS_FILTER_OPTIONS: { value: EPageAccess; label: string }[] = [
  { value: EPageAccess.PUBLIC, label: "Public" },
  { value: EPageAccess.PRIVATE, label: "Private" },
];

type AccessFilterSectionProps = {
  appliedFilters: EPageAccess[];
  showArchived: boolean;
  onToggle: (access: EPageAccess) => void;
  onToggleArchived: () => void;
  onClear: () => void;
};

/** Access filter (Public/Private + Archived) — same pattern as My Tasks. */
function AccessFilterSection({
  appliedFilters,
  showArchived,
  onToggle,
  onToggleArchived,
  onClear,
}: AccessFilterSectionProps) {
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const appliedCount = appliedFilters.length + (showArchived ? 1 : 0);

  return (
    <div className="flex flex-col px-2 py-2">
      <FilterHeader
        title={`Access${appliedCount > 0 ? ` (${appliedCount})` : ""}`}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      <Collapse open={previewEnabled}>
        <>
          {ACCESS_FILTER_OPTIONS.map((option) => (
            <FilterOption
              key={`doc-access-${option.value}`}
              isChecked={appliedFilters.includes(option.value)}
              onClick={() => onToggle(option.value)}
              title={option.label}
            />
          ))}
          <FilterOption
            key="doc-access-archived"
            isChecked={showArchived}
            onClick={onToggleArchived}
            title="Archived"
          />
          {appliedCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="mt-1 w-full text-left text-11 text-tertiary hover:text-primary"
            >
              Clear filter
            </button>
          )}
        </>
      </Collapse>
    </div>
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

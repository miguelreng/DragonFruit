/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
import { Collapse } from "@/components/common/collapse";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { sortBy } from "lodash-es";
import { observer } from "mobx-react";
import { Link, useSearchParams } from "react-router";
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
  ArrowRightLeft,
  ChevronDown,
  File as FileIcon,
  FileText,
  Folder,
  FolderPlus,
  GridIconShim,
  Pencil,
  Search,
  Settings,
  Star,
  UploadCloud,
  Whiteboard,
  X,
} from "@/components/icons/lucide-shim";
import { Button, getButtonStyling } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { GlobeIcon, PageIcon } from "@/components/icons/propel-shim";
import { ArchiveRestoreIcon } from "@/components/icons/lucide-shim";
import { Folder as SolarFolder, Home as SolarHome } from "@solar-icons/react/ssr";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import {
  AlertModalCore,
  Avatar,
  Breadcrumbs,
  Checkbox,
  CustomMenu,
  EModalPosition,
  EModalWidth,
  Header,
  ModalCore,
} from "@plane/ui";
import { cn, convertBytesToSize, copyUrlToClipboard, getFileURL, getPageName, renderFormattedDate } from "@plane/utils";
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
import { useFavorite } from "@/hooks/store/use-favorite";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { EUserPermissions } from "@plane/constants";
import { usePlatformOS } from "@/hooks/use-platform-os";
import useLocalStorage from "@/hooks/use-local-storage";
import { normalizeTags } from "@/helpers/tags";
import { ProjectPageService } from "@/services/page/project-page.service";
import { buildPublicPageUrl, getPublicPageSlug } from "@/helpers/page-public";
import { WikiImportModal } from "./import/wiki-import-modal";
import { WikiSettingsModal } from "./wiki-settings-modal";
import { WikiSharePopover } from "./wiki-share-popover";
import { WorkspaceCreateDocButton } from "./workspace-create-doc-button";
import { isMarkdownFile, useCreateMarkdownDocPage } from "./use-create-markdown-doc";
import { isPdfFile, useCreatePdfPage } from "./use-create-pdf-page";
import {
  DOC_CARD_STYLE_STORAGE_KEY,
  DOC_CARD_TYPE_LABEL,
  DOC_CARD_TYPE_TINT,
  DocCardPreviewSurface,
  getDocPreviewIcon,
  type TDocCardStyle,
} from "./doc-card-preview";

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
const DEFAULT_FOLDER_NAME = "Untitled";
const DOCS_PAGE_DRAG_TYPE = "workspace-doc-page";
const isFileDrag = (event: ReactDragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

type DocsPageDragData = {
  type: typeof DOCS_PAGE_DRAG_TYPE;
  pageId: string;
  projectId: string;
  title: string;
  parent: string | null;
  pageType: TPageType;
};

type DocDragPreviewProps = {
  title: string;
  metaText?: string;
  pageType: TPageType;
  logoProps?: TPage["logo_props"];
  typeTint: string;
  isProjectBrief: boolean;
};

const isDocsPageDragData = (data: Record<string | symbol, unknown> | undefined): data is DocsPageDragData =>
  data?.type === DOCS_PAGE_DRAG_TYPE &&
  typeof data.pageId === "string" &&
  typeof data.projectId === "string" &&
  typeof data.title === "string";

function DocDragPreview({ title, metaText, pageType, logoProps, typeTint, isProjectBrief }: DocDragPreviewProps) {
  const PreviewIcon = getDocPreviewIcon(pageType);
  return (
    <div className="shadow-lg flex w-[240px] items-center gap-3 rounded-xl border border-strong bg-surface-1 px-3 py-2 text-13">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-[10px]",
          isProjectBrief && "bg-accent-primary/10 text-accent-primary"
        )}
        style={
          isProjectBrief
            ? undefined
            : { color: typeTint, backgroundColor: `color-mix(in srgb, ${typeTint} 14%, transparent)` }
        }
      >
        {logoProps?.in_use ? <Logo logo={logoProps} size={18} type="lucide" /> : <PreviewIcon className="size-4" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-primary">{title}</span>
        {metaText && <span className="block truncate text-11 text-tertiary">{metaText}</span>}
      </span>
    </div>
  );
}

function useDocsPageDraggable<TElement extends HTMLElement>({
  elementRef,
  enabled,
  dragData,
  preview,
  setIsDragging,
}: {
  elementRef: RefObject<TElement | null>;
  enabled: boolean;
  dragData: DocsPageDragData | null;
  preview: DocDragPreviewProps;
  setIsDragging: (value: boolean) => void;
}) {
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled || !dragData) return;

    return draggable({
      element,
      getInitialData: () => dragData,
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        setCustomNativeDragPreview({
          getOffset: pointerOutsideOfPreview({ x: "12px", y: "8px" }),
          render: ({ container }) => {
            const root = createRoot(container);
            root.render(<DocDragPreview {...preview} />);
            return () => root.unmount();
          },
          nativeSetDragImage,
        });
      },
    });
  }, [dragData, elementRef, enabled, preview, setIsDragging]);
}

function useFolderDocDropTarget<TElement extends HTMLElement>({
  elementRef,
  folder,
  onDropDoc,
  setIsDropTargetActive,
}: {
  elementRef: RefObject<TElement | null>;
  folder: TPage;
  onDropDoc: (dragData: DocsPageDragData, folder: TPage) => void | Promise<void>;
  setIsDropTargetActive: (value: boolean) => void;
}) {
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !folder.id) return;

    return dropTargetForElements({
      element,
      canDrop: ({ source }) => {
        const dragData = isDocsPageDragData(source.data) ? source.data : null;
        return Boolean(
          dragData &&
          dragData.parent !== folder.id &&
          dragData.pageId &&
          (folder.project_ids ?? []).includes(dragData.projectId)
        );
      },
      getData: () => ({ folderId: folder.id }),
      onDragEnter: () => setIsDropTargetActive(true),
      onDragLeave: () => setIsDropTargetActive(false),
      onDrop: ({ source }) => {
        setIsDropTargetActive(false);
        const dragData = isDocsPageDragData(source.data) ? source.data : null;
        if (!dragData) return;
        void onDropDoc(dragData, folder);
      },
    });
  }, [elementRef, folder, onDropDoc, setIsDropTargetActive]);
}

// Page service methods reject with the API response body (e.g. {error: "..."}),
// a bare string, or an Axios error. Pull out the human-readable reason so the
// real cause (403/locked/not-archived) surfaces instead of a generic message.
const pageActionErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (Array.isArray(error))
    return error
      .map((item) => pageActionErrorMessage(item, ""))
      .filter(Boolean)
      .join(" ");
  if (!error || typeof error !== "object") return fallback;

  const data = error as { error?: unknown; detail?: unknown; message?: unknown };
  const detail = data.error ?? data.detail ?? data.message;
  if (detail !== undefined) return pageActionErrorMessage(detail, fallback);

  const fieldErrors = Object.entries(error)
    .map(([field, value]) => {
      const message = pageActionErrorMessage(value, "");
      return message ? `${field}: ${message}` : "";
    })
    .filter(Boolean)
    .join(" ");
  if (fieldErrors) return fieldErrors;

  return fallback;
};

type ViewMode = "list" | "grid";
/** Grid card treatment (paper = Craft-style, tile = Drive-style) — shared with
 * Home's Recent docs via doc-card-preview. */
type DocCardStyle = TDocCardStyle;

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
  const { addFavorite, removeFavoriteEntity, removeFavoriteFromStore, entityMap: favoriteEntityMap } = useFavorite();
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
  // Shared across surfaces (docs, whiteboards, project tabs, Home) so the pick sticks everywhere.
  const { storedValue: storedCardStyle, setValue: setCardStyle } = useLocalStorage<DocCardStyle>(
    DOC_CARD_STYLE_STORAGE_KEY,
    "paper"
  );
  const cardStyle: DocCardStyle = storedCardStyle ?? "paper";
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

  // ----- Folders (docs surface only) -----
  // A folder is a page with page_type "folder"; docs point their `parent` at
  // it. Folders never open in an editor — clicking one drills the list in.
  const foldersEnabled = activePageTypes.includes("doc");
  const folders = useMemo(
    () =>
      foldersEnabled
        ? sortBy(
            (pages ?? []).filter(
              (p) =>
                p.page_type === "folder" &&
                !p.archived_at &&
                (!scopeProjectId || (p.project_ids ?? []).includes(scopeProjectId))
            ),
            [(f) => getPageName(f.name).toLowerCase()]
          )
        : [],
    [foldersEnabled, pages, scopeProjectId]
  );
  const folderIdSet = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);
  // Folder drill-in lives in the URL (?folder=<pageId>) so folders can be
  // deep-linked (favorites, shared links) and browser back exits the folder.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFolderId = searchParams.get("folder");
  const setActiveFolderId = useCallback(
    (folderId: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (folderId) next.set("folder", folderId);
        else next.delete("folder");
        return next;
      });
    },
    [setSearchParams]
  );
  const activeFolder = activeFolderId ? folders.find((f) => f.id === activeFolderId) : undefined;
  // Folder rename modal and delete confirm.
  const [folderNameModal, setFolderNameModal] = useState<{ folder: TPage | null } | null>(null);
  const [isInlineFolderDraftVisible, setIsInlineFolderDraftVisible] = useState(false);
  const [inlineFolderName, setInlineFolderName] = useState("");
  const [isSavingInlineFolder, setIsSavingInlineFolder] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<TPage | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const inlineFolderInputRef = useRef<HTMLInputElement>(null);
  const inlineFolderSaveInFlightRef = useRef(false);
  const [wikiImportFiles, setWikiImportFiles] = useState<File[] | null>(null);
  // Folder-card "Create wiki" / "Wiki settings": both open the wiki modal for
  // the folder's EXISTING docs (publish toggle, link URL, doc order, accent) —
  // creating a wiki never uploads new files.
  const [wikiSettingsFolder, setWikiSettingsFolder] = useState<TPage | null>(null);
  useEffect(() => {
    // Deleted (or filtered-away) folder — fall back to the root list.
    if (activeFolderId && !isLoading && !folderIdSet.has(activeFolderId)) setActiveFolderId(null);
  }, [activeFolderId, folderIdSet, isLoading, setActiveFolderId]);

  const isSearching = searchQuery.trim().length > 0;
  const showFolderUi = foldersEnabled && !showArchived;
  // Docs scoped by the folder drill-in. Inside a folder, search narrows within
  // it; at the root, a search flattens across all folders. Docs whose parent
  // folder isn't visible (e.g. it was archived) fall back to the root list.
  const displayedDocs = useMemo(() => {
    if (!showFolderUi) return filteredPages;
    if (activeFolder?.id) return filteredPages.filter((p) => p.parent === activeFolder.id);
    if (isSearching) return filteredPages;
    return filteredPages.filter((p) => !p.parent || !folderIdSet.has(p.parent));
  }, [showFolderUi, filteredPages, activeFolder?.id, isSearching, folderIdSet]);
  const displayedFolders = showFolderUi && !activeFolder && !isSearching ? folders : [];
  const folderDocCounts = useMemo(() => {
    const counts = new Map<string, number>();
    visiblePages.forEach((p) => {
      if (p.parent) counts.set(p.parent, (counts.get(p.parent) ?? 0) + 1);
    });
    return counts;
  }, [visiblePages]);
  const canCreateFolder = showFolderUi && !!scopeProjectId && !activeFolder;
  const showInlineFolderDraft = canCreateFolder && isInlineFolderDraftVisible;

  useEffect(() => {
    if (!showInlineFolderDraft) return;
    const timeout = window.setTimeout(() => {
      inlineFolderInputRef.current?.focus();
      inlineFolderInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [showInlineFolderDraft, viewMode]);

  const handleFolderNameSubmit = async (name: string) => {
    const target = folderNameModal?.folder ?? null;
    const projectId = target ? target.project_ids?.[0] : scopeProjectId;
    if (!projectId) return;
    if (target?.id) await pageService.update(workspaceSlug, projectId, target.id, { name });
    else await pageService.create(workspaceSlug, projectId, { name, page_type: "folder", access: EPageAccess.PRIVATE });
    await mutatePages();
  };

  const startInlineFolderCreate = () => {
    if (!canCreateFolder) return;
    if (isInlineFolderDraftVisible) {
      if (!inlineFolderName.trim()) setInlineFolderName(DEFAULT_FOLDER_NAME);
      window.setTimeout(() => {
        inlineFolderInputRef.current?.focus();
        inlineFolderInputRef.current?.select();
      }, 0);
      return;
    }
    setInlineFolderName(DEFAULT_FOLDER_NAME);
    setIsInlineFolderDraftVisible(true);
  };

  const cancelInlineFolderCreate = () => {
    if (inlineFolderSaveInFlightRef.current) return;
    setInlineFolderName("");
    setIsInlineFolderDraftVisible(false);
  };

  const saveInlineFolder = async (rawName = inlineFolderName) => {
    if (inlineFolderSaveInFlightRef.current) return;
    const name = rawName.trim();
    if (!name) {
      cancelInlineFolderCreate();
      return;
    }
    if (!scopeProjectId) return;

    inlineFolderSaveInFlightRef.current = true;
    setIsSavingInlineFolder(true);
    try {
      await pageService.create(workspaceSlug, scopeProjectId, {
        name,
        page_type: "folder",
        access: EPageAccess.PRIVATE,
      });
      setInlineFolderName("");
      setIsInlineFolderDraftVisible(false);
      await mutatePages();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: pageActionErrorMessage(error, "Folder could not be saved. Please try again later."),
      });
      window.setTimeout(() => {
        inlineFolderInputRef.current?.focus();
        inlineFolderInputRef.current?.select();
      }, 0);
    } finally {
      inlineFolderSaveInFlightRef.current = false;
      setIsSavingInlineFolder(false);
    }
  };

  const confirmDeleteFolder = async () => {
    const folder = folderToDelete;
    const projectId = folder?.project_ids?.[0];
    if (!folder?.id || !projectId) return;
    setIsDeletingFolder(true);
    try {
      // Move contents back to the root first — archiving the folder would
      // otherwise cascade-archive every doc inside it.
      const children = (pages ?? []).filter((p) => p.parent === folder.id && p.id);
      await Promise.all(
        children.map((child) => pageService.update(workspaceSlug, projectId, child.id as string, { parent: null }))
      );
      // The API only deletes archived pages, so archive before removing.
      // Archiving also deletes any favorite server-side — mirror that locally
      // so the sidebar doesn't keep a dangling folder favorite.
      await pageService.archive(workspaceSlug, projectId, folder.id);
      await pageService.remove(workspaceSlug, projectId, folder.id);
      if (favoriteEntityMap[folder.id]) removeFavoriteFromStore(folder.id);
      if (activeFolderId === folder.id) setActiveFolderId(null);
      setFolderToDelete(null);
      await mutatePages();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: children.length > 0 ? "Folder deleted. Its docs are back in the main list." : "Folder deleted.",
      });
    } catch (error) {
      await mutatePages().catch(() => undefined);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: pageActionErrorMessage(error, "Folder could not be deleted. Please try again later."),
      });
    } finally {
      setIsDeletingFolder(false);
    }
  };

  // ----- Folder favorites -----
  // Folders are pages, so they ride the generic page-favorite plumbing; the
  // entity_data.page_type snapshot is what makes the sidebar render a folder
  // icon and deep-link back here (?folder=) instead of the page editor.
  const isFolderFavorited = useCallback(
    (folder: TPage) => Boolean(folder.id && favoriteEntityMap[folder.id]),
    [favoriteEntityMap]
  );
  const handleToggleFolderFavorite = useCallback(
    async (folder: TPage) => {
      if (!folder.id) return;
      const isFavorited = Boolean(favoriteEntityMap[folder.id]);
      try {
        if (isFavorited) await removeFavoriteEntity(workspaceSlug, folder.id);
        else
          await addFavorite(workspaceSlug, {
            entity_type: "page",
            entity_identifier: folder.id,
            project_id: folder.project_ids?.[0] ?? null,
            entity_data: { name: getPageName(folder.name), page_type: "folder" },
          });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: isFavorited ? "Folder removed from favorites." : "Folder added to favorites.",
        });
      } catch (error) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: pageActionErrorMessage(
            error,
            isFavorited ? "Folder could not be removed from favorites." : "Folder could not be added to favorites."
          ),
        });
      }
    },
    [addFavorite, favoriteEntityMap, removeFavoriteEntity, workspaceSlug]
  );

  const handleDocDropIntoFolder = useCallback(
    async (dragData: DocsPageDragData, folder: TPage) => {
      if (!folder.id) return;
      const folderProjectIds = folder.project_ids ?? [];
      if (dragData.parent === folder.id) return;
      if (!folderProjectIds.includes(dragData.projectId)) {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: "Can't move doc",
          message: "Docs can only be dropped into folders from the same project.",
        });
        return;
      }

      try {
        await pageService.update(workspaceSlug, dragData.projectId, dragData.pageId, { parent: folder.id });
        await mutatePages();
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Doc moved",
          message: `${dragData.title} moved to ${getPageName(folder.name)}.`,
        });
      } catch (error) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: pageActionErrorMessage(error, "Doc could not be moved. Please try again later."),
        });
      }
    },
    [mutatePages, workspaceSlug]
  );

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
    const order = displayedDocs.map((p) => p.id).filter((id): id is string => Boolean(id));
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

  // Drag-and-drop file import (PDF → pdf page, Markdown → converted doc).
  // Only where those types are actually listed and there is a project to
  // attach the page to (matches the New button's Upload file rule).
  const { createPdfPage, isUploading: isUploadingPdf } = useCreatePdfPage(workspaceSlug);
  const { createMarkdownDocPage, isConverting: isConvertingMarkdown } = useCreateMarkdownDocPage(workspaceSlug);
  const isImportingFiles = isUploadingPdf || isConvertingMarkdown;
  const canDropPdf = !!scopeProjectId && activePageTypes.includes("pdf");
  const canDropMarkdown = !!scopeProjectId && activePageTypes.includes("doc");
  const canDropFiles = canDropPdf || canDropMarkdown;
  const dropFileTypeLabel =
    canDropPdf && canDropMarkdown ? "PDF or Markdown files" : canDropPdf ? "PDF files" : "Markdown files";
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragDepth = useRef(0);

  const handleFileDragEnter = (event: ReactDragEvent) => {
    if (!canDropFiles || !isFileDrag(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDraggingFiles(true);
  };
  const handleFileDragOver = (event: ReactDragEvent) => {
    if (!canDropFiles || !isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const handleFileDragLeave = (event: ReactDragEvent) => {
    if (!canDropFiles || !isFileDrag(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDraggingFiles(false);
  };
  const handleFileDrop = async (event: ReactDragEvent) => {
    if (!canDropFiles || !scopeProjectId || !isFileDrag(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setIsDraggingFiles(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    const markdownFiles = files.filter(isMarkdownFile);
    if (canDropMarkdown && !activeFolder && !showArchived && markdownFiles.length > 1) {
      setWikiImportFiles(files);
      return;
    }
    const importable = files.filter(
      (file) => (canDropPdf && isPdfFile(file)) || (canDropMarkdown && isMarkdownFile(file))
    );
    if (importable.length === 0) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: `Only ${dropFileTypeLabel} can be added here.` });
      return;
    }
    // Sequential so we don't fire N presign/upload chains at once.
    const created = await importable.reduce<Promise<number>>(async (createdCountPromise, file) => {
      const createdCount = await createdCountPromise;
      const page = isMarkdownFile(file)
        ? await createMarkdownDocPage(scopeProjectId, file, activeFolder?.id)
        : await createPdfPage(scopeProjectId, file, activeFolder?.id);
      return page ? createdCount + 1 : createdCount;
    }, Promise.resolve(0));
    if (created > 0) {
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: created === 1 ? "File added." : `${created} files added.`,
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
            {activeFolder ? (
              <>
                <Breadcrumbs.Item
                  component={
                    <button
                      type="button"
                      onClick={() => setActiveFolderId(null)}
                      className="text-13 font-medium text-tertiary hover:text-primary"
                    >
                      {headerLabel}
                    </button>
                  }
                />
                <Breadcrumbs.Item component={<BreadcrumbLink label={getPageName(activeFolder.name)} />} />
              </>
            ) : (
              <Breadcrumbs.Item component={<BreadcrumbLink label={headerLabel} />} />
            )}
          </Breadcrumbs>
          <span className="rounded-full bg-layer-1 px-1.5 py-px text-11 font-medium text-tertiary">
            {activeFolder ? displayedDocs.length : visiblePages.length}
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
        {viewMode === "grid" && <CardStyleToggle style={cardStyle} onChange={setCardStyle} />}
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        <PageSearchInput searchQuery={searchQuery} updateSearchQuery={setSearchQuery} />
        {canCreateFolder && (
          <Button
            variant="secondary"
            size="lg"
            prependIcon={<FolderPlus className="size-4" />}
            onClick={startInlineFolderCreate}
            disabled={isSavingInlineFolder}
          >
            New folder
          </Button>
        )}
        {activeFolder && (
          <WikiSharePopover
            workspaceSlug={workspaceSlug}
            folder={activeFolder}
            onOpenSettings={() => setWikiSettingsFolder(activeFolder)}
            onChanged={refreshPages}
          />
        )}
        <WorkspaceCreateDocButton
          workspaceSlug={workspaceSlug}
          defaultType={pageType}
          lockedProjectId={scopeProjectId}
          parentFolderId={scopeProjectId ? activeFolder?.id : undefined}
          onUploadComplete={refreshPages}
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
        {canDropFiles && (isDraggingFiles || isImportingFiles) && (
          <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-accent-strong bg-surface-1/85 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-center">
              <UploadCloud className="size-8 text-accent-primary" />
              <p className="text-14 font-medium text-primary">
                {isImportingFiles ? "Adding files…" : `Drop ${dropFileTypeLabel} to add them`}
              </p>
              {!isImportingFiles && <p className="text-12 text-tertiary">They'll be added to this project's docs.</p>}
            </div>
          </div>
        )}
        {displayedDocs.length === 0 && displayedFolders.length === 0 && !showInlineFolderDraft ? (
          activeFolder && !hasFilters ? (
            <EmptyStateDetailed
              asset={<EmptyStateIcon name="docs" />}
              title="This folder is empty"
              description="Create a doc here, or move docs in from their card menu."
            />
          ) : (
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
          )
        ) : viewMode === "grid" ? (
          /* Reserve the scrollbar gutter on BOTH edges so the 16px scrollbar
             doesn't make the right margin wider than the left — content stays
             centered (net ~20px each side, aligned with the header). */
          <div className="dragonfruit-gallery-container scroll-shadow vertical-scrollbar scrollbar-lg h-full w-full overflow-y-auto px-1 pb-5 [scrollbar-gutter:stable_both-edges]">
            <div className="dragonfruit-card-grid">
              {showInlineFolderDraft && (
                <FolderDraftCard
                  name={inlineFolderName}
                  isSaving={isSavingInlineFolder}
                  inputRef={inlineFolderInputRef}
                  onChange={setInlineFolderName}
                  onCommit={saveInlineFolder}
                  onCancel={cancelInlineFolderCreate}
                />
              )}
              {displayedFolders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  count={folder.id ? (folderDocCounts.get(folder.id) ?? 0) : 0}
                  projectName={
                    scopeProjectId ? undefined : (getProjectById(folder.project_ids?.[0] ?? "")?.name ?? undefined)
                  }
                  canDelete={canDeleteDoc(folder)}
                  isFavorite={isFolderFavorited(folder)}
                  onToggleFavorite={() => void handleToggleFolderFavorite(folder)}
                  onOpen={() => folder.id && setActiveFolderId(folder.id)}
                  onRename={() => setFolderNameModal({ folder })}
                  isWikiPublished={folder.access === EPageAccess.PUBLIC}
                  onWikiSettings={() => setWikiSettingsFolder(folder)}
                  onCopyWikiLink={() => {
                    void copyUrlToClipboard(buildPublicPageUrl(workspaceSlug, getPublicPageSlug(folder))).then(() =>
                      setToast({ type: TOAST_TYPE.SUCCESS, title: "Wiki link copied" })
                    );
                  }}
                  onDelete={() => setFolderToDelete(folder)}
                  onDropDoc={handleDocDropIntoFolder}
                />
              ))}
              {displayedDocs.map((page) => (
                <DocCard
                  key={page.id}
                  page={page}
                  pagesKey={pagesKey}
                  workspaceSlug={workspaceSlug}
                  getProjectById={getProjectById}
                  joinedProjectIds={joinedProjectIds ?? []}
                  canModify={canDeleteDoc(page)}
                  isProjectScoped={Boolean(scopeProjectId)}
                  isSelected={Boolean(page.id && selectedDocIdSet.has(page.id))}
                  isSelectionActive={isSelectionActive}
                  onSelect={handleDocSelect}
                  folders={showFolderUi ? folders : []}
                  cardStyle={cardStyle}
                />
              ))}
            </div>
          </div>
        ) : (
          <ListLayout>
            {showInlineFolderDraft && (
              <FolderDraftListItem
                name={inlineFolderName}
                isSaving={isSavingInlineFolder}
                inputRef={inlineFolderInputRef}
                onChange={setInlineFolderName}
                onCommit={saveInlineFolder}
                onCancel={cancelInlineFolderCreate}
              />
            )}
            {displayedFolders.map((folder) => (
              <FolderListItem
                key={folder.id}
                folder={folder}
                count={folder.id ? (folderDocCounts.get(folder.id) ?? 0) : 0}
                canDelete={canDeleteDoc(folder)}
                isFavorite={isFolderFavorited(folder)}
                onToggleFavorite={() => void handleToggleFolderFavorite(folder)}
                onOpen={() => folder.id && setActiveFolderId(folder.id)}
                onRename={() => setFolderNameModal({ folder })}
                isWikiPublished={folder.access === EPageAccess.PUBLIC}
                onWikiSettings={() => setWikiSettingsFolder(folder)}
                onCopyWikiLink={() => {
                  void copyUrlToClipboard(buildPublicPageUrl(workspaceSlug, getPublicPageSlug(folder))).then(() =>
                    setToast({ type: TOAST_TYPE.SUCCESS, title: "Wiki link copied" })
                  );
                }}
                onDelete={() => setFolderToDelete(folder)}
                onDropDoc={handleDocDropIntoFolder}
              />
            ))}
            {displayedDocs.map((page) => (
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
            folders={showFolderUi ? folders : []}
          />
        )}
        <FolderNameModal
          isOpen={folderNameModal !== null}
          isRename={Boolean(folderNameModal?.folder)}
          initialName={folderNameModal?.folder ? getPageName(folderNameModal.folder.name) : DEFAULT_FOLDER_NAME}
          onClose={() => setFolderNameModal(null)}
          onSubmit={handleFolderNameSubmit}
        />
        {scopeProjectId && wikiImportFiles && (
          <WikiImportModal
            workspaceSlug={workspaceSlug}
            projectId={scopeProjectId}
            isOpen={wikiImportFiles !== null}
            files={wikiImportFiles}
            onClose={() => setWikiImportFiles(null)}
            onImported={refreshPages}
          />
        )}
        {wikiSettingsFolder && (
          <WikiSettingsModal
            workspaceSlug={workspaceSlug}
            folder={wikiSettingsFolder}
            docs={(pages ?? []).filter(
              (p) => p.parent === wikiSettingsFolder.id && (p.page_type ?? "doc") === "doc" && !p.archived_at
            )}
            isOpen
            onClose={() => setWikiSettingsFolder(null)}
            onSaved={refreshPages}
          />
        )}
        <AlertModalCore
          isOpen={folderToDelete !== null}
          handleClose={() => {
            if (!isDeletingFolder) setFolderToDelete(null);
          }}
          handleSubmit={() => void confirmDeleteFolder()}
          isSubmitting={isDeletingFolder}
          title="Delete folder"
          content={`Delete ${folderToDelete ? getPageName(folderToDelete.name) : "this folder"}? Docs inside move back to the main list.`}
        />
      </div>
    </div>
  );
});

type FolderVisualVariant = {
  back: string;
  front: string;
  slot: string;
  lip: string;
  paper: string;
  paperLine: string;
  labelStyle: CSSProperties;
  metaStyle: CSSProperties;
  shadow: string;
};

const FOLDER_VARIANTS: FolderVisualVariant[] = [
  {
    back: "linear-gradient(180deg, #eaa43a 0%, #cf8721 100%)",
    front: "linear-gradient(180deg, #ffc85f 0%, #f1a63a 54%, #dc8427 100%)",
    slot: "rgba(255,255,255,0.58)",
    lip: "linear-gradient(180deg, rgba(255,244,188,0.74) 0%, rgba(255,199,92,0.08) 100%)",
    paper: "#fffaf0",
    paperLine: "rgba(143, 116, 82, 0.32)",
    labelStyle: { color: "#ffffff", textShadow: "0 1px 1px rgba(98,55,0,0.36)" },
    metaStyle: { color: "rgba(255,255,255,0.78)", textShadow: "0 1px 1px rgba(98,55,0,0.22)" },
    shadow: "0 17px 30px -22px rgba(130,76,10,0.88)",
  },
  {
    back: "linear-gradient(180deg, #555b66 0%, #22262b 100%)",
    front: "linear-gradient(180deg, #3a3f47 0%, #23262b 56%, #15171a 100%)",
    slot: "rgba(255,255,255,0.66)",
    lip: "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.02) 100%)",
    paper: "#f6f7f8",
    paperLine: "rgba(92, 98, 108, 0.28)",
    labelStyle: { color: "#f5f7f8", textShadow: "0 1px 1px rgba(0,0,0,0.44)" },
    metaStyle: { color: "rgba(245,247,248,0.62)", textShadow: "0 1px 1px rgba(0,0,0,0.34)" },
    shadow: "0 18px 32px -22px rgba(0,0,0,0.74)",
  },
  {
    back: "linear-gradient(180deg, #64baf0 0%, #2f8fd0 100%)",
    front: "linear-gradient(180deg, #92ddff 0%, #5ebbed 58%, #438ecb 100%)",
    slot: "rgba(255,255,255,0.64)",
    lip: "linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.06) 100%)",
    paper: "#f8fbff",
    paperLine: "rgba(78, 128, 164, 0.26)",
    labelStyle: { color: "#073452", textShadow: "0 1px 0 rgba(255,255,255,0.3)" },
    metaStyle: { color: "rgba(7,52,82,0.68)" },
    shadow: "0 18px 32px -22px rgba(37,107,153,0.78)",
  },
  {
    back: "linear-gradient(180deg, #ffd844 0%, #dfa618 100%)",
    front: "linear-gradient(180deg, #fff17a 0%, #ffd95a 58%, #e3aa24 100%)",
    slot: "rgba(255,255,255,0.64)",
    lip: "linear-gradient(180deg, rgba(255,255,255,0.48) 0%, rgba(255,255,255,0.08) 100%)",
    paper: "#fffdf3",
    paperLine: "rgba(133, 103, 20, 0.26)",
    labelStyle: { color: "#4d3904", textShadow: "0 1px 0 rgba(255,255,255,0.32)" },
    metaStyle: { color: "rgba(77,57,4,0.66)" },
    shadow: "0 18px 32px -22px rgba(150,103,0,0.78)",
  },
  {
    back: "linear-gradient(180deg, #dfe4df 0%, #b4bbb5 100%)",
    front: "linear-gradient(180deg, #fbfcf8 0%, #e8ede6 56%, #cfd6cf 100%)",
    slot: "rgba(150,158,154,0.48)",
    lip: "linear-gradient(180deg, rgba(255,255,255,0.76) 0%, rgba(255,255,255,0.12) 100%)",
    paper: "#ffffff",
    paperLine: "rgba(115, 124, 119, 0.24)",
    labelStyle: { color: "#303630", textShadow: "0 1px 0 rgba(255,255,255,0.4)" },
    metaStyle: { color: "rgba(48,54,48,0.62)" },
    shadow: "0 18px 32px -22px rgba(70,76,70,0.68)",
  },
];

const getFolderVariant = (folder?: Pick<TPage, "id" | "name">): FolderVisualVariant => {
  const seed = String(folder?.id ?? folder?.name ?? "folder");
  const hash = Array.from(seed).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
  return FOLDER_VARIANTS[hash % FOLDER_VARIANTS.length] ?? FOLDER_VARIANTS[0];
};

type FolderNameModalProps = {
  isOpen: boolean;
  isRename: boolean;
  initialName: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
};

function FolderNameModal({ isOpen, isRename, initialName, onClose, onSubmit }: FolderNameModalProps) {
  const [name, setName] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Re-seed the input every time the modal opens (create vs rename target).
  useEffect(() => {
    if (isOpen) setName(initialName);
  }, [isOpen, initialName]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: pageActionErrorMessage(error, "Folder could not be saved. Please try again later."),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.SM}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="p-5"
      >
        <h3 className="text-16 font-medium text-primary">{isRename ? "Rename folder" : "New folder"}</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Folder name"
          className="mt-3 w-full appearance-none rounded-lg border-0 bg-transparent px-0 py-2 text-13 text-primary outline-none placeholder:text-placeholder focus:border-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting} disabled={!name.trim()}>
            {isRename ? "Save" : "Create folder"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}

type CreateWikiFromDocsModalProps = {
  isOpen: boolean;
  initialName: string;
  selectedCount: number;
  skippedCount: number;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
};

function CreateWikiFromDocsModal({
  isOpen,
  initialName,
  selectedCount,
  skippedCount,
  isSubmitting,
  onClose,
  onSubmit,
}: CreateWikiFromDocsModalProps) {
  const [name, setName] = useState(initialName);
  const selectedLabel = selectedCount === 1 ? "doc" : "docs";
  const skippedLabel = skippedCount === 1 ? "doc" : "docs";

  useEffect(() => {
    if (isOpen) setName(initialName);
  }, [isOpen, initialName]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;
    await onSubmit(trimmed);
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.SM}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="p-5"
      >
        <h3 className="text-16 font-medium text-primary">Create wiki</h3>
        <p className="mt-1 text-12 text-secondary">
          {selectedCount} {selectedLabel} will move into a new wiki folder.
          {skippedCount > 0 ? ` ${skippedCount} selected ${skippedLabel} will be skipped.` : ""}
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Wiki name"
          disabled={isSubmitting}
          className="mt-3 w-full appearance-none rounded-lg border-0 bg-transparent px-0 py-2 text-13 text-primary outline-none placeholder:text-placeholder focus:border-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none disabled:opacity-60"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting} disabled={!name.trim()}>
            Create wiki
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}

type FolderActionsMenuProps = {
  canDelete: boolean;
  isFavorite: boolean;
  /** Wiki = this folder published; flips the item between create and settings. */
  isWikiPublished: boolean;
  onToggleFavorite: () => void;
  onRename: () => void;
  onWikiSettings: () => void;
  onCopyWikiLink: () => void;
  onDelete: () => void;
  buttonClassName?: string;
};

function FolderActionsMenu({
  canDelete,
  isFavorite,
  isWikiPublished,
  onToggleFavorite,
  onRename,
  onWikiSettings,
  onCopyWikiLink,
  onDelete,
  buttonClassName,
}: FolderActionsMenuProps) {
  return (
    <CustomMenu
      ariaLabel="Folder actions"
      placement="bottom-end"
      closeOnSelect
      useCaptureForOutsideClick
      customButton={
        <span
          className={cn(
            "shadow-sm grid size-6 place-items-center rounded-lg bg-layer-2 text-tertiary hover:bg-layer-3 hover:text-primary",
            buttonClassName
          )}
        >
          <MoreHorizontal weight="Bold" className="size-4" />
        </span>
      }
    >
      <CustomMenu.MenuItem onClick={onToggleFavorite}>
        <span className="flex items-center gap-2">
          <Star weight={isFavorite ? "Bold" : undefined} className={cn("size-4", { "text-amber-500": isFavorite })} />
          {isFavorite ? "Remove from favorites" : "Add to favorites"}
        </span>
      </CustomMenu.MenuItem>
      <CustomMenu.MenuItem onClick={onRename}>
        <span className="flex items-center gap-2">
          <Pencil className="size-4" />
          Rename
        </span>
      </CustomMenu.MenuItem>
      <CustomMenu.MenuItem onClick={onWikiSettings}>
        <span className="flex items-center gap-2">
          {isWikiPublished ? <Settings className="size-4" /> : <FolderPlus className="size-4" />}
          {isWikiPublished ? "Wiki settings" : "Create wiki"}
        </span>
      </CustomMenu.MenuItem>
      {isWikiPublished && (
        <CustomMenu.MenuItem onClick={onCopyWikiLink}>
          <span className="flex items-center gap-2">
            <Copy01Icon className="size-4" />
            Copy wiki link
          </span>
        </CustomMenu.MenuItem>
      )}
      {canDelete && (
        <CustomMenu.MenuItem onClick={onDelete} className="text-red-500 hover:!bg-red-500/10 hover:!text-red-500">
          <span className="flex items-center gap-2">
            <DetailIcon icon={Delete02Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
            Delete
          </span>
        </CustomMenu.MenuItem>
      )}
    </CustomMenu>
  );
}

type FolderCardProps = {
  folder: TPage;
  count: number;
  /** Shown on the workspace-wide gallery where the project isn't implied. */
  projectName?: string;
  canDelete: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
  onRename: () => void;
  isWikiPublished: boolean;
  onWikiSettings: () => void;
  onCopyWikiLink: () => void;
  onDelete: () => void;
  onDropDoc: (dragData: DocsPageDragData, folder: TPage) => void | Promise<void>;
};

function FolderMiniGlyph({ folder, className }: { folder?: Pick<TPage, "id" | "name">; className?: string }) {
  const variant = getFolderVariant(folder);
  return (
    <span aria-hidden className={cn("relative inline-block h-4 w-5 shrink-0", className)}>
      <span
        className="absolute top-0 left-[8%] h-[38%] w-[42%] rounded-t-[4px] rounded-br-[2px]"
        style={{ background: variant.back }}
      />
      <span
        className="absolute inset-x-0 top-[22%] bottom-[8%] rounded-[4px]"
        style={{
          background: variant.back,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
        }}
      />
      <span
        className="absolute top-[40%] right-[12%] left-[13%] h-[3px] rounded-full"
        style={{ background: variant.slot }}
      />
      <span
        className="absolute inset-x-0 bottom-0 h-[58%] rounded-[4px]"
        style={{
          background: variant.front,
          boxShadow: "0 1px 2px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.28)",
        }}
      />
    </span>
  );
}

/** One tucked document sheet. Position and rotation come in via className so
 * each sheet fans differently; the springy rise transition is shared. */
function FolderPaper({ className, delay }: { className?: string; delay?: string }) {
  const lineWidths = ["84%", "62%", "76%", "50%"];
  return (
    <div
      className={cn(
        "absolute z-10 rounded-[7px] p-2 pb-3",
        "transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform motion-reduce:transform-none motion-reduce:transition-none",
        className
      )}
      style={delay ? { transitionDelay: delay } : undefined}
    >
      <div className="flex flex-col gap-1">
        {lineWidths.map((width) => (
          <div key={width} className="h-[3px] rounded-full bg-layer-3" style={{ width }} />
        ))}
      </div>
    </div>
  );
}

const FOLDER_PAPER_LAYOUTS = {
  backLeft: {
    className:
      "shadow-sm top-[36px] left-[23%] h-[76px] w-[24%] -rotate-[5deg] border border-subtle bg-surface-1 opacity-90 group-focus-within:-translate-y-5 group-focus-within:-rotate-[9deg] group-hover:-translate-y-5 group-hover:-rotate-[9deg]",
    activeClassName: "-translate-y-5 -rotate-[9deg]",
  },
  backRight: {
    className:
      "shadow-sm top-[36px] left-[51%] h-[76px] w-[24%] rotate-[5deg] border border-subtle bg-surface-1 opacity-90 group-focus-within:-translate-y-5 group-focus-within:rotate-[9deg] group-hover:-translate-y-5 group-hover:rotate-[9deg]",
    activeClassName: "-translate-y-5 rotate-[9deg]",
  },
  left: {
    className:
      "shadow-sm top-[32px] left-[13%] h-[82px] w-[28%] -rotate-[10deg] border border-subtle bg-surface-1 group-focus-within:-translate-x-0.5 group-focus-within:-translate-y-6 group-focus-within:-rotate-[12deg] group-hover:-translate-x-0.5 group-hover:-translate-y-6 group-hover:-rotate-[12deg]",
    activeClassName: "-translate-x-0.5 -translate-y-6 -rotate-[12deg]",
  },
  center: {
    className:
      "shadow-sm top-[28px] left-[35%] h-[90px] w-[28%] rotate-[1deg] border border-subtle bg-surface-1 group-focus-within:-translate-y-7 group-focus-within:-rotate-[1deg] group-hover:-translate-y-7 group-hover:-rotate-[1deg]",
    activeClassName: "-translate-y-7 -rotate-[1deg]",
    delay: "40ms",
  },
  right: {
    className:
      "shadow-sm top-[33px] left-[59%] h-[78px] w-[27%] rotate-[10deg] border border-subtle bg-surface-1 group-focus-within:translate-x-0.5 group-focus-within:-translate-y-6 group-focus-within:rotate-[12deg] group-hover:translate-x-0.5 group-hover:-translate-y-6 group-hover:rotate-[12deg]",
    activeClassName: "translate-x-0.5 -translate-y-6 rotate-[12deg]",
    delay: "75ms",
  },
} as const;

const getFolderPaperLayoutKeys = (count: number, isDropTargetActive: boolean) => {
  const visibleCount = count > 3 ? 5 : count > 0 ? count : isDropTargetActive ? 1 : 0;
  if (visibleCount <= 0) return [] as const;
  if (visibleCount === 1) return ["center"] as const;
  if (visibleCount === 2) return ["left", "right"] as const;
  if (visibleCount === 3) return ["left", "center", "right"] as const;
  return ["backLeft", "backRight", "left", "center", "right"] as const;
};

function FolderSurface({
  folder,
  count,
  children,
  className,
  isDropTargetActive = false,
}: {
  folder: Pick<TPage, "id" | "name">;
  count: number;
  children: ReactNode;
  className?: string;
  isDropTargetActive?: boolean;
}) {
  const tabLabel = getPageName(folder.name);
  const paperLayoutKeys = getFolderPaperLayoutKeys(count, isDropTargetActive);
  const showPapers = paperLayoutKeys.length > 0;

  return (
    <div className={cn("relative h-[156px] overflow-visible", className)}>
      <div
        className="absolute top-0 left-5 h-10 w-[42%] rounded-t-[18px] rounded-br-[8px] bg-layer-1 transition-colors group-focus-within:bg-layer-3 group-hover:bg-layer-3"
        style={{
          transform: "skewX(13deg)",
          transformOrigin: "bottom left",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[9px] left-8 z-[1] flex h-3 items-center overflow-hidden"
        style={{
          transform: "skewX(13deg)",
          transformOrigin: "bottom left",
          width: "calc(42% - 20px)",
        }}
      >
        <span
          className="block w-full min-w-0 truncate text-[9px] leading-3 font-semibold text-tertiary/60 not-italic opacity-80"
          style={{
            transform: "skewX(-13deg)",
            transformOrigin: "bottom left",
            textShadow: "0 1px 0 rgba(255,255,255,0.5), 0 -1px 0 rgba(0,0,0,0.08)",
          }}
        >
          {tabLabel}
        </span>
      </div>
      <div className="absolute inset-x-0 top-[18px] bottom-1 rounded-[22px] bg-layer-1 transition-colors group-focus-within:bg-layer-3 group-hover:bg-layer-3" />
      <div className="absolute top-[58px] right-7 left-7 z-10 h-2 rounded-full bg-layer-2/80 shadow-[0_1px_0_rgba(255,255,255,0.58)] transition-colors group-focus-within:bg-layer-1 group-hover:bg-layer-1" />
      {showPapers &&
        paperLayoutKeys.map((key) => {
          const layout = FOLDER_PAPER_LAYOUTS[key];
          return (
            <FolderPaper
              key={key}
              className={cn(layout.className, isDropTargetActive && layout.activeClassName)}
              delay={"delay" in layout ? layout.delay : undefined}
            />
          );
        })}
      <div className="absolute inset-x-0 bottom-0 z-20 flex h-[108px] flex-col justify-end overflow-hidden rounded-[22px] bg-layer-1 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_-1px_0_rgba(0,0,0,0.08),0_-12px_18px_-18px_rgba(0,0,0,0.42)] transition-colors group-focus-within:bg-layer-3 group-hover:bg-layer-3">
        <div className="relative z-10 flex min-w-0 flex-col gap-0.5">{children}</div>
      </div>
    </div>
  );
}

type FolderDraftProps = {
  name: string;
  isSaving: boolean;
  inputRef: RefObject<HTMLInputElement>;
  onChange: (value: string) => void;
  onCommit: (value: string) => void | Promise<void>;
  onCancel: () => void;
};

const draftFolderVisualSeed = { id: "inline-folder-draft", name: DEFAULT_FOLDER_NAME };

function FolderNameInput({ name, isSaving, inputRef, onChange, onCommit, onCancel }: FolderDraftProps) {
  const skipNextBlurCommitRef = useRef(false);

  return (
    <input
      ref={inputRef}
      value={name}
      disabled={isSaving}
      placeholder="Folder name"
      aria-label="Folder name"
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        if (skipNextBlurCommitRef.current) {
          skipNextBlurCommitRef.current = false;
          return;
        }
        void onCommit(e.currentTarget.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void onCommit(e.currentTarget.value);
        }
        if (e.key === "Escape") {
          e.preventDefault();
          skipNextBlurCommitRef.current = true;
          onCancel();
        }
      }}
      className="relative w-full min-w-0 appearance-none rounded-md border-0 bg-transparent px-0 py-0 text-13 font-semibold text-primary outline-none placeholder:text-placeholder focus:border-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none disabled:opacity-70"
    />
  );
}

function FolderDraftCard(props: FolderDraftProps) {
  return (
    <div className="group relative h-[156px]">
      <FolderSurface folder={draftFolderVisualSeed} count={0}>
        <FolderNameInput {...props} />
        <p className="truncate text-11 text-placeholder">{props.isSaving ? "Saving..." : "0 docs"}</p>
      </FolderSurface>
    </div>
  );
}

function FolderDraftListItem(props: FolderDraftProps) {
  return (
    <div className="relative">
      <div className="group flex min-h-[52px] w-full flex-col items-center justify-between gap-3 border-b border-subtle bg-accent-primary/5 py-4 text-13 lg:flex-row lg:gap-5 lg:py-0">
        <div className="relative flex w-full min-w-0 items-center justify-between gap-3 truncate">
          <div className="relative flex w-full min-w-0 items-center gap-3 overflow-hidden">
            <span className="flex flex-shrink-0 items-center">
              <FolderMiniGlyph folder={draftFolderVisualSeed} />
            </span>
            <FolderNameInput {...props} />
          </div>
        </div>
        {props.isSaving && (
          <div className="relative flex w-full flex-shrink-0 flex-wrap items-center justify-start gap-4 lg:w-auto lg:flex-nowrap">
            <span className="text-11 text-tertiary">Saving...</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FolderCard({
  folder,
  count,
  projectName,
  canDelete,
  isFavorite,
  onToggleFavorite,
  onOpen,
  onRename,
  isWikiPublished,
  onWikiSettings,
  onCopyWikiLink,
  onDelete,
  onDropDoc,
}: FolderCardProps) {
  const metaText = [projectName, `${count} ${count === 1 ? "doc" : "docs"}`].filter(Boolean).join(" · ");
  const folderName = getPageName(folder.name);
  const dropRef = useRef<HTMLDivElement>(null);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  useFolderDocDropTarget({ elementRef: dropRef, folder, onDropDoc, setIsDropTargetActive });
  return (
    <div ref={dropRef} className="group relative block h-[156px] rounded-2xl">
      <button
        type="button"
        aria-label={`Open folder ${folderName}`}
        onClick={onOpen}
        className="t-press focus-visible:ring-accent-primary/40 relative h-full w-full cursor-pointer rounded-2xl text-left focus:outline-none focus-visible:ring-2"
      >
        <FolderSurface folder={folder} count={count} isDropTargetActive={isDropTargetActive}>
          <h3 className="line-clamp-2 text-13 leading-snug font-semibold text-secondary transition-colors group-hover:text-primary">
            {folderName}
          </h3>
          <p className="flex min-w-0 items-center gap-1 text-11 text-placeholder">
            <span className="truncate">{isDropTargetActive ? "Drop to move here" : metaText}</span>
            {isWikiPublished && !isDropTargetActive && (
              <span className="flex shrink-0 items-center gap-1">
                · <GlobeIcon className="size-3" /> Published
              </span>
            )}
          </p>
        </FolderSurface>
      </button>
      {isDropTargetActive && (
        <div className="pointer-events-none absolute inset-x-0 top-[18px] bottom-1 z-30 rounded-[22px] ring-2 ring-accent-strong" />
      )}
      <div
        className="absolute top-8 right-3 z-30 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <FolderActionsMenu
          canDelete={canDelete}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          onRename={onRename}
          isWikiPublished={isWikiPublished}
          onWikiSettings={onWikiSettings}
          onCopyWikiLink={onCopyWikiLink}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

type FolderListItemProps = {
  folder: TPage;
  count: number;
  canDelete: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
  onRename: () => void;
  isWikiPublished: boolean;
  onWikiSettings: () => void;
  onCopyWikiLink: () => void;
  onDelete: () => void;
  onDropDoc: (dragData: DocsPageDragData, folder: TPage) => void | Promise<void>;
};

function FolderListItem({
  folder,
  count,
  canDelete,
  isFavorite,
  onToggleFavorite,
  onOpen,
  onRename,
  isWikiPublished,
  onWikiSettings,
  onCopyWikiLink,
  onDelete,
  onDropDoc,
}: FolderListItemProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { isMobile } = usePlatformOS();
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  useFolderDocDropTarget({ elementRef: parentRef, folder, onDropDoc, setIsDropTargetActive });
  return (
    <ListItem
      prependTitleElement={<FolderMiniGlyph folder={folder} />}
      title={getPageName(folder.name)}
      itemLink="#"
      onItemClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
      titleClassName="font-semibold text-secondary"
      className={cn({ "bg-accent-primary/5": isDropTargetActive })}
      actionableItems={
        <div
          className="flex items-center gap-3 text-13 text-tertiary"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-1 text-11">
            {isDropTargetActive ? "Drop to move here" : `${count} ${count === 1 ? "doc" : "docs"}`}
            {isWikiPublished && !isDropTargetActive && (
              <span className="flex shrink-0 items-center gap-1">
                · <GlobeIcon className="size-3" /> Published
              </span>
            )}
          </span>
          <FolderActionsMenu
            canDelete={canDelete}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
            onRename={onRename}
            isWikiPublished={isWikiPublished}
            onWikiSettings={onWikiSettings}
            onCopyWikiLink={onCopyWikiLink}
            onDelete={onDelete}
          />
        </div>
      }
      isMobile={isMobile}
      parentRef={parentRef}
    />
  );
}

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

type CardStyleToggleProps = {
  style: DocCardStyle;
  onChange: (style: DocCardStyle) => void;
};

/** Pictograms: "paper" = title lines over a content sheet; "tile" = thumbnail over a caption. */
function CardStyleToggle({ style, onChange }: CardStyleToggleProps) {
  const options: Array<{ value: DocCardStyle; label: string; glyph: ReactNode }> = [
    {
      value: "paper",
      label: "Paper cards (title above content preview)",
      glyph: (
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
          <path d="M3 3.5h6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <rect x="3" y="6.5" width="10" height="6.5" rx="1.5" fill="currentColor" opacity="0.45" />
        </svg>
      ),
    },
    {
      value: "tile",
      label: "Tile cards (content thumbnail above caption)",
      glyph: (
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
          <rect x="3" y="3" width="10" height="6.5" rx="1.5" fill="currentColor" opacity="0.45" />
          <path d="M3 12.5h6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
      ),
    },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-subtle p-0.5">
      {options.map(({ value, label, glyph }) => {
        const isActive = style === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={isActive}
            onClick={() => onChange(value)}
            className={cn("t-press grid size-6 place-items-center rounded-lg text-tertiary hover:text-primary", {
              "bg-layer-1 text-primary": isActive,
            })}
          >
            {glyph}
          </button>
        );
      })}
    </div>
  );
}

/** Observer wrapper so the avatar appears once the member store hydrates. */
const DocOwnerAvatar = observer(function DocOwnerAvatar({ userId }: { userId: string }) {
  const { getUserDetails } = useMember();
  const owner = getUserDetails(userId);
  if (!owner) return null;
  return (
    <Avatar
      src={getFileURL(owner.avatar_url ?? "")}
      name={owner.display_name}
      size="sm"
      className="shrink-0"
      showTooltip={false}
    />
  );
});

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
  const pageType = page.page_type ?? "doc";
  const displayName = getWorkspaceDocDisplayName(page, primaryProject?.name);
  const canDragDoc = Boolean(page.id && primaryProjectId && !isProjectBrief);
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);
  const dragData = useMemo<DocsPageDragData | null>(
    () =>
      page.id && primaryProjectId && !isProjectBrief
        ? {
            type: DOCS_PAGE_DRAG_TYPE,
            pageId: page.id,
            projectId: primaryProjectId,
            title: displayName,
            parent: page.parent ?? null,
            pageType,
          }
        : null,
    [displayName, isProjectBrief, page.id, page.parent, pageType, primaryProjectId]
  );
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
  const pdfMeta = pageType === "pdf" ? page.view_props?.pdf : undefined;
  const tags = normalizeTags((page.view_props as Record<string, unknown> | undefined)?.tags);
  const dragPreviewMeta = [
    primaryProject?.name,
    pageType === "pdf" && pdfMeta ? convertBytesToSize(pdfMeta.size) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const dragPreview = useMemo<DocDragPreviewProps>(
    () => ({
      title: displayName,
      metaText: dragPreviewMeta,
      pageType,
      logoProps: page.logo_props,
      typeTint: DOC_CARD_TYPE_TINT[pageType] ?? DOC_CARD_TYPE_TINT.doc,
      isProjectBrief,
    }),
    [displayName, dragPreviewMeta, isProjectBrief, page.logo_props, pageType]
  );
  useDocsPageDraggable({
    elementRef: parentRef,
    enabled: canDragDoc,
    dragData,
    preview: dragPreview,
    setIsDragging: setIsDraggingDoc,
  });

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
        "cursor-grab active:cursor-grabbing": canDragDoc,
        "opacity-50": isDraggingDoc,
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
  joinedProjectIds: string[];
  /** Whether the current user can archive/delete this doc (owner or project admin). */
  canModify: boolean;
  /** When viewing a single project's docs, the project name is redundant — hide it. */
  isProjectScoped: boolean;
  isSelected: boolean;
  isSelectionActive: boolean;
  onSelect: (pageId: string, isRange: boolean) => void;
  /** Folders the doc could be moved into (docs surface only). */
  folders?: TPage[];
  cardStyle: DocCardStyle;
};

function DocCard({
  page,
  pagesKey,
  workspaceSlug,
  getProjectById,
  joinedProjectIds,
  canModify,
  isProjectScoped,
  isSelected,
  isSelectionActive,
  onSelect,
  folders = [],
  cardStyle,
}: DocCardProps) {
  const { mutate } = useSWRConfig();
  const projectIds = page.project_ids ?? [];
  const primaryProjectId = projectIds[0];
  const primaryProject = primaryProjectId ? getProjectById(primaryProjectId) : undefined;
  const isProjectBrief = isProjectBriefPage(page);
  const pageType = page.page_type ?? "doc";
  const displayName = getWorkspaceDocDisplayName(page, primaryProject?.name);
  const itemLink =
    primaryProjectId && page.id
      ? `/${workspaceSlug}/projects/${primaryProjectId}/${isProjectBrief ? "brief" : `pages/${page.id}/`}`
      : null;
  // Per-type filled glyph; docs & briefs share the document glyph.
  const TypeIcon = getDocPreviewIcon(pageType);
  const typeTint = DOC_CARD_TYPE_TINT[pageType] ?? DOC_CARD_TYPE_TINT.doc;
  const typeLabel = DOC_CARD_TYPE_LABEL[pageType] ?? DOC_CARD_TYPE_LABEL.doc;
  const updatedLabel = page.updated_at ? renderFormattedDate(page.updated_at) : undefined;
  // word_count is supplied by the workspace pages list endpoint; absent until the API ships it.
  const wordCount = (page as TPage & { word_count?: number }).word_count;
  const pdfMeta = pageType === "pdf" ? page.view_props?.pdf : undefined;
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
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);
  const dragContainerRef = useRef<HTMLDivElement>(null);
  const canDragDoc = Boolean(itemLink && page.id && primaryProjectId && !isProjectBrief);
  const dragData = useMemo<DocsPageDragData | null>(
    () =>
      page.id && primaryProjectId && !isProjectBrief
        ? {
            type: DOCS_PAGE_DRAG_TYPE,
            pageId: page.id,
            projectId: primaryProjectId,
            title: displayName,
            parent: page.parent ?? null,
            pageType,
          }
        : null,
    [displayName, isProjectBrief, page.id, page.parent, pageType, primaryProjectId]
  );
  const dragPreview = useMemo<DocDragPreviewProps>(
    () => ({
      title: displayName,
      metaText,
      pageType,
      logoProps: page.logo_props,
      typeTint,
      isProjectBrief,
    }),
    [displayName, isProjectBrief, metaText, page.logo_props, pageType, typeTint]
  );
  useDocsPageDraggable({
    elementRef: dragContainerRef,
    enabled: canDragDoc,
    dragData,
    preview: dragPreview,
    setIsDragging: setIsDraggingDoc,
  });

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

  // Folders live in a single project, so only offer ones the doc shares.
  const eligibleFolders = folders.filter((f) => primaryProjectId && (f.project_ids ?? []).includes(primaryProjectId));
  const showFolderMenu = !isProjectBrief && (eligibleFolders.length > 0 || Boolean(page.parent));
  const moveTargetProjects = useMemo(
    () =>
      sortBy(
        (joinedProjectIds ?? [])
          .map((id) => getProjectById(id))
          .filter((project): project is NonNullable<typeof project> => Boolean(project))
          .filter((project) => project.id !== primaryProjectId),
        [(project) => project.name.toLowerCase()]
      ),
    [getProjectById, joinedProjectIds, primaryProjectId]
  );
  const showProjectMoveMenu = !isProjectBrief && moveTargetProjects.length > 0;

  const handleMoveToFolder = async (folderId: string | null) => {
    if (!primaryProjectId || !page.id) return;
    try {
      await pageService.update(workspaceSlug, primaryProjectId, page.id, { parent: folderId });
      await refreshPages();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: folderId ? "Doc moved to folder." : "Doc removed from folder.",
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: pageActionErrorMessage(error, "Doc could not be moved. Please try again later."),
      });
    }
  };

  const handleMoveToProject = async (targetProjectId: string) => {
    if (!primaryProjectId || !page.id || targetProjectId === primaryProjectId) return;
    const targetProject = getProjectById(targetProjectId);
    try {
      await pageService.move(workspaceSlug, primaryProjectId, page.id, targetProjectId);
      await refreshPages();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: targetProject ? `Doc moved to ${targetProject.name}.` : "Doc moved to project.",
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: pageActionErrorMessage(error, "Doc could not be moved. Please try again later."),
      });
    }
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

  const tintStyle = isProjectBrief
    ? undefined
    : { color: typeTint, backgroundColor: `color-mix(in srgb, ${typeTint} 14%, transparent)` };

  // Shared hover-revealed selection checkbox; each layout positions its own.
  const selectionCheckbox = (className: string) =>
    page.id ? (
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
          className,
          isSelected || isSelectionActive
            ? "opacity-100"
            : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
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
    ) : null;

  const previewSurface = (className?: string) => (
    <div className={cn("min-h-0 overflow-hidden rounded-[10px] border border-subtle bg-surface-1", className)}>
      <DocCardPreviewSurface page={page} workspaceSlug={workspaceSlug} />
    </div>
  );

  // Same height as FolderCard/FolderSurface so folder and doc rows line up.
  const cardShellClassName = cn("group relative flex h-[156px] flex-col rounded-2xl transition-colors", {
    "bg-layer-1 hover:bg-layer-3": !isProjectBrief && !isSelected,
    "bg-accent-primary/5 hover:bg-accent-primary/10": isProjectBrief && !isSelected,
    "bg-layer-1 ring-1 ring-strong": isSelected,
    "cursor-grab active:cursor-grabbing": canDragDoc,
    "opacity-50": isDraggingDoc,
    "opacity-60": !itemLink,
  });

  const actionsMenu = (buttonClassName: string) =>
    primaryProjectId && page.id ? (
      <CustomMenu
        ariaLabel="Page actions"
        placement="bottom-end"
        closeOnSelect
        useCaptureForOutsideClick
        customButton={
          <span className={buttonClassName}>
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
        {showFolderMenu && (
          <CustomMenu.SubMenu
            trigger={
              <span className="flex items-center gap-2">
                <SolarFolder className="size-4" />
                Move to folder
              </span>
            }
          >
            {page.parent && (
              <CustomMenu.MenuItem onClick={() => void handleMoveToFolder(null)}>
                <span className="flex items-center gap-2">
                  <SolarHome className="size-4" />
                  Move to root
                </span>
              </CustomMenu.MenuItem>
            )}
            {eligibleFolders.map((folder) => (
              <CustomMenu.MenuItem
                key={folder.id}
                disabled={page.parent === folder.id}
                onClick={() => void handleMoveToFolder(folder.id ?? null)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <SolarFolder className="size-4 shrink-0 text-tertiary" />
                  <span className="truncate">{getPageName(folder.name)}</span>
                  {page.parent === folder.id && <span className="ml-auto shrink-0 text-10 text-tertiary">Current</span>}
                </span>
              </CustomMenu.MenuItem>
            ))}
          </CustomMenu.SubMenu>
        )}
        {showProjectMoveMenu && (
          <CustomMenu.SubMenu
            trigger={
              <span className="flex items-center gap-2">
                <ArrowRightLeft className="size-4" />
                Move to project
              </span>
            }
          >
            {moveTargetProjects.map((project) => (
              <CustomMenu.MenuItem key={project.id} onClick={() => void handleMoveToProject(project.id)}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="grid h-4 w-4 shrink-0 place-items-center">
                    <Logo logo={project.logo_props} size={12} />
                  </span>
                  <span className="truncate">{project.name}</span>
                </span>
              </CustomMenu.MenuItem>
            ))}
          </CustomMenu.SubMenu>
        )}
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
    ) : null;

  // Keep the menu outside the card link. A nested button inside an anchor is
  // invalid interactive markup and lets link/drag handling compete with the
  // menu trigger. Stopping pointer-down propagation also prevents a menu press
  // from starting the card's drag gesture before the click can open the menu.
  const actionsMenuOverlay =
    primaryProjectId && page.id ? (
      <div
        className={cn("absolute z-20", {
          "top-2 right-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100":
            cardStyle === "paper",
          "top-3 right-3": cardStyle === "tile",
        })}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {actionsMenu(
          cardStyle === "paper"
            ? "shadow-sm grid size-6 place-items-center rounded-lg bg-layer-2 text-tertiary hover:bg-layer-3 hover:text-primary"
            : "grid size-6 shrink-0 place-items-center rounded-lg text-tertiary hover:bg-layer-2 hover:text-primary"
        )}
      </div>
    ) : null;

  // "Paper" meta reads like Craft's byline: project · detail · freshness.
  const paperMeta = [
    isProjectScoped ? undefined : primaryProject?.name,
    detail,
    updatedLabel ? `Updated ${updatedLabel}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const tileFooter = [
    isProjectScoped ? undefined : primaryProject?.name,
    updatedLabel ? `Edited ${updatedLabel}` : typeLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const card =
    cardStyle === "paper" ? (
      // Option A — title block over an inset content sheet (Craft-style).
      <div className={cn(cardShellClassName, "p-4 pb-3.5")}>
        <div className="pr-8">
          <div className="flex items-center gap-1.5">
            {/* Click/select lives in the type glyph slot, so selected cards do not need extra top-right chrome. */}
            <span className="relative grid size-3.5 shrink-0 place-items-center">
              <span
                className={cn("grid place-items-center transition-opacity", {
                  "group-focus-within:opacity-0 group-hover:opacity-0": Boolean(page.id),
                  "opacity-0": isSelected || isSelectionActive,
                })}
              >
                {page.logo_props?.in_use ? (
                  <Logo logo={page.logo_props} size={14} type="lucide" />
                ) : (
                  <TypeIcon
                    weight="Bold"
                    className={cn("size-3.5", { "text-accent-primary": isProjectBrief })}
                    style={isProjectBrief ? undefined : { color: typeTint }}
                  />
                )}
              </span>
              {selectionCheckbox("absolute inset-0 grid place-items-center transition-opacity")}
            </span>
            <h3
              className={cn(
                "min-w-0 truncate text-14 leading-snug font-semibold text-secondary transition-colors group-hover:text-primary",
                { "text-accent-primary": isProjectBrief }
              )}
            >
              {displayName}
            </h3>
          </div>
          <p className="mt-1 truncate text-11 text-placeholder">{paperMeta || typeLabel}</p>
        </div>
        {previewSurface("mt-3 flex-1")}
      </div>
    ) : (
      // Option B — compact header, large content thumbnail, meta footer (Drive-style).
      <div className={cn(cardShellClassName, "gap-2 p-2.5")}>
        <div className="flex items-center gap-2 px-1 pt-0.5 pr-8">
          <span
            className={cn(
              "relative grid size-6 shrink-0 place-items-center rounded-[7px]",
              isProjectBrief && "bg-accent-primary/10 text-accent-primary"
            )}
            style={tintStyle}
          >
            {/* Click/select lives in the type glyph slot, so selected cards do not need extra top-right chrome. */}
            <span
              className={cn("grid place-items-center transition-opacity", {
                "group-focus-within:opacity-0 group-hover:opacity-0": Boolean(page.id),
                "opacity-0": isSelected || isSelectionActive,
              })}
            >
              {page.logo_props?.in_use ? (
                <Logo logo={page.logo_props} size={14} type="lucide" />
              ) : (
                <TypeIcon weight="Bold" className="size-3.5" />
              )}
            </span>
            {selectionCheckbox("absolute inset-0 grid place-items-center rounded-[7px] transition-opacity")}
          </span>
          <h3
            className={cn(
              "min-w-0 flex-1 truncate text-13 font-medium text-secondary transition-colors group-hover:text-primary",
              { "text-accent-primary": isProjectBrief }
            )}
          >
            {displayName}
          </h3>
        </div>
        {previewSurface("flex-1")}
        <div className="flex h-5 items-center gap-1.5 px-1 text-11 text-placeholder">
          {page.owned_by && <DocOwnerAvatar userId={page.owned_by} />}
          <span className="truncate">{tileFooter}</span>
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
        <div ref={dragContainerRef} className="group relative">
          {card}
          {actionsMenuOverlay}
        </div>
        {deleteModal}
      </>
    );
  return (
    <>
      <div ref={dragContainerRef} className="group relative">
        <Link
          to={itemLink}
          draggable={false}
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
        {actionsMenuOverlay}
      </div>
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

type BulkOperation = "delete" | "duplicate" | "move" | "folder" | "wiki";

type DocsBulkActionBarProps = {
  selectedPages: TPage[];
  workspaceSlug: string;
  joinedProjectIds: string[];
  getProjectById: ReturnType<typeof useProject>["getProjectById"];
  canDeleteDoc: (page: TPage) => boolean;
  onClear: () => void;
  onRefresh: () => Promise<void>;
  /** Folders the selected docs could be moved into (docs surface only). */
  folders?: TPage[];
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
  folders = [],
}: DocsBulkActionBarProps) {
  const [operation, setOperation] = useState<BulkOperation | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isWikiModalOpen, setIsWikiModalOpen] = useState(false);
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
  const wikiPages = useMemo(
    () => actionPages.filter(({ page, isProjectBrief }) => !isProjectBrief && (page.page_type ?? "doc") === "doc"),
    [actionPages]
  );
  const wikiProjectIds = useMemo(() => Array.from(new Set(wikiPages.map(({ projectId }) => projectId))), [wikiPages]);
  const skippedFromDelete = actionPages.length - deletablePages.length;
  const skippedFromWiki = actionPages.length - wikiPages.length;
  const defaultWikiName = useMemo(() => {
    const projectId = wikiProjectIds.length === 1 ? wikiProjectIds[0] : undefined;
    const projectName = projectId ? getProjectById(projectId)?.name : undefined;
    return projectName ? `${projectName} wiki` : "New wiki";
  }, [getProjectById, wikiProjectIds]);
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

  // `folder: null` clears the selection's folder membership.
  const anySelectedInFolder = movablePages.some(({ page }) => Boolean(page.parent));
  const bulkActionButtonClassName = cn(
    getButtonStyling("secondary", "lg"),
    "min-w-max shrink-0 gap-1.5 px-2.5 leading-none whitespace-nowrap"
  );
  const bulkActionDangerButtonClassName = "min-w-max shrink-0 gap-1.5 px-2.5 leading-none whitespace-nowrap";
  const bulkActionLabelClassName = "whitespace-nowrap leading-none";

  const handleBulkMoveToFolder = async (folder: TPage | null) => {
    if (isBusy) return;
    // A folder lives in one project — only docs sharing it can move in.
    const pagesToProcess = folder
      ? movablePages.filter(
          ({ page, projectId }) => (folder.project_ids ?? []).includes(projectId) && page.parent !== folder.id
        )
      : movablePages.filter(({ page }) => Boolean(page.parent));
    const skippedCount = actionPages.length - pagesToProcess.length;

    if (pagesToProcess.length === 0) {
      setToast({
        type: TOAST_TYPE.WARNING,
        title: "Nothing to move",
        message: folder
          ? "The selected docs are already in that folder or belong to a different project."
          : "None of the selected docs are in a folder.",
      });
      return;
    }

    await finishBulkOperation(
      "folder",
      pagesToProcess,
      async ({ pageId, projectId }) =>
        await pageService.update(workspaceSlug, projectId, pageId, { parent: folder?.id ?? null }),
      (processedCount) =>
        folder
          ? `${processedCount} ${docLabel(processedCount)} moved to ${getPageName(folder.name)}.${skippedDocsMessage(skippedCount)}`
          : `${processedCount} ${docLabel(processedCount)} removed from folders.`,
      (failedCount, processedCount) =>
        `Couldn't move ${failedCount} of ${processedCount} selected ${docLabel(processedCount)}.`
    );
  };

  const handleOpenCreateWiki = () => {
    if (isBusy) return;
    if (wikiPages.length < 2) {
      setToast({
        type: TOAST_TYPE.WARNING,
        title: "Select more docs",
        message: "Select at least two regular docs to create a wiki.",
      });
      return;
    }
    if (wikiProjectIds.length !== 1) {
      setToast({
        type: TOAST_TYPE.WARNING,
        title: "One project only",
        message: "A wiki lives inside one project. Select docs from the same project.",
      });
      return;
    }
    setIsWikiModalOpen(true);
  };

  const handleCreateWikiFromDocs = async (name: string) => {
    if (isBusy || wikiProjectIds.length !== 1 || wikiPages.length < 2) return;
    const projectId = wikiProjectIds[0];
    if (!projectId) return;
    setOperation("wiki");
    try {
      const folder = await pageService.create(workspaceSlug, projectId, {
        access: EPageAccess.PRIVATE,
        page_type: "folder",
        name,
      });
      if (!folder?.id) throw new Error("Wiki folder could not be created.");
      const folderId = folder.id;

      const results = await Promise.allSettled(
        wikiPages.map(({ pageId }) => pageService.update(workspaceSlug, projectId, pageId, { parent: folderId }))
      );
      const failedCount = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      ).length;
      await onRefresh().catch(() => undefined);
      setIsWikiModalOpen(false);

      if (failedCount === 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Wiki created",
          message: `${wikiPages.length} ${docLabel(wikiPages.length)} moved into ${name}.${skippedDocsMessage(skippedFromWiki)}`,
        });
        onClear();
      } else {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: "Wiki partially created",
          message: `${wikiPages.length - failedCount} moved, ${failedCount} failed.${skippedDocsMessage(skippedFromWiki)}`,
        });
      }
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: pageActionErrorMessage(error, "Wiki could not be created. Please try again later."),
      });
    } finally {
      setOperation(null);
    }
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
      <CreateWikiFromDocsModal
        isOpen={isWikiModalOpen}
        initialName={defaultWikiName}
        selectedCount={wikiPages.length}
        skippedCount={skippedFromWiki}
        isSubmitting={operation === "wiki"}
        onClose={() => {
          if (operation !== "wiki") setIsWikiModalOpen(false);
        }}
        onSubmit={handleCreateWikiFromDocs}
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
          <Button
            variant="ghost"
            size="lg"
            onClick={onClear}
            disabled={isBusy}
            aria-label="Clear selection"
            className="shrink-0"
          >
            <X className="size-3.5 shrink-0" />
            <span className={bulkActionLabelClassName}>Clear</span>
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={handleOpenCreateWiki}
            disabled={isBusy}
            aria-label="Create wiki"
            className={bulkActionButtonClassName}
          >
            <FolderPlus className="size-3.5 shrink-0" />
            <span className={bulkActionLabelClassName}>{operation === "wiki" ? "Creating..." : "Create wiki"}</span>
          </Button>
          {(folders.length > 0 || anySelectedInFolder) && (
            <CustomMenu
              ariaLabel="Move selected docs to a folder"
              placement="top-start"
              maxHeight="lg"
              disabled={isBusy || movablePages.length === 0}
              customButtonClassName={bulkActionButtonClassName}
              customButton={
                <>
                  <SolarFolder className="size-3.5 shrink-0" />
                  <span className={bulkActionLabelClassName}>
                    {operation === "folder" ? "Moving..." : "Add to folder"}
                  </span>
                  <ChevronDown className="size-3 shrink-0" />
                </>
              }
              optionsClassName="w-64"
            >
              {anySelectedInFolder && (
                <CustomMenu.MenuItem disabled={isBusy} onClick={() => void handleBulkMoveToFolder(null)}>
                  <span className="flex items-center gap-2">
                    <X className="size-4" />
                    Remove from folder
                  </span>
                </CustomMenu.MenuItem>
              )}
              {folders.map((folder) => (
                <CustomMenu.MenuItem
                  key={folder.id}
                  disabled={isBusy}
                  onClick={() => void handleBulkMoveToFolder(folder)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <SolarFolder className="size-4 shrink-0 text-tertiary" />
                    <span className="truncate">{getPageName(folder.name)}</span>
                  </span>
                </CustomMenu.MenuItem>
              ))}
            </CustomMenu>
          )}
          <CustomMenu
            ariaLabel="Move selected docs"
            placement="top-start"
            maxHeight="lg"
            closeOnSelect={false}
            disabled={isBusy || movablePages.length === 0}
            customButtonClassName={bulkActionButtonClassName}
            customButton={
              <>
                <ArrowRightLeft className="size-3.5 shrink-0" />
                <span className={bulkActionLabelClassName}>
                  {operation === "move" ? "Moving..." : "Move to project"}
                </span>
                <ChevronDown className="size-3 shrink-0" />
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
          <Button
            variant="secondary"
            size="lg"
            onClick={handleBulkDuplicate}
            disabled={isBusy}
            aria-label="Duplicate"
            className={bulkActionButtonClassName}
          >
            <DetailIcon icon={Copy01Icon} className="size-3.5 shrink-0" color="currentColor" strokeWidth={1.5} />
            <span className={bulkActionLabelClassName}>
              {operation === "duplicate" ? "Duplicating..." : "Duplicate"}
            </span>
          </Button>
          <Button
            variant="error-outline"
            size="lg"
            onClick={handleBulkDelete}
            disabled={isBusy || deletablePages.length === 0}
            aria-label="Delete"
            className={bulkActionDangerButtonClassName}
          >
            <DetailIcon icon={Delete02Icon} className="size-3.5 shrink-0" color="currentColor" strokeWidth={1.5} />
            <span className={bulkActionLabelClassName}>{operation === "delete" ? "Deleting..." : "Delete"}</span>
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
  // Never offered as a filter option (folders aren't content), but the record
  // must cover every TPageType.
  folder: { label: "Folders", Icon: Folder },
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

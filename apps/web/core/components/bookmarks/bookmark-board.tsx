/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark as BookmarkIcon,
  CancelCircleIcon,
  Copy01Icon,
  Delete02Icon,
  FilterIcon,
  GridIcon,
  LinkSquare01Icon,
  ListViewIcon,
  PencilEdit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { sortBy } from "lodash-es";
import { observer } from "mobx-react";
import Link from "next/link";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectBookmark, TProjectBookmarkCreatePayload } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ListItem, ListLayout } from "@/components/core/list";
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { PageSearchInput } from "@/components/pages/list/search-input";
import { useBookmark } from "@/hooks/store/use-bookmark";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import useLocalStorage from "@/hooks/use-local-storage";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

type Props = {
  workspaceSlug: string;
  projectId?: string;
  mode: "project" | "workspace";
};

type BookmarkDraft = {
  title: string;
  url: string;
  description: string;
  tags: string;
};

type ViewMode = "list" | "grid";

const EMPTY_DRAFT: BookmarkDraft = {
  title: "",
  url: "",
  description: "",
  tags: "",
};

const normalizeTags = (tags: string) =>
  tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const domainFromUrl = (url: string) => {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
};

const internalBookmarkHref = (workspaceSlug: string, bookmark: TProjectBookmark) => {
  const projectId = bookmark.project_id;
  const entityId = bookmark.entity_identifier;
  switch (bookmark.entity_type) {
    case "project":
      return `/${workspaceSlug}/projects/${projectId}/issues`;
    case "issue":
    case "work_item":
      return entityId ? `/${workspaceSlug}/projects/${projectId}/issues/${entityId}` : "";
    case "page":
      return entityId ? `/${workspaceSlug}/projects/${projectId}/pages/${entityId}` : "";
    case "cycle":
      return entityId ? `/${workspaceSlug}/projects/${projectId}/cycles/${entityId}` : "";
    case "module":
      return entityId ? `/${workspaceSlug}/projects/${projectId}/modules/${entityId}` : "";
    case "view":
      return entityId ? `/${workspaceSlug}/projects/${projectId}/views/${entityId}` : "";
    default:
      return "";
  }
};

const bookmarkHref = (workspaceSlug: string, bookmark: TProjectBookmark) =>
  bookmark.url || internalBookmarkHref(workspaceSlug, bookmark);

const bookmarkSource = (bookmark: TProjectBookmark) =>
  bookmark.metadata?.site_name || domainFromUrl(bookmark.url) || bookmark.entity_type || "DragonFruit";

const bookmarkPreviewImage = (bookmark: TProjectBookmark) => {
  const metadata = bookmark.metadata ?? {};
  if (typeof metadata.image_url === "string" && metadata.image_url) return metadata.image_url;
  if (typeof metadata.og_image_url === "string" && metadata.og_image_url) return metadata.og_image_url;
  return "";
};

const toPayload = (draft: BookmarkDraft): TProjectBookmarkCreatePayload => ({
  title: draft.title.trim() || domainFromUrl(draft.url) || "Untitled bookmark",
  url: draft.url.trim(),
  description: draft.description.trim(),
  tags: normalizeTags(draft.tags),
  metadata: {},
});

function BookmarkForm(props: {
  draft: BookmarkDraft;
  setDraft: (draft: BookmarkDraft) => void;
  projectOptions: { id: string; name: string }[];
  selectedProjectId: string;
  setSelectedProjectId: (projectId: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  showProjectSelect: boolean;
  isEditing: boolean;
}) {
  const {
    draft,
    setDraft,
    projectOptions,
    selectedProjectId,
    setSelectedProjectId,
    onSubmit,
    onCancel,
    submitLabel,
    showProjectSelect,
    isEditing,
  } = props;
  return (
    <div className="rounded-lg border border-subtle bg-layer-1 p-3">
      {showProjectSelect && (
        <label className="mb-2 block">
          <span className="sr-only">Project</span>
          <select
            className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none disabled:cursor-not-allowed disabled:text-tertiary"
            value={selectedProjectId}
            disabled={isEditing}
            onChange={(event) => setSelectedProjectId(event.target.value)}
          >
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid gap-2 md:grid-cols-[1.2fr_1.8fr]">
        <input
          className="focus:border-accent-primary h-9 rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none"
          placeholder="Title"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        <input
          className="focus:border-accent-primary h-9 rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none"
          placeholder="https://..."
          value={draft.url}
          onChange={(event) => setDraft({ ...draft, url: event.target.value })}
        />
      </div>
      <textarea
        className="focus:border-accent-primary mt-2 min-h-20 w-full resize-y rounded-md border border-subtle bg-surface-1 px-3 py-2 text-13 text-primary outline-none"
        placeholder="Note"
        value={draft.description}
        onChange={(event) => setDraft({ ...draft, description: event.target.value })}
      />
      <input
        className="focus:border-accent-primary mt-2 h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none"
        placeholder="Tags, separated by commas"
        value={draft.tags}
        onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-13 font-medium text-secondary hover:bg-layer-transparent-hover"
        >
          <HugeiconsIcon icon={CancelCircleIcon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-accent-primary px-3 text-13 font-medium text-on-color hover:opacity-90"
        >
          <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function BookmarkCard(props: {
  bookmark: TProjectBookmark;
  workspaceSlug: string;
  showProject: boolean;
  onEdit: (bookmark: TProjectBookmark) => void;
  onDelete: (bookmark: TProjectBookmark) => void;
}) {
  const { bookmark, workspaceSlug, showProject, onEdit, onDelete } = props;
  const href = bookmarkHref(workspaceSlug, bookmark);
  const isExternal = !!bookmark.url;
  const imageUrl = bookmarkPreviewImage(bookmark);
  const faviconUrl = typeof bookmark.metadata?.favicon_url === "string" ? bookmark.metadata.favicon_url : "";
  const cardBody = (
    <div className="group flex h-[260px] flex-col gap-3 rounded-lg border border-subtle bg-surface-1 p-4 transition-colors hover:border-strong">
      <div className="flex items-start gap-2.5">
        <span className="grid size-5 shrink-0 place-items-center">
          {isExternal ? (
            <HugeiconsIcon
              icon={LinkSquare01Icon}
              className="size-4 text-tertiary"
              color="currentColor"
              strokeWidth={1.5}
            />
          ) : faviconUrl ? (
            <img src={faviconUrl} alt="" className="size-4 rounded" />
          ) : (
            <HugeiconsIcon
              icon={BookmarkIcon}
              className="size-4 text-tertiary"
              color="currentColor"
              strokeWidth={1.5}
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-13 leading-tight font-semibold text-primary">{bookmark.title}</h3>
          <p className="mt-1 truncate text-11 text-tertiary">{bookmarkSource(bookmark)}</p>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden rounded-md border border-subtle/60 bg-layer-1">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : bookmark.description ? (
          <p
            className="px-3 pt-3 pb-6 text-12 leading-relaxed text-secondary"
            style={{
              WebkitMaskImage: "linear-gradient(to bottom, black 65%, transparent 100%)",
              maskImage: "linear-gradient(to bottom, black 65%, transparent 100%)",
            }}
          >
            {bookmark.description}
          </p>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-tertiary/60">
            <HugeiconsIcon icon={BookmarkIcon} className="size-8" color="currentColor" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="flex min-h-6 items-center gap-1.5 text-11 text-tertiary">
        {showProject && bookmark.project_name && (
          <span className="inline-flex max-w-[8rem] rounded-sm bg-layer-1 px-1.5 py-0.5 text-secondary">
            <span className="truncate">{bookmark.project_name}</span>
          </span>
        )}
        {bookmark.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="rounded-sm bg-layer-1 px-1.5 py-0.5 text-tertiary">
            {tag}
          </span>
        ))}
        {bookmark.tags.length > 2 && <span>+{bookmark.tags.length - 2}</span>}
        {bookmark.updated_at && <span className="ml-auto shrink-0">{renderFormattedDate(bookmark.updated_at)}</span>}
      </div>
      <div className="flex items-center justify-end gap-1 border-t border-subtle pt-2">
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md text-icon-tertiary hover:bg-layer-transparent-hover hover:text-primary"
          onClick={(event) => {
            event.preventDefault();
            void navigator.clipboard?.writeText(href);
          }}
          aria-label="Copy bookmark link"
        >
          <HugeiconsIcon icon={Copy01Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md text-icon-tertiary hover:bg-layer-transparent-hover hover:text-primary"
          onClick={(event) => {
            event.preventDefault();
            onEdit(bookmark);
          }}
          aria-label="Edit bookmark"
        >
          <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="hover:bg-red-500/10 hover:text-red-500 grid size-7 place-items-center rounded-md text-icon-tertiary"
          onClick={(event) => {
            event.preventDefault();
            onDelete(bookmark);
          }}
          aria-label="Delete bookmark"
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );

  if (!href) return cardBody;
  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="focus-visible:ring-accent-primary/40 block rounded-lg focus:outline-none focus-visible:ring-2"
      >
        {cardBody}
      </a>
    );
  }
  return (
    <Link
      href={href}
      className="focus-visible:ring-accent-primary/40 block rounded-lg focus:outline-none focus-visible:ring-2"
    >
      {cardBody}
    </Link>
  );
}

function BookmarkListItem(props: {
  bookmark: TProjectBookmark;
  workspaceSlug: string;
  showProject: boolean;
  onEdit: (bookmark: TProjectBookmark) => void;
  onDelete: (bookmark: TProjectBookmark) => void;
}) {
  const { bookmark, workspaceSlug, showProject, onEdit, onDelete } = props;
  const parentRef = useRef<HTMLDivElement>(null);
  const { isMobile } = usePlatformOS();
  const href = bookmarkHref(workspaceSlug, bookmark);
  const isExternal = !!bookmark.url;

  return (
    <ListItem
      title={bookmark.title}
      itemLink={href || "#"}
      disableLink={!href}
      onItemClick={
        isExternal
          ? (event) => {
              event.preventDefault();
              window.open(href, "_blank", "noopener,noreferrer");
            }
          : undefined
      }
      isMobile={isMobile}
      parentRef={parentRef}
      prependTitleElement={
        isExternal ? (
          <HugeiconsIcon
            icon={LinkSquare01Icon}
            className="size-4 text-tertiary"
            color="currentColor"
            strokeWidth={1.5}
          />
        ) : (
          <HugeiconsIcon icon={BookmarkIcon} className="size-4 text-tertiary" color="currentColor" strokeWidth={1.5} />
        )
      }
      actionableItems={
        <div className="flex items-center gap-3 text-13 text-tertiary">
          <div className="flex items-center gap-1.5">
            {showProject && bookmark.project_name && (
              <span className="rounded-sm bg-layer-1 px-1.5 py-0.5 text-11 text-secondary">
                {bookmark.project_name}
              </span>
            )}
            {bookmark.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-sm bg-layer-1 px-1.5 py-0.5 text-11 text-tertiary">
                {tag}
              </span>
            ))}
            {bookmark.tags.length > 3 && <span className="text-11">+{bookmark.tags.length - 3}</span>}
          </div>
          {bookmark.updated_at && <span className="text-11">{renderFormattedDate(bookmark.updated_at)}</span>}
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md text-icon-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            onClick={() => void navigator.clipboard?.writeText(href)}
            aria-label="Copy bookmark link"
          >
            <HugeiconsIcon icon={Copy01Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md text-icon-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            onClick={() => onEdit(bookmark)}
            aria-label="Edit bookmark"
          >
            <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="hover:bg-red-500/10 hover:text-red-500 grid size-7 place-items-center rounded-md text-icon-tertiary"
            onClick={() => onDelete(bookmark)}
            aria-label="Delete bookmark"
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          </button>
        </div>
      }
    />
  );
}

type ViewModeToggleProps = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  const options: Array<{ value: ViewMode; icon: IconSvgElement; label: string }> = [
    { value: "list", icon: ListViewIcon, label: "List view" },
    { value: "grid", icon: GridIcon, label: "Grid view" },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-subtle p-0.5">
      {options.map(({ value, icon, label }) => {
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
            <HugeiconsIcon icon={icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

type BookmarkFilterSectionProps = {
  mode: "project" | "workspace";
  tags: string[];
  selectedProjectIds: string[];
  selectedTags: string[];
  onToggleProject: (projectId: string) => void;
  onToggleTag: (tag: string) => void;
  onClearProjects: () => void;
  onClearTags: () => void;
};

const BookmarkFilterSection = observer(function BookmarkFilterSection({
  mode,
  tags,
  selectedProjectIds,
  selectedTags,
  onToggleProject,
  onToggleTag,
  onClearProjects,
  onClearTags,
}: BookmarkFilterSectionProps) {
  const { joinedProjectIds, getProjectById } = useProject();
  const [projectSearch, setProjectSearch] = useState("");
  const [projectsPreviewEnabled, setProjectsPreviewEnabled] = useState(true);
  const [tagsPreviewEnabled, setTagsPreviewEnabled] = useState(true);

  const sortedProjects = useMemo(() => {
    const normalizedSearch = projectSearch.trim().toLowerCase();
    const projects = (joinedProjectIds ?? [])
      .map((id) => getProjectById(id))
      .filter((project): project is NonNullable<typeof project> => Boolean(project))
      .filter((project) => project.name.toLowerCase().includes(normalizedSearch));
    return sortBy(projects, [
      (project) => !selectedProjectIds.includes(project.id),
      (project) => project.name.toLowerCase(),
    ]);
  }, [getProjectById, joinedProjectIds, projectSearch, selectedProjectIds]);

  return (
    <div className="flex max-h-[24rem] flex-col overflow-y-auto">
      {mode === "workspace" && (
        <>
          <div className="p-2">
            <input
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
              placeholder="Search projects"
              className="w-full rounded-sm border border-subtle bg-canvas px-2 py-1 text-11 text-primary outline-none placeholder:text-placeholder"
            />
          </div>
          <div className="px-2 pb-2">
            <FilterHeader
              title={`Project${selectedProjectIds.length > 0 ? ` (${selectedProjectIds.length})` : ""}`}
              isPreviewEnabled={projectsPreviewEnabled}
              handleIsPreviewEnabled={() => setProjectsPreviewEnabled(!projectsPreviewEnabled)}
            />
            {projectsPreviewEnabled &&
              (sortedProjects.length > 0 ? (
                sortedProjects.map((project) => (
                  <FilterOption
                    key={`bookmark-project-${project.id}`}
                    isChecked={selectedProjectIds.includes(project.id)}
                    onClick={() => onToggleProject(project.id)}
                    title={project.name}
                  />
                ))
              ) : (
                <p className="px-1.5 text-11 text-placeholder italic">No matches found</p>
              ))}
            {selectedProjectIds.length > 0 && (
              <button
                type="button"
                onClick={onClearProjects}
                className="mt-2 w-full text-left text-11 text-tertiary hover:text-primary"
              >
                Clear project filter
              </button>
            )}
          </div>
        </>
      )}
      <div className="px-2 pb-2">
        <FilterHeader
          title={`Tag${selectedTags.length > 0 ? ` (${selectedTags.length})` : ""}`}
          isPreviewEnabled={tagsPreviewEnabled}
          handleIsPreviewEnabled={() => setTagsPreviewEnabled(!tagsPreviewEnabled)}
        />
        {tagsPreviewEnabled &&
          (tags.length > 0 ? (
            tags.map((tag) => (
              <FilterOption
                key={`bookmark-tag-${tag}`}
                isChecked={selectedTags.includes(tag)}
                onClick={() => onToggleTag(tag)}
                title={tag}
              />
            ))
          ) : (
            <p className="px-1.5 text-11 text-placeholder italic">No tags yet</p>
          ))}
        {selectedTags.length > 0 && (
          <button
            type="button"
            onClick={onClearTags}
            className="mt-2 w-full text-left text-11 text-tertiary hover:text-primary"
          >
            Clear tag filter
          </button>
        )}
      </div>
    </div>
  );
});

export const BookmarkBoard = observer(function BookmarkBoard(props: Props) {
  const { workspaceSlug, projectId, mode } = props;
  const bookmarkStore = useBookmark();
  const { joinedProjectIds, getPartialProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  const [query, setQuery] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<BookmarkDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "");
  const { storedValue: storedViewMode, setValue: setViewMode } = useLocalStorage<ViewMode>(
    `bookmarks_view_mode_${mode}`,
    "grid"
  );
  const viewMode: ViewMode = storedViewMode ?? "grid";

  useEffect(() => {
    if (mode === "project" && projectId) void bookmarkStore.fetchProjectBookmarks(workspaceSlug, projectId);
    if (mode === "workspace") void bookmarkStore.fetchWorkspaceBookmarks(workspaceSlug);
  }, [bookmarkStore, mode, projectId, workspaceSlug]);

  const bookmarks =
    mode === "project" && projectId
      ? bookmarkStore.projectBookmarks(projectId)
      : bookmarkStore.workspaceBookmarks(workspaceSlug);
  const tags = useMemo(() => sortBy([...new Set(bookmarks.flatMap((bookmark) => bookmark.tags))]), [bookmarks]);
  const filteredBookmarks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return bookmarks.filter((bookmark) => {
      const haystack = [
        bookmark.title,
        bookmark.description,
        bookmark.url,
        bookmark.project_name,
        bookmark.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
      if (selectedProjectIds.length > 0 && !selectedProjectIds.includes(bookmark.project_id)) return false;
      if (selectedTags.length > 0 && !selectedTags.some((tag) => bookmark.tags.includes(tag))) return false;
      return true;
    });
  }, [bookmarks, query, selectedProjectIds, selectedTags]);

  const toggleProjectFilter = (filterProjectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(filterProjectId) ? prev.filter((id) => id !== filterProjectId) : [...prev, filterProjectId]
    );
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag]));
  };

  const hasFilters = query.trim().length > 0 || selectedProjectIds.length > 0 || selectedTags.length > 0;

  const writableProjectIds = useMemo(() => {
    if (mode === "project") {
      return projectId &&
        allowPermissions(
          [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
          EUserPermissionsLevel.PROJECT,
          workspaceSlug,
          projectId
        )
        ? [projectId]
        : [];
    }

    return joinedProjectIds.filter((joinedProjectId) =>
      allowPermissions(
        [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        EUserPermissionsLevel.PROJECT,
        workspaceSlug,
        joinedProjectId
      )
    );
  }, [allowPermissions, joinedProjectIds, mode, projectId, workspaceSlug]);

  const writableProjects = useMemo(
    () =>
      writableProjectIds.map((writableProjectId) => ({
        id: writableProjectId,
        name: getPartialProjectById(writableProjectId)?.name ?? "Untitled project",
      })),
    [getPartialProjectById, writableProjectIds]
  );

  useEffect(() => {
    if (!showForm || editingId) return;
    if (selectedProjectId && writableProjectIds.includes(selectedProjectId)) return;
    setSelectedProjectId(
      projectId && writableProjectIds.includes(projectId) ? projectId : (writableProjectIds[0] ?? "")
    );
  }, [editingId, projectId, selectedProjectId, showForm, writableProjectIds]);

  const handleSubmit = async () => {
    const targetProjectId = editingId
      ? (bookmarkStore.bookmarkMap[editingId]?.project_id ?? selectedProjectId)
      : mode === "project"
        ? projectId
        : selectedProjectId;
    if (!targetProjectId) return;
    try {
      if (editingId) {
        await bookmarkStore.updateBookmark(workspaceSlug, targetProjectId, editingId, toPayload(draft));
      } else {
        await bookmarkStore.createBookmark(workspaceSlug, targetProjectId, toPayload(draft));
      }
      setDraft(EMPTY_DRAFT);
      setEditingId(null);
      setShowForm(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Bookmark could not be saved" });
    }
  };

  const handleEdit = (bookmark: TProjectBookmark) => {
    setEditingId(bookmark.id);
    setSelectedProjectId(bookmark.project_id);
    setDraft({
      title: bookmark.title,
      url: bookmark.url,
      description: bookmark.description,
      tags: bookmark.tags.join(", "),
    });
    setShowForm(true);
  };

  const handleDelete = async (bookmark: TProjectBookmark) => {
    try {
      await bookmarkStore.deleteBookmark(workspaceSlug, bookmark.project_id, bookmark.id);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Bookmark could not be deleted" });
    }
  };

  const canCreateBookmark = writableProjectIds.length > 0;

  const header = (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-2.5">
          <Breadcrumbs>
            {mode === "project" && projectId && (
              <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug} projectId={projectId} />
            )}
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="Bookmarks"
                  href={
                    mode === "project" && projectId
                      ? `/${workspaceSlug}/projects/${projectId}/bookmarks`
                      : `/${workspaceSlug}/bookmarks`
                  }
                  icon={
                    <HugeiconsIcon
                      icon={BookmarkIcon}
                      className="size-4 text-secondary"
                      color="currentColor"
                      strokeWidth={1.5}
                    />
                  }
                  isLast
                />
              }
              isLast
            />
          </Breadcrumbs>
        </div>
      </Header.LeftItem>
      <Header.RightItem className="items-center">
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        <PageSearchInput searchQuery={query} updateSearchQuery={setQuery} placeholder="Search bookmarks" />
        <FiltersDropdown
          icon={<HugeiconsIcon icon={FilterIcon} className="h-3 w-3" color="currentColor" strokeWidth={1.5} />}
          title="Filters"
          placement="bottom-end"
          isFiltersApplied={selectedProjectIds.length > 0 || selectedTags.length > 0}
        >
          <BookmarkFilterSection
            mode={mode}
            tags={tags}
            selectedProjectIds={selectedProjectIds}
            selectedTags={selectedTags}
            onToggleProject={toggleProjectFilter}
            onToggleTag={toggleTagFilter}
            onClearProjects={() => setSelectedProjectIds([])}
            onClearTags={() => setSelectedTags([])}
          />
        </FiltersDropdown>
        {canCreateBookmark && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setEditingId(null);
              setDraft(EMPTY_DRAFT);
              setSelectedProjectId(
                projectId && writableProjectIds.includes(projectId) ? projectId : (writableProjectIds[0] ?? "")
              );
              setShowForm((value) => !value);
            }}
          >
            New bookmark
          </Button>
        )}
      </Header.RightItem>
    </Header>
  );

  return (
    <>
      <AppHeader header={header} />
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        <div className="flex flex-shrink-0 flex-col gap-4 px-5 pt-5">
          {showForm && canCreateBookmark && (
            <BookmarkForm
              draft={draft}
              setDraft={setDraft}
              projectOptions={writableProjects}
              selectedProjectId={selectedProjectId}
              setSelectedProjectId={setSelectedProjectId}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditingId(null);
                setDraft(EMPTY_DRAFT);
              }}
              submitLabel={editingId ? "Save" : "Add bookmark"}
              showProjectSelect={mode === "workspace"}
              isEditing={!!editingId}
            />
          )}
        </div>
        {filteredBookmarks.length === 0 ? (
          <EmptyStateDetailed
            assetKey={hasFilters ? "search" : "page"}
            title={hasFilters ? "No bookmarks match your filters" : "No bookmarks yet"}
            description={
              hasFilters
                ? "Try clearing the search, project, or tag filters."
                : "Save useful links, docs, pages, and references so they are easy to find later."
            }
            actions={
              !hasFilters && canCreateBookmark
                ? [
                    {
                      label: "New bookmark",
                      variant: "primary",
                      onClick: () => {
                        setEditingId(null);
                        setDraft(EMPTY_DRAFT);
                        setSelectedProjectId(
                          projectId && writableProjectIds.includes(projectId)
                            ? projectId
                            : (writableProjectIds[0] ?? "")
                        );
                        setShowForm(true);
                      },
                    },
                  ]
                : undefined
            }
          />
        ) : viewMode === "grid" ? (
          <div className="vertical-scrollbar scrollbar-lg h-full w-full overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredBookmarks.map((bookmark) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  workspaceSlug={workspaceSlug}
                  showProject={mode === "workspace"}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        ) : (
          <ListLayout>
            {filteredBookmarks.map((bookmark) => (
              <BookmarkListItem
                key={bookmark.id}
                bookmark={bookmark}
                workspaceSlug={workspaceSlug}
                showProject={mode === "workspace"}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </ListLayout>
        )}
      </div>
    </>
  );
});

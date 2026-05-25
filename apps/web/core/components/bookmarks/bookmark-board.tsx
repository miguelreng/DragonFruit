/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { sortBy } from "lodash-es";
import { observer } from "mobx-react";
import Link from "next/link";
import {
  Copy,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash,
  X,
} from "@/components/icons/lucide-shim";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectBookmark, TProjectBookmarkCreatePayload } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
import { cn } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { useBookmark } from "@/hooks/store/use-bookmark";
import { useUserPermissions } from "@/hooks/store/user";
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
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const { draft, setDraft, onSubmit, onCancel, submitLabel } = props;
  return (
    <div className="rounded-lg border border-subtle bg-layer-1 p-3">
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
          <X className="size-3.5" />
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-accent-primary px-3 text-13 font-medium text-on-color hover:opacity-90"
        >
          <Plus className="size-3.5" />
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
  const imageUrl = typeof bookmark.metadata?.image_url === "string" ? bookmark.metadata.image_url : "";
  const faviconUrl = typeof bookmark.metadata?.favicon_url === "string" ? bookmark.metadata.favicon_url : "";
  const cardBody = (
    <div className="shadow-sm break-inside-avoid overflow-hidden rounded-lg border border-subtle bg-surface-1 transition hover:border-strong hover:shadow-raised-200">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-auto max-h-72 w-full object-cover" />
      ) : (
        <div className="flex aspect-[4/2.5] items-center justify-center bg-layer-1 text-icon-tertiary">
          {faviconUrl ? <img src={faviconUrl} alt="" className="size-8 rounded" /> : <FileText className="size-8" />}
        </div>
      )}
      <div className="space-y-3 p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-14 font-semibold text-primary">{bookmark.title}</h3>
            <p className="mt-1 truncate text-12 text-tertiary">{bookmarkSource(bookmark)}</p>
          </div>
          {isExternal ? (
            <ExternalLink className="size-4 flex-shrink-0 text-icon-tertiary" />
          ) : (
            <Star className="size-4 flex-shrink-0 text-icon-tertiary" />
          )}
        </div>
        {bookmark.description && (
          <p className="line-clamp-4 text-13 leading-5 text-secondary">{bookmark.description}</p>
        )}
        {showProject && bookmark.project_name && (
          <span className="inline-flex max-w-full rounded-md bg-layer-1 px-2 py-1 text-11 font-medium text-secondary">
            <span className="truncate">{bookmark.project_name}</span>
          </span>
        )}
        {bookmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {bookmark.tags.map((tag) => (
              <span key={tag} className="rounded bg-layer-1 px-1.5 py-0.5 text-11 font-medium text-tertiary">
                {tag}
              </span>
            ))}
          </div>
        )}
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
            <Copy className="size-3.5" />
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
            <Pencil className="size-3.5" />
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
            <Trash className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  if (!href) return cardBody;
  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block">
        {cardBody}
      </a>
    );
  }
  return (
    <Link href={href} className="block">
      {cardBody}
    </Link>
  );
}

export const BookmarkBoard = observer(function BookmarkBoard(props: Props) {
  const { workspaceSlug, projectId, mode } = props;
  const bookmarkStore = useBookmark();
  const { allowPermissions } = useUserPermissions();
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<BookmarkDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "project" && projectId) void bookmarkStore.fetchProjectBookmarks(workspaceSlug, projectId);
    if (mode === "workspace") void bookmarkStore.fetchWorkspaceBookmarks(workspaceSlug);
  }, [bookmarkStore, mode, projectId, workspaceSlug]);

  const bookmarks =
    mode === "project" && projectId
      ? bookmarkStore.projectBookmarks(projectId)
      : bookmarkStore.workspaceBookmarks(workspaceSlug);
  const tags = useMemo(() => sortBy([...new Set(bookmarks.flatMap((bookmark) => bookmark.tags))]), [bookmarks]);
  const filteredBookmarks = bookmarks.filter((bookmark) => {
    const haystack = [
      bookmark.title,
      bookmark.description,
      bookmark.url,
      bookmark.project_name,
      bookmark.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (!activeTag || bookmark.tags.includes(activeTag));
  });

  const handleSubmit = async () => {
    if (!projectId && mode === "project") return;
    const targetProjectId = projectId;
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

  const canCreateBookmark =
    mode === "project" &&
    !!projectId &&
    allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
      EUserPermissionsLevel.PROJECT,
      workspaceSlug,
      projectId
    );

  const header = (
    <Header>
      <Header.LeftItem>
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
                icon={<Star className="h-4 w-4 text-tertiary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem className="flex-wrap">
        <div className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3">
          <Search className="size-3.5 flex-shrink-0 text-icon-tertiary" />
          <input
            className="h-full w-44 min-w-0 bg-transparent text-13 text-primary outline-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
          />
        </div>
        {canCreateBookmark && (
          <Button
            variant="primary"
            size="lg"
            className="items-center gap-1"
            onClick={() => {
              setEditingId(null);
              setDraft(EMPTY_DRAFT);
              setShowForm((value) => !value);
            }}
          >
            <Plus className="size-4" />
            Add link
          </Button>
        )}
      </Header.RightItem>
    </Header>
  );

  return (
    <>
      <AppHeader header={header} />
      <ContentWrapper>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
          {tags.length > 0 && (
            <div className="flex gap-1 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setActiveTag("")}
                className={cn("h-7 rounded-md px-2 text-12 font-medium", {
                  "bg-accent-subtle text-accent-primary": !activeTag,
                  "bg-layer-1 text-tertiary hover:text-secondary": activeTag,
                })}
              >
                All
              </button>
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTag(tag)}
                  className={cn("h-7 rounded-md px-2 text-12 font-medium", {
                    "bg-accent-subtle text-accent-primary": activeTag === tag,
                    "bg-layer-1 text-tertiary hover:text-secondary": activeTag !== tag,
                  })}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
          {showForm && canCreateBookmark && (
            <BookmarkForm
              draft={draft}
              setDraft={setDraft}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditingId(null);
                setDraft(EMPTY_DRAFT);
              }}
              submitLabel={editingId ? "Save" : "Add link"}
            />
          )}
          {filteredBookmarks.length === 0 ? (
            <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-lg border border-dashed border-subtle bg-layer-1 px-4 text-center">
              <div className="grid size-12 place-items-center rounded-lg bg-surface-1 text-icon-tertiary">
                <LinkIcon className="size-6" />
              </div>
              <h2 className="text-15 mt-4 font-semibold text-primary">No bookmarks yet</h2>
              {canCreateBookmark && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent-primary px-3 text-13 font-medium text-on-color hover:opacity-90"
                  >
                    <Plus className="size-4" />
                    Add link
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-3 text-13 font-medium text-secondary hover:bg-layer-transparent-hover"
                  >
                    <Sparkles className="size-4" />
                    Ask Copilot
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4 [&>*]:mb-4">
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
          )}
        </div>
      </ContentWrapper>
    </>
  );
});

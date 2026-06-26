/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Bookmark as BookmarkIcon,
  CancelCircle as CancelCircleIcon,
  Copy as Copy01Icon,
  ExternalLink as LinkSquare01Icon,
  MoreHorizontal,
  Plus as PlusSignIcon,
  Trash as Delete02Icon,
  UploadCloud as Upload03Icon,
} from "@/components/icons/lucide-shim";
import { sortBy } from "lodash-es";
import { observer } from "mobx-react";
import Link from "next/link";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { fetchWikipediaSummary } from "@plane/editor";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { Button } from "@plane/propel/button";
import { ChevronDownIcon } from "@/components/icons/propel-shim";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectBookmark, TProjectBookmarkCreatePayload } from "@plane/types";
import { AlertModalCore, Breadcrumbs, Checkbox, CustomMenu, EModalWidth, Header, Loader, ModalCore } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ListItem } from "@/components/core/list";
import { ViewModeToggle, type ViewMode } from "@/components/core/view-mode-toggle";
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { PageSearchInput } from "@/components/pages/list/search-input";
import { useBookmark } from "@/hooks/store/use-bookmark";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import useLocalStorage from "@/hooks/use-local-storage";
import { useAppRailPreferences } from "@/hooks/use-navigation-preferences";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { BookmarkDetailModal } from "./bookmark-detail-modal";
import {
  bookmarkDisplayTitle,
  bookmarkHasTwitterScreenshot,
  bookmarkHref,
  bookmarkPreviewImage,
  bookmarkSource,
  bookmarkSuggestedTags,
  domainFromUrl,
  normalizeTags,
  openImageUrl,
  wikipediaArticleTitleFromUrl,
} from "./helpers";
import { ImportBookmarksModal } from "./import-bookmarks-modal";
import { SuggestedTagChips } from "./suggested-tag-chips";

type BoardIconComponent = ComponentType<{
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
  icon: BoardIconComponent;
  className?: string;
  color?: string;
  size?: number | string;
  strokeWidth?: number | string;
}) => <Icon className={className} color={color} size={size} strokeWidth={strokeWidth} />;

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
  metadata: TProjectBookmark["metadata"];
};

const EMPTY_DRAFT: BookmarkDraft = {
  title: "",
  url: "",
  description: "",
  tags: "",
  metadata: {},
};

const toPayload = (draft: BookmarkDraft): TProjectBookmarkCreatePayload => ({
  title: draft.title.trim() || draft.metadata?.og_title || domainFromUrl(draft.url) || "Untitled bookmark",
  url: draft.url.trim(),
  description: draft.description.trim(),
  tags: normalizeTags(draft.tags),
  metadata: draft.metadata ?? {},
});

function BookmarkForm(props: {
  draft: BookmarkDraft;
  setDraft: (draft: BookmarkDraft) => void;
  projectOptions: { id: string; name: string }[];
  selectedProjectId: string;
  setSelectedProjectId: (projectId: string) => void;
  onSubmit: () => void | Promise<void>;
  onCancel: () => void;
  onFetchMetadata?: (url: string) => void;
  isFetchingMetadata?: boolean;
  submitLabel: string;
  showProjectSelect: boolean;
  isEditing: boolean;
  suggestedTags: string[];
  onAcceptSuggestedTag: (tag: string) => void;
  onDismissSuggestedTag: (tag: string) => void;
}) {
  const {
    draft,
    setDraft,
    projectOptions,
    selectedProjectId,
    setSelectedProjectId,
    onSubmit,
    onCancel,
    onFetchMetadata,
    isFetchingMetadata,
    submitLabel,
    showProjectSelect,
    isEditing,
    suggestedTags,
    onAcceptSuggestedTag,
    onDismissSuggestedTag,
  } = props;
  // Same dead-URL handling as BookmarkCard: a broken preview image falls back
  // to the "no preview" placeholder, and a new URL gets a fresh load attempt.
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const previewImageUrl =
    draft.metadata?.image_url && draft.metadata.image_url !== failedPreviewUrl ? draft.metadata.image_url : undefined;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      {showProjectSelect && (
        <label className="block">
          <span className="mb-1.5 block text-11 font-medium text-secondary">Project</span>
          <select
            className="focus:border-accent-primary h-10 w-full rounded-lg border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none disabled:cursor-not-allowed disabled:text-tertiary"
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
      <div className="grid gap-3 md:grid-cols-[1.2fr_1.8fr]">
        <label className="block">
          <span className="mb-1.5 block text-11 font-medium text-secondary">Title</span>
          <input
            className="focus:border-accent-primary h-10 w-full rounded-lg border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none"
            placeholder="Bookmark title"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-11 font-medium text-secondary">URL</span>
          <input
            className="focus:border-accent-primary h-10 w-full rounded-lg border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none"
            placeholder="https://..."
            value={draft.url}
            onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            onBlur={() => onFetchMetadata?.(draft.url)}
          />
        </label>
      </div>
      {(isFetchingMetadata || draft.metadata?.image_url || draft.metadata?.site_name) && (
        <div className="flex items-center gap-3 rounded-lg border border-subtle bg-layer-1/40 p-2.5">
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt=""
              className="h-12 w-20 shrink-0 rounded-md object-cover"
              onError={() => setFailedPreviewUrl(previewImageUrl)}
            />
          ) : (
            <div className="grid h-12 w-20 shrink-0 place-items-center rounded-md bg-layer-1 text-tertiary">
              <DetailIcon icon={BookmarkIcon} className="size-4" color="currentColor" strokeWidth={1.5} />
            </div>
          )}
          <div className="min-w-0 flex-1 text-12 text-secondary">
            {isFetchingMetadata ? (
              <span className="text-tertiary">Fetching preview…</span>
            ) : (
              <span className="line-clamp-2">
                {draft.metadata?.site_name || domainFromUrl(draft.url)}
                {previewImageUrl ? "" : " · no preview image found"}
              </span>
            )}
          </div>
        </div>
      )}
      <label className="block">
        <span className="mb-1.5 block text-11 font-medium text-secondary">Note</span>
        <textarea
          className="focus:border-accent-primary min-h-28 w-full resize-y rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-13 text-primary outline-none"
          placeholder="Add context"
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-11 font-medium text-secondary">Tags</span>
        <input
          className="focus:border-accent-primary h-10 w-full rounded-lg border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none"
          placeholder="Tags, separated by commas"
          value={draft.tags}
          onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
        />
        <SuggestedTagChips
          tags={suggestedTags}
          onAccept={onAcceptSuggestedTag}
          onDismiss={onDismissSuggestedTag}
          className="mt-2"
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-subtle pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-13 font-medium text-secondary hover:bg-layer-transparent-hover"
        >
          <DetailIcon icon={CancelCircleIcon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-accent-primary px-3 text-13 font-medium text-on-color hover:opacity-90"
        >
          <DetailIcon icon={PlusSignIcon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function BookmarkFormModal(props: {
  isOpen: boolean;
  title: string;
  draft: BookmarkDraft;
  setDraft: (draft: BookmarkDraft) => void;
  projectOptions: { id: string; name: string }[];
  selectedProjectId: string;
  setSelectedProjectId: (projectId: string) => void;
  onSubmit: () => void | Promise<void>;
  onCancel: () => void;
  onFetchMetadata?: (url: string) => void;
  isFetchingMetadata?: boolean;
  submitLabel: string;
  showProjectSelect: boolean;
  isEditing: boolean;
  suggestedTags: string[];
  onAcceptSuggestedTag: (tag: string) => void;
  onDismissSuggestedTag: (tag: string) => void;
}) {
  const { isOpen, title, onCancel, ...formProps } = props;

  return (
    <ModalCore isOpen={isOpen} handleClose={onCancel} width={EModalWidth.XXXL}>
      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-subtle px-5 py-4">
          <div>
            <h2 className="text-16 font-semibold text-primary">{title}</h2>
            <p className="mt-1 text-12 text-tertiary">Save a link with project, notes, and tags.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-icon-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label="Close bookmark modal"
          >
            <DetailIcon icon={CancelCircleIcon} className="size-4" color="currentColor" strokeWidth={1.5} />
          </button>
        </div>
        <div className="px-5 py-4">
          <BookmarkForm onCancel={onCancel} {...formProps} />
        </div>
      </div>
    </ModalCore>
  );
}

function BookmarkCard(props: {
  bookmark: TProjectBookmark;
  workspaceSlug: string;
  showProject: boolean;
  isSelected: boolean;
  isSelectionActive: boolean;
  onOpen: (bookmark: TProjectBookmark) => void;
  onSelect: (bookmarkId: string, isRange: boolean) => void;
  onDelete: (bookmark: TProjectBookmark) => void;
  onAcceptTag: (bookmark: TProjectBookmark, tag: string) => void;
  onDismissTag: (bookmark: TProjectBookmark, tag: string) => void;
}) {
  const {
    bookmark,
    workspaceSlug,
    showProject,
    isSelected,
    isSelectionActive,
    onOpen,
    onSelect,
    onDelete,
    onAcceptTag,
    onDismissTag,
  } = props;
  const href = bookmarkHref(workspaceSlug, bookmark);
  const isExternal = !!bookmark.url;
  const imageUrl = bookmarkPreviewImage(bookmark);
  const hasTwitterScreenshot = bookmarkHasTwitterScreenshot(bookmark, imageUrl);
  const displayTitle = bookmarkDisplayTitle(bookmark);
  const storedWidth = Number(bookmark.metadata?.image_width);
  const storedHeight = Number(bookmark.metadata?.image_height);
  const storedRatio =
    Number.isFinite(storedWidth) && Number.isFinite(storedHeight) && storedWidth > 0 && storedHeight > 0
      ? `${storedWidth} / ${storedHeight}`
      : undefined;
  // Reserve space from known dimensions (no reflow); otherwise hold a neutral
  // ratio until the image loads, then lock to its measured ratio.
  const [measuredRatio, setMeasuredRatio] = useState<string | undefined>(undefined);
  const imageRatio = storedRatio ?? measuredRatio ?? "4 / 5";
  // Broken/dead preview URLs fall back to the no-image text layout instead of
  // showing the browser's broken-image glyph. Track the URL that failed (not a
  // boolean) so an in-place edit that swaps in a new image_url retries cleanly.
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed = !!imageUrl && failedImageUrl === imageUrl;
  // The open-link button is the only way to follow the URL; clicking the rest of
  // the card opens the detail modal. Clicks inside this cluster never bubble up.
  const openLinkClasses =
    "shadow-sm grid size-6 place-items-center rounded-lg bg-layer-1 text-tertiary hover:bg-layer-2 hover:text-primary";
  return (
    <div
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- a native <button> can't contain the nested link/menu controls this card holds
      role="button"
      tabIndex={0}
      onClick={(event) => {
        // ⌘/Ctrl+click toggles; shift+click selects a range; once a selection is
        // active, a plain click keeps toggling instead of opening the detail modal.
        if (event.metaKey || event.ctrlKey || event.shiftKey || isSelectionActive) {
          onSelect(bookmark.id, event.shiftKey);
          return;
        }
        onOpen(bookmark);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (isSelectionActive) onSelect(bookmark.id, false);
          else onOpen(bookmark);
        }
      }}
      className={cn(
        "group focus-visible:ring-accent-primary/40 relative cursor-pointer overflow-hidden rounded-2xl border border-subtle bg-surface-1 text-left transition-colors hover:border-strong focus:outline-none focus-visible:ring-2",
        { "ring-accent-primary border-accent-primary ring-2": isSelected }
      )}
    >
      <button
        type="button"
        aria-label={isSelected ? "Deselect bookmark" : "Select bookmark"}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect(bookmark.id, event.shiftKey);
        }}
        className={cn(
          "shadow-sm absolute top-2 left-2 z-30 grid size-6 place-items-center rounded-lg bg-layer-1/95 backdrop-blur-sm transition-opacity",
          {
            "opacity-100": isSelected || isSelectionActive,
            "pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100":
              !isSelected && !isSelectionActive,
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
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- swallows bubbling so card-open doesn't fire when using these controls; the controls themselves stay keyboard-reachable */}
      <div
        className="absolute top-2 right-2 z-20 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        onClick={(event) => event.stopPropagation()}
      >
        {href &&
          (isExternal ? (
            <a href={href} target="_blank" rel="noreferrer" className={openLinkClasses} aria-label="Open link">
              <DetailIcon icon={LinkSquare01Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
            </a>
          ) : (
            <Link href={href} className={openLinkClasses} aria-label="Open link">
              <DetailIcon icon={LinkSquare01Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
            </Link>
          ))}
        <CustomMenu
          placement="bottom-end"
          closeOnSelect
          useCaptureForOutsideClick
          customButton={
            <span className="shadow-sm grid size-6 place-items-center rounded-lg bg-layer-1 text-tertiary hover:bg-layer-2 hover:text-primary">
              <DetailIcon icon={MoreHorizontal} className="size-4" color="currentColor" strokeWidth={1.5} />
            </span>
          }
        >
          <CustomMenu.MenuItem
            onClick={() => {
              void navigator.clipboard?.writeText(href);
            }}
          >
            <span className="flex items-center gap-2">
              <DetailIcon icon={Copy01Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
              Copy link
            </span>
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem
            onClick={() => {
              onDelete(bookmark);
            }}
            className="text-red-500 hover:!bg-red-500/10 hover:!text-red-500"
          >
            <span className="flex items-center gap-2">
              <DetailIcon icon={Delete02Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
              Delete bookmark
            </span>
          </CustomMenu.MenuItem>
        </CustomMenu>
      </div>
      {imageUrl && !imageFailed ? (
        <>
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="block h-auto w-full bg-layer-1/40"
            style={{ aspectRatio: imageRatio }}
            onError={() => setFailedImageUrl(imageUrl)}
            onLoad={
              storedRatio
                ? undefined
                : (event) => {
                    const img = event.currentTarget;
                    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                      setMeasuredRatio(`${img.naturalWidth} / ${img.naturalHeight}`);
                    }
                  }
            }
          />
          {hasTwitterScreenshot && (
            <button
              type="button"
              className="shadow-sm absolute top-2 left-10 z-20 grid size-7 place-items-center rounded-lg border border-white/40 bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-black/70 focus:opacity-100 focus:outline-none"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void openImageUrl(imageUrl);
              }}
              aria-label="Open Twitter screenshot"
            >
              <DetailIcon icon={LinkSquare01Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
            </button>
          )}
          <div
            className="absolute inset-x-0 bottom-0 z-10 px-4 pt-14 pb-3 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100"
            style={{
              // Sigmoid-eased scrim: the long, finely-stepped tail lets the dark
              // fade to fully transparent without a visible banding edge.
              backgroundImage:
                "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.69) 8.1%, rgba(0,0,0,0.665) 15.5%, rgba(0,0,0,0.627) 22.5%, rgba(0,0,0,0.578) 29%, rgba(0,0,0,0.519) 35.3%, rgba(0,0,0,0.454) 41.2%, rgba(0,0,0,0.385) 47.1%, rgba(0,0,0,0.315) 52.9%, rgba(0,0,0,0.246) 58.8%, rgba(0,0,0,0.181) 64.7%, rgba(0,0,0,0.123) 71%, rgba(0,0,0,0.073) 77.5%, rgba(0,0,0,0.034) 84.5%, rgba(0,0,0,0.009) 91.9%, rgba(0,0,0,0) 100%)",
            }}
          >
            {displayTitle && (
              <h3 className="line-clamp-2 text-14 leading-snug font-medium text-white">{displayTitle}</h3>
            )}
            <div className="mt-1 flex items-center justify-between gap-2 text-11 text-white/70">
              <span className="min-w-0 truncate">
                {showProject && bookmark.project_name ? bookmark.project_name : bookmarkSource(bookmark)}
              </span>
              {bookmark.updated_at && <span className="shrink-0">{renderFormattedDate(bookmark.updated_at)}</span>}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-layer-1 text-tertiary">
              <DetailIcon icon={BookmarkIcon} className="size-4" color="currentColor" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1 pr-8">
              <h3 className="line-clamp-2 text-14 leading-snug font-medium text-primary">
                {displayTitle || bookmarkSource(bookmark)}
              </h3>
            </div>
          </div>
          {bookmark.description && (
            <p className="line-clamp-4 text-12 leading-relaxed text-secondary">{bookmark.description}</p>
          )}
          <div className="flex items-center justify-between gap-2 pt-1 text-11 text-tertiary">
            <div className="min-w-0 truncate">
              {showProject && bookmark.project_name ? bookmark.project_name : (bookmark.tags[0] ?? "")}
            </div>
            {bookmark.updated_at && <span className="shrink-0">{renderFormattedDate(bookmark.updated_at)}</span>}
          </div>
        </div>
      )}
      <SuggestedTagChips
        tags={bookmarkSuggestedTags(bookmark)}
        onAccept={(tag) => onAcceptTag(bookmark, tag)}
        onDismiss={(tag) => onDismissTag(bookmark, tag)}
        className="px-4 pt-2 pb-3"
        stopPropagation
      />
    </div>
  );
}

function BookmarkListItem(props: {
  bookmark: TProjectBookmark;
  workspaceSlug: string;
  showProject: boolean;
  isSelected: boolean;
  isSelectionActive: boolean;
  onOpen: (bookmark: TProjectBookmark) => void;
  onSelect: (bookmarkId: string, isRange: boolean) => void;
  onDelete: (bookmark: TProjectBookmark) => void;
  onAcceptTag: (bookmark: TProjectBookmark, tag: string) => void;
  onDismissTag: (bookmark: TProjectBookmark, tag: string) => void;
}) {
  const {
    bookmark,
    workspaceSlug,
    showProject,
    isSelected,
    isSelectionActive,
    onOpen,
    onSelect,
    onDelete,
    onAcceptTag,
    onDismissTag,
  } = props;
  const parentRef = useRef<HTMLDivElement>(null);
  const { isMobile } = usePlatformOS();
  const href = bookmarkHref(workspaceSlug, bookmark);
  const isExternal = !!bookmark.url;

  return (
    <ListItem
      title={bookmarkDisplayTitle(bookmark) || bookmarkSource(bookmark)}
      itemLink="#"
      disableLink
      className={cn({ "bg-accent-primary/5 hover:bg-accent-primary/10": isSelected })}
      onItemClick={(event) => {
        event.preventDefault();
        // ⌘/Ctrl+click toggles; shift+click selects a range; once a selection is
        // active, a plain click keeps toggling instead of opening.
        if (event.metaKey || event.ctrlKey || event.shiftKey || isSelectionActive) {
          onSelect(bookmark.id, event.shiftKey);
        } else {
          onOpen(bookmark);
        }
      }}
      isMobile={isMobile}
      parentRef={parentRef}
      prependTitleElement={
        <span className="flex items-center gap-2">
          <Checkbox
            aria-label={isSelected ? "Deselect bookmark" : "Select bookmark"}
            checked={isSelected}
            className="size-3.5 !outline-none"
            containerClassName={cn("transition-opacity", {
              "pointer-events-auto opacity-100": isSelected || isSelectionActive,
              "pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100":
                !isSelected && !isSelectionActive,
            })}
            iconClassName="size-3"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect(bookmark.id, event.shiftKey);
            }}
            readOnly
          />
          <DetailIcon icon={BookmarkIcon} className="size-4 text-tertiary" color="currentColor" strokeWidth={1.5} />
        </span>
      }
      actionableItems={
        <div className="flex items-center gap-3 text-13 text-tertiary">
          <SuggestedTagChips
            tags={bookmarkSuggestedTags(bookmark)}
            onAccept={(tag) => onAcceptTag(bookmark, tag)}
            onDismiss={(tag) => onDismissTag(bookmark, tag)}
            stopPropagation
          />
          <div className="flex items-center gap-1.5">
            {showProject && bookmark.project_name && (
              <span className="rounded-lg bg-layer-1 px-1.5 py-0.5 text-11 text-secondary">
                {bookmark.project_name}
              </span>
            )}
            {bookmark.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-lg bg-layer-1 px-1.5 py-0.5 text-11 text-tertiary">
                {tag}
              </span>
            ))}
            {bookmark.tags.length > 3 && <span className="text-11">+{bookmark.tags.length - 3}</span>}
          </div>
          {bookmark.updated_at && <span className="text-11">{renderFormattedDate(bookmark.updated_at)}</span>}
          {href &&
            (isExternal ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="grid size-7 place-items-center rounded-lg text-icon-tertiary hover:bg-layer-transparent-hover hover:text-primary"
                aria-label="Open link"
              >
                <DetailIcon icon={LinkSquare01Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
              </a>
            ) : (
              <Link
                href={href}
                className="grid size-7 place-items-center rounded-lg text-icon-tertiary hover:bg-layer-transparent-hover hover:text-primary"
                aria-label="Open link"
              >
                <DetailIcon icon={LinkSquare01Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
              </Link>
            ))}
          <button
            type="button"
            className="grid size-7 place-items-center rounded-lg text-icon-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            onClick={() => void navigator.clipboard?.writeText(href)}
            aria-label="Copy bookmark link"
          >
            <DetailIcon icon={Copy01Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="hover:bg-red-500/10 hover:text-red-500 grid size-7 place-items-center rounded-lg text-icon-tertiary"
            onClick={() => onDelete(bookmark)}
            aria-label="Delete bookmark"
          >
            <DetailIcon icon={Delete02Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          </button>
        </div>
      }
    />
  );
}

type BookmarkProjectFilterSectionProps = {
  selectedProjectIds: string[];
  onToggleProject: (projectId: string) => void;
  onClearProjects: () => void;
};

const BookmarkProjectFilterSection = observer(function BookmarkProjectFilterSection({
  selectedProjectIds,
  onToggleProject,
  onClearProjects,
}: BookmarkProjectFilterSectionProps) {
  const { joinedProjectIds, getProjectById } = useProject();
  const [projectSearch, setProjectSearch] = useState("");
  const [projectsPreviewEnabled, setProjectsPreviewEnabled] = useState(true);

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
      <div className="p-2">
        <input
          value={projectSearch}
          onChange={(event) => setProjectSearch(event.target.value)}
          placeholder="Search projects"
          className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1 text-11 text-primary outline-none placeholder:text-placeholder"
        />
      </div>
      <div className="px-2 pt-2 pb-2">
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
    </div>
  );
});

type BookmarkTagFilterSectionProps = {
  tags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
};

function BookmarkTagFilterSection({ tags, selectedTags, onToggleTag, onClearTags }: BookmarkTagFilterSectionProps) {
  const [tagsPreviewEnabled, setTagsPreviewEnabled] = useState(true);

  return (
    <div className="flex max-h-[24rem] flex-col overflow-y-auto">
      <div className="px-2 pt-2 pb-2">
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
      <ChevronDownIcon className={cn("size-3", { "text-accent-primary": isActive })} strokeWidth={2} />
    </span>
  );
}

function BookmarkBulkActionBar(props: { count: number; isBusy: boolean; onClear: () => void; onDelete: () => void }) {
  const { count, isBusy, onClear, onDelete } = props;
  // Rise into place on mount instead of popping in the moment a selection is made.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      role="toolbar"
      aria-label={`${count} bookmarks selected`}
      className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
    >
      <div
        className="t-panel-slide shadow-lg pointer-events-auto flex max-w-full items-center gap-2 rounded-xl border border-strong bg-surface-1 px-3 py-2"
        data-open={mounted ? "true" : "false"}
      >
        <span className="shrink-0 px-1 text-11 font-medium">
          <span className="text-primary">{count}</span>{" "}
          <span className="text-tertiary">{count === 1 ? "bookmark" : "bookmarks"} selected</span>
        </span>
        <div className="bg-strong h-4 w-px" aria-hidden />
        <Button variant="ghost" size="lg" onClick={onClear} disabled={isBusy} aria-label="Clear selection">
          <DetailIcon icon={CancelCircleIcon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          <span>Clear</span>
        </Button>
        <Button variant="error-outline" size="lg" onClick={onDelete} disabled={isBusy} aria-label="Delete">
          <DetailIcon icon={Delete02Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          <span>{isBusy ? "Deleting..." : "Delete"}</span>
        </Button>
      </div>
    </div>
  );
}

export const BookmarkBoard = observer(function BookmarkBoard(props: Props) {
  const { workspaceSlug, projectId, mode } = props;
  const bookmarkStore = useBookmark();
  const { joinedProjectIds, getPartialProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  const [query, setQuery] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [draft, setDraft] = useState<BookmarkDraft>(EMPTY_DRAFT);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const lastFetchedUrlRef = useRef("");
  // Scroll container ref for the list-view virtualizer.
  const listScrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Pending AI suggestions for the bookmark currently open in the edit modal.
  const [editingSuggestions, setEditingSuggestions] = useState<string[]>([]);
  // Bookmark opened in the detail modal (view, inline edit, tags, comments).
  const [detailId, setDetailId] = useState<string | null>(null);
  // Multi-selection: chosen bookmark ids + the anchor for shift-click range select.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "");
  const { storedValue: storedViewMode, setValue: setViewMode } = useLocalStorage<ViewMode>(
    `bookmarks_view_mode_${mode}`,
    "grid"
  );
  const viewMode: ViewMode = storedViewMode ?? "grid";
  // The open rail eats horizontal space, so drop the masonry one column at the
  // top breakpoints while it's expanded.
  const { preferences: railPreferences } = useAppRailPreferences();
  const isRailExpanded = railPreferences.displayMode === "icon_with_label";
  const bookmarkColumnsClass = cn(
    "columns-1 gap-4 sm:columns-2 lg:columns-3",
    isRailExpanded ? "xl:columns-3 2xl:columns-4" : "xl:columns-4 2xl:columns-5"
  );

  // Track the initial fetch so the UI can show a loader instead of flashing
  // the "No bookmarks yet" empty state while the request is still in flight.
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const request =
      mode === "project" && projectId
        ? bookmarkStore.fetchProjectBookmarks(workspaceSlug, projectId)
        : mode === "workspace"
          ? bookmarkStore.fetchWorkspaceBookmarks(workspaceSlug)
          : Promise.resolve([]);
    request
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookmarkStore, mode, projectId, workspaceSlug]);

  const bookmarks =
    mode === "project" && projectId
      ? bookmarkStore.projectBookmarks(projectId)
      : bookmarkStore.workspaceBookmarks(workspaceSlug);
  const tags = useMemo(() => sortBy([...new Set(bookmarks.flatMap((bookmark) => bookmark.tags))]), [bookmarks]);
  const pillBase = "rounded-full px-2.5 py-0.5 text-12 font-medium transition-colors";
  const pillActive = "bg-accent-subtle text-accent-primary";
  const pillInactive = "bg-layer-1 text-tertiary hover:text-secondary";
  const projectFilterPillLabel = useMemo(() => {
    if (selectedProjectIds.length === 0) return "Project";
    if (selectedProjectIds.length > 1) return `${selectedProjectIds.length} projects`;
    return getPartialProjectById(selectedProjectIds[0])?.name ?? "Project";
  }, [getPartialProjectById, selectedProjectIds]);
  const tagFilterPillLabel = useMemo(() => {
    if (selectedTags.length === 0) return "Tag";
    if (selectedTags.length > 1) return `${selectedTags.length} tags`;
    return selectedTags[0];
  }, [selectedTags]);
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

  // Virtualizer for the list view — mounts only visible rows. The grid view
  // uses CSS masonry columns which are incompatible with row-based
  // virtualization, so virtualization is scoped to list view only.
  const listVirtualizer = useVirtualizer({
    count: filteredBookmarks.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });

  // Selection derives from the live list, so ids of deleted/filtered-out bookmarks
  // are simply ignored — no separate pruning pass needed.
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedBookmarks = bookmarks.filter((bookmark) => selectedIdSet.has(bookmark.id));
  const isSelectionActive = selectedBookmarks.length > 0;

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
    setAnchorId(id);
  };
  // Shift-click selects every bookmark between the anchor and the target (inclusive),
  // in the order they're rendered, unioned into the current selection.
  const selectRange = (targetId: string) => {
    const order = filteredBookmarks.map((bookmark) => bookmark.id);
    const targetIdx = order.indexOf(targetId);
    if (targetIdx === -1) return;
    const anchorIdx = anchorId ? order.indexOf(anchorId) : -1;
    if (anchorIdx === -1) {
      setSelectedIds((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));
      setAnchorId(targetId);
      return;
    }
    const [start, end] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
    const rangeIds = order.slice(start, end + 1);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
  };
  const handleSelect = (id: string, isRange: boolean) => {
    if (isRange) selectRange(id);
    else toggleSelection(id);
  };
  const clearSelection = () => {
    setSelectedIds([]);
    setAnchorId(null);
  };

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
    if (!isFormModalOpen || editingId) return;
    if (selectedProjectId && writableProjectIds.includes(selectedProjectId)) return;
    setSelectedProjectId(
      projectId && writableProjectIds.includes(projectId) ? projectId : (writableProjectIds[0] ?? "")
    );
  }, [editingId, isFormModalOpen, projectId, selectedProjectId, writableProjectIds]);

  const fetchMetadata = async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url || url === lastFetchedUrlRef.current) return;
    lastFetchedUrlRef.current = url;
    setIsFetchingMetadata(true);
    try {
      // Wikipedia articles get a rich preview straight from the summary API
      // (clean title, extract, thumbnail) plus an automatic "wiki" tag.
      const wikiTitle = wikipediaArticleTitleFromUrl(url);
      if (wikiTitle) {
        const summary = await fetchWikipediaSummary(wikiTitle);
        if (summary) {
          setDraft((prev) => ({
            ...prev,
            title: prev.title.trim() ? prev.title : summary.title,
            description: prev.description.trim() ? prev.description : summary.extract.slice(0, 500),
            tags: prev.tags.trim()
              ? prev.tags
                  .split(",")
                  .map((t) => t.trim())
                  .includes("wiki")
                ? prev.tags
                : `${prev.tags}, wiki`
              : "wiki",
            metadata: {
              ...prev.metadata,
              site_name: "Wikipedia",
              ...(summary.thumbnail ? { image_url: summary.thumbnail } : {}),
            },
          }));
          return;
        }
      }
      const data = await bookmarkStore.fetchUrlMetadata(workspaceSlug, url);
      setDraft((prev) => ({
        ...prev,
        title: prev.title.trim() ? prev.title : (data.title ?? ""),
        description: prev.description.trim() ? prev.description : (data.description ?? ""),
        metadata: data.metadata ?? {},
      }));
    } catch {
      // best-effort preview; ignore failures so manual entry still works
    } finally {
      setIsFetchingMetadata(false);
    }
  };

  // AI tag suggestions land asynchronously, so re-fetch the bookmark a couple of
  // times after creation to surface them without making the user reload the page.
  const scheduleSuggestionRefetch = (targetProjectId: string, bookmarkId: string) => {
    [3000, 8000].forEach((delay) => {
      window.setTimeout(() => {
        void bookmarkStore.fetchBookmark(workspaceSlug, targetProjectId, bookmarkId).catch(() => {});
      }, delay);
    });
  };

  const handleSubmit = async () => {
    const targetProjectId = editingId
      ? (bookmarkStore.bookmarkMap[editingId]?.project_id ?? selectedProjectId)
      : mode === "project"
        ? projectId
        : selectedProjectId;
    if (!targetProjectId) return;
    try {
      if (editingId) {
        // toPayload already carries draft.metadata (incl. any re-fetched preview);
        // just persist whatever suggestions remain after accept/dismiss in the modal.
        await bookmarkStore.updateBookmark(workspaceSlug, targetProjectId, editingId, {
          ...toPayload(draft),
          metadata: { ...draft.metadata, suggested_tags: editingSuggestions },
        });
      } else {
        const created = await bookmarkStore.createBookmark(workspaceSlug, targetProjectId, toPayload(draft));
        if (created.url) scheduleSuggestionRefetch(created.project_id, created.id);
      }
      setDraft(EMPTY_DRAFT);
      setEditingId(null);
      setEditingSuggestions([]);
      setIsFormModalOpen(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Bookmark could not be saved" });
    }
  };

  // Modal accept/dismiss work against local state; nothing persists until the
  // user saves the form (then handleSubmit writes both tags and suggestions).
  const handleDraftAcceptTag = (tag: string) => {
    const current = normalizeTags(draft.tags);
    if (!current.includes(tag)) setDraft({ ...draft, tags: [...current, tag].join(", ") });
    setEditingSuggestions((prev) => prev.filter((value) => value !== tag));
  };

  const handleDraftDismissTag = (tag: string) => {
    setEditingSuggestions((prev) => prev.filter((value) => value !== tag));
  };

  const handleAcceptTag = async (bookmark: TProjectBookmark, tag: string) => {
    const remaining = bookmarkSuggestedTags(bookmark).filter((value) => value !== tag);
    const nextTags = bookmark.tags.includes(tag) ? bookmark.tags : [...bookmark.tags, tag];
    try {
      await bookmarkStore.updateBookmark(workspaceSlug, bookmark.project_id, bookmark.id, {
        tags: nextTags,
        metadata: { ...bookmark.metadata, suggested_tags: remaining },
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Tag could not be saved" });
    }
  };

  const handleDismissTag = async (bookmark: TProjectBookmark, tag: string) => {
    const remaining = bookmarkSuggestedTags(bookmark).filter((value) => value !== tag);
    try {
      await bookmarkStore.updateBookmark(workspaceSlug, bookmark.project_id, bookmark.id, {
        metadata: { ...bookmark.metadata, suggested_tags: remaining },
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Suggestion could not be dismissed" });
    }
  };

  // Clicking a card/row opens the detail modal — view, inline edit, tags, comments.
  const openDetail = (bookmark: TProjectBookmark) => setDetailId(bookmark.id);

  const handleDelete = async (bookmark: TProjectBookmark) => {
    try {
      await bookmarkStore.deleteBookmark(workspaceSlug, bookmark.project_id, bookmark.id);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Bookmark could not be deleted" });
    }
  };

  // Only bookmarks in projects the user can edit are deletable; the rest are skipped.
  const deletableSelected = selectedBookmarks.filter((bookmark) => writableProjectIds.includes(bookmark.project_id));

  const handleBulkDeleteClick = () => {
    if (deletableSelected.length === 0) {
      setToast({
        type: TOAST_TYPE.WARNING,
        title: "Nothing to delete",
        message: "You can only delete bookmarks in projects you can edit.",
      });
      return;
    }
    setBulkDeleteOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (deletableSelected.length === 0) return;
    setIsBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        deletableSelected.map((bookmark) =>
          bookmarkStore.deleteBookmark(workspaceSlug, bookmark.project_id, bookmark.id)
        )
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      const total = deletableSelected.length;
      const noun = total === 1 ? "bookmark" : "bookmarks";
      setToast(
        failed === 0
          ? { type: TOAST_TYPE.SUCCESS, title: "Deleted", message: `${total} ${noun} deleted.` }
          : { type: TOAST_TYPE.ERROR, title: "Error", message: `Couldn't delete ${failed} of ${total} ${noun}.` }
      );
      clearSelection();
    } finally {
      setIsBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    lastFetchedUrlRef.current = "";
    setEditingSuggestions([]);
    setSelectedProjectId(
      projectId && writableProjectIds.includes(projectId) ? projectId : (writableProjectIds[0] ?? "")
    );
    setIsFormModalOpen(true);
  };

  const handleImport = (targetProjectId: string, payloads: TProjectBookmarkCreatePayload[]) =>
    bookmarkStore.importBookmarks(workspaceSlug, targetProjectId, payloads);

  const canCreateBookmark = writableProjectIds.length > 0;
  const importDefaultProjectId =
    projectId && writableProjectIds.includes(projectId) ? projectId : (writableProjectIds[0] ?? "");

  const detailBookmark = detailId ? bookmarkStore.bookmarkMap[detailId] : undefined;
  const canEditDetail = detailBookmark ? writableProjectIds.includes(detailBookmark.project_id) : false;

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
                  isLast
                />
              }
              isLast
            />
          </Breadcrumbs>
          <span className="text-13 text-tertiary">{bookmarks.length}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {mode === "workspace" && (
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
                <BookmarkProjectFilterSection
                  selectedProjectIds={selectedProjectIds}
                  onToggleProject={toggleProjectFilter}
                  onClearProjects={() => setSelectedProjectIds([])}
                />
              </FiltersDropdown>
            )}
            <FiltersDropdown
              placement="bottom-start"
              menuButton={
                <FilterSummaryPill
                  label={tagFilterPillLabel}
                  isActive={selectedTags.length > 0}
                  className={cn(pillBase, selectedTags.length > 0 ? pillActive : pillInactive)}
                />
              }
              isFiltersApplied={selectedTags.length > 0}
            >
              <BookmarkTagFilterSection
                tags={tags}
                selectedTags={selectedTags}
                onToggleTag={toggleTagFilter}
                onClearTags={() => setSelectedTags([])}
              />
            </FiltersDropdown>
          </div>
        </div>
      </Header.LeftItem>
      <Header.RightItem className="items-center">
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        <PageSearchInput searchQuery={query} updateSearchQuery={setQuery} placeholder="Search bookmarks" />
        {canCreateBookmark && (
          <>
            <Button
              variant="secondary"
              size="lg"
              prependIcon={
                <DetailIcon icon={Upload03Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
              }
              onClick={() => setIsImportModalOpen(true)}
            >
              Import
            </Button>
            <Button variant="primary" size="lg" onClick={openCreateModal}>
              New bookmark
            </Button>
          </>
        )}
      </Header.RightItem>
    </Header>
  );

  return (
    <>
      <AppHeader header={header} showContentEdgeFade />
      {canCreateBookmark && (
        <BookmarkFormModal
          isOpen={isFormModalOpen}
          title={editingId ? "Edit bookmark" : "New bookmark"}
          draft={draft}
          setDraft={setDraft}
          projectOptions={writableProjects}
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
          onSubmit={handleSubmit}
          onFetchMetadata={fetchMetadata}
          isFetchingMetadata={isFetchingMetadata}
          onCancel={() => {
            setIsFormModalOpen(false);
            setEditingId(null);
            setDraft(EMPTY_DRAFT);
            setEditingSuggestions([]);
          }}
          submitLabel={editingId ? "Save" : "Add bookmark"}
          showProjectSelect={mode === "workspace"}
          isEditing={!!editingId}
          suggestedTags={editingSuggestions}
          onAcceptSuggestedTag={handleDraftAcceptTag}
          onDismissSuggestedTag={handleDraftDismissTag}
        />
      )}
      {canCreateBookmark && (
        <ImportBookmarksModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          projectOptions={writableProjects}
          defaultProjectId={importDefaultProjectId}
          showProjectSelect={mode === "workspace"}
          onImport={handleImport}
        />
      )}
      <BookmarkDetailModal
        isOpen={!!detailId}
        bookmarkId={detailId}
        workspaceSlug={workspaceSlug}
        showProject={mode === "workspace"}
        canEdit={canEditDetail}
        onClose={() => setDetailId(null)}
        onDelete={handleDelete}
      />
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        {filteredBookmarks.length === 0 ? (
          isLoading ? (
            viewMode === "grid" ? (
              <div className="vertical-scrollbar scrollbar-lg h-full w-full overflow-y-auto p-5">
                <div className={bookmarkColumnsClass}>
                  {["180", "260", "320", "210", "290", "240", "181", "261", "321", "211", "291", "241"].map(
                    (height) => (
                      <div key={height} className="mb-4 break-inside-avoid">
                        <Loader className="block overflow-hidden rounded-2xl border border-subtle bg-surface-1">
                          <Loader.Item width="100%" height={`${height}px`} />
                        </Loader>
                      </div>
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className="vertical-scrollbar scrollbar-lg h-full w-full overflow-y-auto">
                {Array.from({ length: 10 }, (_, index) => `bookmark-row-skeleton-${index}`).map((key) => (
                  <Loader key={key} className="flex items-center gap-3 border-b border-subtle px-4 py-3">
                    <Loader.Item height="28px" width="28px" />
                    <div className="flex-1 space-y-1.5">
                      <Loader.Item height="13px" width="35%" />
                      <Loader.Item height="11px" width="55%" />
                    </div>
                    <Loader.Item height="10px" width="64px" />
                  </Loader>
                ))}
              </div>
            )
          ) : (
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
                        onClick: openCreateModal,
                      },
                      {
                        label: "Import CSV",
                        variant: "secondary",
                        onClick: () => setIsImportModalOpen(true),
                      },
                    ]
                  : undefined
              }
            />
          )
        ) : viewMode === "grid" ? (
          <div className="vertical-scrollbar scrollbar-lg h-full w-full overflow-y-auto p-5">
            <div className={bookmarkColumnsClass}>
              {filteredBookmarks.map((bookmark) => (
                <div key={bookmark.id} className="mb-4 break-inside-avoid">
                  <BookmarkCard
                    bookmark={bookmark}
                    workspaceSlug={workspaceSlug}
                    showProject={mode === "workspace"}
                    isSelected={selectedIdSet.has(bookmark.id)}
                    isSelectionActive={isSelectionActive}
                    onOpen={openDetail}
                    onSelect={handleSelect}
                    onDelete={handleDelete}
                    onAcceptTag={handleAcceptTag}
                    onDismissTag={handleDismissTag}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          // List view: virtualized so only visible rows mount.
          // We inline the ListLayout scroll styles here to gain a ref on
          // the container (ListLayout does not forward refs).
          <div
            ref={listScrollRef}
            className="vertical-scrollbar flex scrollbar-lg h-full w-full flex-col overflow-y-auto"
          >
            <div style={{ height: listVirtualizer.getTotalSize(), position: "relative" }}>
              {listVirtualizer.getVirtualItems().map((virtualRow) => {
                const bookmark = filteredBookmarks[virtualRow.index]!;
                return (
                  <div
                    key={bookmark.id}
                    data-index={virtualRow.index}
                    ref={listVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <BookmarkListItem
                      bookmark={bookmark}
                      workspaceSlug={workspaceSlug}
                      showProject={mode === "workspace"}
                      isSelected={selectedIdSet.has(bookmark.id)}
                      isSelectionActive={isSelectionActive}
                      onOpen={openDetail}
                      onSelect={handleSelect}
                      onDelete={handleDelete}
                      onAcceptTag={handleAcceptTag}
                      onDismissTag={handleDismissTag}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {isSelectionActive && (
          <BookmarkBulkActionBar
            count={selectedBookmarks.length}
            isBusy={isBulkDeleting}
            onClear={clearSelection}
            onDelete={handleBulkDeleteClick}
          />
        )}
      </div>
      <AlertModalCore
        isOpen={bulkDeleteOpen}
        handleClose={() => {
          if (isBulkDeleting) return;
          setBulkDeleteOpen(false);
        }}
        handleSubmit={() => void confirmBulkDelete()}
        isSubmitting={isBulkDeleting}
        title={`Delete ${deletableSelected.length} ${deletableSelected.length === 1 ? "bookmark" : "bookmarks"}`}
        content={`Delete ${deletableSelected.length} selected ${
          deletableSelected.length === 1 ? "bookmark" : "bookmarks"
        }? This can't be undone.${
          selectedBookmarks.length > deletableSelected.length ? " Bookmarks you can't edit will be skipped." : ""
        }`}
      />
    </>
  );
});

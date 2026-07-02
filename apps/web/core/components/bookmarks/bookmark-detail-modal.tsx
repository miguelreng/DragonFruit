/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Bookmark as BookmarkIcon,
  CancelCircle as CancelCircleIcon,
  Copy as Copy01Icon,
  Edit as PencilEdit02Icon,
  ExternalLink as LinkSquare01Icon,
  Folder as FolderIcon,
  MoreHorizontal,
  Trash as Delete02Icon,
} from "@/components/icons/lucide-shim";
import { observer } from "mobx-react";
import Link from "next/link";
import { Avatar } from "@plane/propel/avatar";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TBookmarkCommentActor, TProjectBookmark, TProjectBookmarkComment } from "@plane/types";
import { CustomMenu, EModalWidth, ModalCore } from "@plane/ui";
import { calculateTimeAgo, renderFormattedDate } from "@plane/utils";
import { useBookmark } from "@/hooks/store/use-bookmark";
import { useUser } from "@/hooks/store/user";
import {
  bookmarkDisplayTitle,
  bookmarkHref,
  bookmarkPreviewImage,
  bookmarkSource,
  bookmarkSuggestedTags,
  normalizeTags,
} from "./helpers";
import { SuggestedTagChips } from "./suggested-tag-chips";

type DetailIconComponent = ComponentType<{
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
  icon: DetailIconComponent;
  className?: string;
  color?: string;
  size?: number | string;
  strokeWidth?: number | string;
}) => <Icon className={className} color={color} size={size} strokeWidth={strokeWidth} />;

const actorName = (actor?: TBookmarkCommentActor) => {
  if (!actor) return "Removed member";
  const full = `${actor.first_name ?? ""} ${actor.last_name ?? ""}`.trim();
  return actor.display_name || full || "Member";
};

const CommentRow = observer(function CommentRow(props: {
  comment: TProjectBookmarkComment;
  canEdit: boolean;
  onEdit: (commentId: string, comment: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}) {
  const { comment, canEdit, onEdit, onDelete } = props;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.comment);

  const name = actorName(comment.actor_detail);

  const submitEdit = async () => {
    const value = draft.trim();
    if (!value || value === comment.comment) {
      setIsEditing(false);
      setDraft(comment.comment);
      return;
    }
    await onEdit(comment.id, value);
    setIsEditing(false);
  };

  return (
    <div className="group/comment flex gap-2.5">
      <Avatar name={name} src={comment.actor_detail?.avatar_url} size="base" shape="circle" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-13 font-medium text-primary">{name}</span>
          <span className="text-11 text-tertiary">{calculateTimeAgo(comment.created_at)}</span>
          {comment.edited_at && <span className="text-11 text-tertiary">edited</span>}
        </div>
        {isEditing ? (
          <div className="mt-1">
            <textarea
              // eslint-disable-next-line jsx-a11y/no-autofocus -- focus follows the user's explicit "edit" action
              autoFocus
              className="min-h-9 w-full resize-none rounded-md bg-layer-1 px-2 py-1.5 text-13 text-primary outline-none"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="mt-1.5 flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => void submitEdit()}>
                Save
              </Button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setDraft(comment.comment);
                }}
                className="text-13 font-medium text-secondary hover:text-primary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-13 leading-relaxed whitespace-pre-wrap text-secondary">{comment.comment}</p>
        )}
      </div>
      {canEdit && !isEditing && (
        <div className="flex shrink-0 items-start gap-1 opacity-0 transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            aria-label="Edit comment"
            onClick={() => {
              setDraft(comment.comment);
              setIsEditing(true);
            }}
            className="grid size-6 place-items-center rounded-md text-icon-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
          >
            <DetailIcon icon={PencilEdit02Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label="Delete comment"
            onClick={() => void onDelete(comment.id)}
            className="hover:bg-red-500/10 hover:text-red-500 grid size-6 place-items-center rounded-md text-icon-tertiary transition-colors"
          >
            <DetailIcon icon={Delete02Icon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
});

type Props = {
  workspaceSlug: string;
  bookmarkId: string | null;
  isOpen: boolean;
  showProject: boolean;
  canEdit: boolean;
  moveTargets: { id: string; name: string }[];
  onClose: () => void;
  onDelete: (bookmark: TProjectBookmark) => void;
  onMove: (bookmark: TProjectBookmark, targetProjectId: string) => void;
};

export const BookmarkDetailModal = observer(function BookmarkDetailModal(props: Props) {
  const { workspaceSlug, bookmarkId, isOpen, showProject, canEdit, moveTargets, onClose, onDelete, onMove } = props;
  const bookmarkStore = useBookmark();
  const { data: currentUser } = useUser();
  const bookmark = bookmarkId ? bookmarkStore.bookmarkMap[bookmarkId] : undefined;

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [newComment, setNewComment] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const syncedIdRef = useRef<string | null>(null);
  const detailBookmarkId = bookmark?.id;
  const detailProjectId = bookmark?.project_id;

  // Sync the editable fields from the bookmark when a different bookmark opens.
  // Keyed on the id so optimistic store updates don't clobber in-progress typing.
  useEffect(() => {
    if (!isOpen || !bookmark) return;
    if (syncedIdRef.current === bookmark.id) return;
    syncedIdRef.current = bookmark.id;
    setTitle(bookmark.title);
    setUrl(bookmark.url);
    setNote(bookmark.description);
    setTagInput("");
    setNewComment("");
  }, [bookmark, isOpen]);

  useEffect(() => {
    if (!isOpen || !detailBookmarkId || !detailProjectId) return;
    void bookmarkStore.fetchBookmarkComments(workspaceSlug, detailProjectId, detailBookmarkId).catch(() => {});
  }, [bookmarkStore, isOpen, detailBookmarkId, detailProjectId, workspaceSlug]);

  if (!bookmark) return null;

  const comments = bookmarkStore.bookmarkComments(bookmark.id);
  const imageUrl = bookmarkPreviewImage(bookmark);
  const href = bookmarkHref(workspaceSlug, bookmark);
  const isExternal = !!bookmark.url;
  const suggestedTags = bookmarkSuggestedTags(bookmark);
  // Projects the bookmark can move to — everything writable except its own.
  const otherProjects = moveTargets.filter((project) => project.id !== bookmark.project_id);

  const persist = async (payload: Parameters<typeof bookmarkStore.updateBookmark>[3], onError: () => void) => {
    try {
      await bookmarkStore.updateBookmark(workspaceSlug, bookmark.project_id, bookmark.id, payload);
    } catch {
      onError();
      setToast({ type: TOAST_TYPE.ERROR, title: "Bookmark could not be saved" });
    }
  };

  const saveTitle = () => {
    const value = title.trim();
    if (!value) {
      setTitle(bookmark.title);
      return;
    }
    if (value === bookmark.title) return;
    void persist({ title: value }, () => setTitle(bookmark.title));
  };

  const saveUrl = () => {
    const value = url.trim();
    if (value === bookmark.url) return;
    void persist({ url: value }, () => setUrl(bookmark.url));
  };

  const saveNote = () => {
    if (note === bookmark.description) return;
    void persist({ description: note }, () => setNote(bookmark.description));
  };

  const addTags = () => {
    const additions = normalizeTags(tagInput).filter((tag) => !bookmark.tags.includes(tag));
    setTagInput("");
    if (additions.length === 0) return;
    void persist({ tags: [...bookmark.tags, ...additions] }, () => {});
  };

  const removeTag = (tag: string) => {
    void persist({ tags: bookmark.tags.filter((value) => value !== tag) }, () => {});
  };

  const acceptSuggestedTag = (tag: string) => {
    const remaining = suggestedTags.filter((value) => value !== tag);
    const nextTags = bookmark.tags.includes(tag) ? bookmark.tags : [...bookmark.tags, tag];
    void persist({ tags: nextTags, metadata: { ...bookmark.metadata, suggested_tags: remaining } }, () => {});
  };

  const dismissSuggestedTag = (tag: string) => {
    const remaining = suggestedTags.filter((value) => value !== tag);
    void persist({ metadata: { ...bookmark.metadata, suggested_tags: remaining } }, () => {});
  };

  const postComment = async () => {
    const value = newComment.trim();
    if (!value || isPosting) return;
    setIsPosting(true);
    try {
      await bookmarkStore.createBookmarkComment(workspaceSlug, bookmark.project_id, bookmark.id, value);
      setNewComment("");
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Comment could not be posted" });
    } finally {
      setIsPosting(false);
    }
  };

  const editComment = async (commentId: string, comment: string) => {
    try {
      await bookmarkStore.updateBookmarkComment(workspaceSlug, bookmark.project_id, bookmark.id, commentId, comment);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Comment could not be updated" });
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await bookmarkStore.deleteBookmarkComment(workspaceSlug, bookmark.project_id, bookmark.id, commentId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Comment could not be deleted" });
    }
  };

  // The link icon next to the close button is the only affordance for following
  // the URL; the open button does not exist as a separate labelled control.
  const openLinkButton = href ? (
    isExternal ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label="Open link"
        className="grid size-8 place-items-center rounded-lg text-icon-tertiary transition-colors hover:bg-layer-1 hover:text-primary active:scale-95"
      >
        <DetailIcon icon={LinkSquare01Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
      </a>
    ) : (
      <Link
        href={href}
        aria-label="Open link"
        className="grid size-8 place-items-center rounded-lg text-icon-tertiary transition-colors hover:bg-layer-1 hover:text-primary active:scale-95"
      >
        <DetailIcon icon={LinkSquare01Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
      </Link>
    )
  ) : null;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} width={EModalWidth.XXL}>
      <div className="flex max-h-[85vh] flex-col">
        {/* Header — title + quiet actions, no chrome */}
        <div className="flex items-start gap-3 px-5 pt-5">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-layer-1 text-tertiary">
            {bookmark.metadata?.favicon_url ? (
              <img src={bookmark.metadata.favicon_url} alt="" className="size-4 rounded" />
            ) : (
              <DetailIcon icon={BookmarkIcon} className="size-3.5" color="currentColor" strokeWidth={1.5} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            {canEdit ? (
              <input
                className="w-full rounded-md bg-transparent px-2 py-0.5 text-16 font-semibold text-primary transition-colors outline-none placeholder:text-tertiary hover:bg-layer-1/60 focus:bg-layer-1"
                value={title}
                placeholder="Untitled"
                onChange={(event) => setTitle(event.target.value)}
                onBlur={saveTitle}
              />
            ) : (
              <h2 className="px-2 text-16 font-semibold text-primary">
                {bookmarkDisplayTitle(bookmark) || bookmarkSource(bookmark)}
              </h2>
            )}
            <div className="mt-1 flex items-center gap-1.5 px-2 text-11 text-tertiary">
              <span className="truncate">
                {showProject && bookmark.project_name ? bookmark.project_name : bookmarkSource(bookmark)}
              </span>
              {bookmark.updated_at && (
                <>
                  <span>·</span>
                  <span className="shrink-0">{renderFormattedDate(bookmark.updated_at)}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {openLinkButton}
            {(href || canEdit) && (
              <CustomMenu
                placement="bottom-end"
                closeOnSelect
                useCaptureForOutsideClick
                customButton={
                  <span className="grid size-8 place-items-center rounded-lg text-icon-tertiary transition-colors hover:bg-layer-1 hover:text-primary">
                    <MoreHorizontal className="size-4" weight="Bold" />
                  </span>
                }
              >
                {href && (
                  <CustomMenu.MenuItem onClick={() => void navigator.clipboard?.writeText(href)}>
                    <span className="flex items-center gap-2">
                      <DetailIcon icon={Copy01Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
                      Copy link
                    </span>
                  </CustomMenu.MenuItem>
                )}
                {canEdit && otherProjects.length > 0 && (
                  <CustomMenu.SubMenu
                    trigger={
                      <span className="flex items-center gap-2">
                        <DetailIcon icon={FolderIcon} className="size-4" color="currentColor" strokeWidth={1.5} />
                        Move to project
                      </span>
                    }
                  >
                    {otherProjects.map((project) => (
                      <CustomMenu.MenuItem key={project.id} onClick={() => onMove(bookmark, project.id)}>
                        <span className="flex items-center gap-2 truncate">{project.name}</span>
                      </CustomMenu.MenuItem>
                    ))}
                  </CustomMenu.SubMenu>
                )}
                {canEdit && (
                  <CustomMenu.MenuItem
                    onClick={() => {
                      onDelete(bookmark);
                      onClose();
                    }}
                    className="text-red-500 hover:!bg-red-500/10 hover:!text-red-500"
                  >
                    <span className="flex items-center gap-2">
                      <DetailIcon icon={Delete02Icon} className="size-4" color="currentColor" strokeWidth={1.5} />
                      Delete
                    </span>
                  </CustomMenu.MenuItem>
                )}
              </CustomMenu>
            )}
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-lg text-icon-tertiary transition-colors hover:bg-layer-1 hover:text-primary active:scale-95"
              aria-label="Close"
            >
              <DetailIcon icon={CancelCircleIcon} className="size-4" color="currentColor" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Body — fields read as content, editing reveals on hover/focus */}
        <div className="vertical-scrollbar flex scrollbar-sm flex-col gap-3 overflow-y-auto px-5 pt-3 pb-5">
          {imageUrl && <img src={imageUrl} alt="" className="max-h-64 w-full rounded-xl bg-layer-1/40 object-cover" />}

          {canEdit ? (
            <div className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors focus-within:bg-layer-1 hover:bg-layer-1/60">
              <DetailIcon
                icon={LinkSquare01Icon}
                className="size-3.5 shrink-0 text-tertiary"
                color="currentColor"
                strokeWidth={1.5}
              />
              <input
                className="w-full bg-transparent text-13 text-secondary outline-none placeholder:text-tertiary"
                value={url}
                placeholder="Add a link"
                onChange={(event) => setUrl(event.target.value)}
                onBlur={saveUrl}
              />
            </div>
          ) : (
            bookmark.url && (
              <a
                href={bookmark.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-2 text-13 text-secondary hover:text-primary"
              >
                <DetailIcon
                  icon={LinkSquare01Icon}
                  className="size-3.5 shrink-0 text-tertiary"
                  color="currentColor"
                  strokeWidth={1.5}
                />
                <span className="truncate">{bookmark.url}</span>
              </a>
            )
          )}

          {canEdit ? (
            <textarea
              className="min-h-9 w-full resize-none rounded-md bg-transparent px-2 py-1.5 text-13 leading-relaxed text-primary transition-colors outline-none placeholder:text-tertiary hover:bg-layer-1/60 focus:bg-layer-1"
              rows={2}
              placeholder="Add a note…"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onBlur={saveNote}
            />
          ) : (
            bookmark.description && (
              <p className="px-2 text-13 leading-relaxed whitespace-pre-wrap text-secondary">{bookmark.description}</p>
            )
          )}

          {(canEdit || bookmark.tags.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 px-2">
              {bookmark.tags.map((tag) => (
                <span
                  key={tag}
                  className="group/tag inline-flex items-center gap-1 rounded-md bg-layer-1 px-2 py-0.5 text-12 text-secondary"
                >
                  {tag}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`Remove ${tag}`}
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-500 grid place-items-center text-tertiary opacity-0 transition-opacity group-hover/tag:opacity-100"
                    >
                      <DetailIcon
                        icon={CancelCircleIcon}
                        className="size-3"
                        color="currentColor"
                        strokeWidth={1.5}
                      />
                    </button>
                  )}
                </span>
              ))}
              {canEdit && (
                <input
                  className="h-6 min-w-24 flex-1 bg-transparent text-12 text-primary outline-none placeholder:text-tertiary"
                  placeholder={bookmark.tags.length > 0 ? "Add tag" : "Add tags…"}
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addTags();
                    }
                  }}
                  onBlur={addTags}
                />
              )}
            </div>
          )}
          {canEdit && suggestedTags.length > 0 && (
            <SuggestedTagChips
              tags={suggestedTags}
              onAccept={acceptSuggestedTag}
              onDismiss={dismissSuggestedTag}
              className="px-2"
            />
          )}

          {/* Comments — a single hairline, no header chrome */}
          {(comments.length > 0 || canEdit) && (
            <div className="mt-1 flex flex-col gap-4 border-t border-subtle/70 px-2 pt-5">
              {comments.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  canEdit={!!currentUser?.id && currentUser.id === comment.actor}
                  onEdit={editComment}
                  onDelete={deleteComment}
                />
              ))}
              {canEdit && (
                <div className="flex flex-col gap-2">
                  <textarea
                    className="min-h-9 w-full resize-none rounded-md bg-transparent px-2 py-1.5 text-13 text-primary transition-colors outline-none placeholder:text-tertiary hover:bg-layer-1/60 focus:bg-layer-1"
                    rows={1}
                    placeholder="Write a comment…"
                    value={newComment}
                    onChange={(event) => setNewComment(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void postComment();
                      }
                    }}
                  />
                  {newComment.trim() && (
                    <div className="flex justify-end">
                      <Button variant="primary" size="sm" onClick={() => void postComment()} disabled={isPosting}>
                        Comment
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalCore>
  );
});

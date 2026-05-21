/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import { CornerDownRight } from "@plane/icons";
import { Avatar, Tooltip } from "@plane/ui";
import type { TCommentsOperations } from "@plane/types";
import { calculateTimeAgo, cn, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// components
import { LiteTextEditor } from "@/components/editor/lite-text";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
// local
import { CommentCardEditForm } from "./card/edit-form";
import { CommentCreate } from "./comment-create";
import { CommentQuickActions } from "./quick-actions";

type TCommentReplies = {
  parentId: string;
  workspaceSlug: string;
  workspaceId: string;
  entityId: string;
  projectId?: string;
  activityOperations: TCommentsOperations;
  disabled?: boolean;
};

/**
 * Renders the inline reply thread under a top-level comment:
 *
 *   ↓ Reply (toggle)             ← when collapsed and there are no replies
 *   [composer with mention picker]
 *   [reply 1: avatar + name + body + edit/delete]
 *   [reply 2: …]
 *
 * Depth is capped at one level — each reply sets `parent` to the
 * top-level comment id, never to another reply. The list reads from
 * the store's `getRepliesByParentId` selector which already sorts
 * oldest-first.
 */
export const CommentReplies = observer(function CommentReplies(props: TCommentReplies) {
  const { parentId, workspaceSlug, workspaceId, entityId, projectId, activityOperations, disabled = false } = props;
  // store hooks
  const {
    comment: { getRepliesByParentId },
  } = useIssueDetail();
  // local state
  const [isComposing, setIsComposing] = useState(false);

  const replyIds = getRepliesByParentId(parentId);
  const hasReplies = replyIds.length > 0;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {hasReplies && (
        <ul className="border-subtle ml-2 flex flex-col gap-2 border-l pl-3">
          {replyIds.map((id) => (
            <ReplyRow
              key={id}
              replyId={id}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              projectId={projectId}
              activityOperations={activityOperations}
              disabled={disabled}
            />
          ))}
        </ul>
      )}

      {/* The composer reuses CommentCreate so mentions, attachments,
          and the rich editor behavior are identical to top-level. */}
      {!disabled && (
        <div className="ml-2">
          {isComposing ? (
            <div className="flex flex-col gap-1.5">
              <CommentCreate
                workspaceSlug={workspaceSlug}
                entityId={entityId}
                activityOperations={activityOperations}
                projectId={projectId}
                parentId={parentId}
                compact
              />
              <button
                type="button"
                onClick={() => setIsComposing(false)}
                className="text-caption-sm text-tertiary self-start hover:text-secondary"
              >
                Close
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsComposing(true)}
              className="text-caption-sm-medium text-secondary hover:text-primary inline-flex items-center gap-1.5"
            >
              <CornerDownRight className="size-3" />
              {hasReplies ? `Reply` : `Reply to this comment`}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

// One row inside the reply list. Slimmer than the top-level card —
// no chunky timeline rail, no Reply button (depth cap), but keeps
// edit/delete + reactions + mention rendering via LiteTextEditor.
const ReplyRow = observer(function ReplyRow(props: {
  replyId: string;
  workspaceSlug: string;
  workspaceId: string;
  projectId?: string;
  activityOperations: TCommentsOperations;
  disabled: boolean;
}) {
  const { replyId, workspaceSlug, workspaceId, projectId, activityOperations, disabled } = props;
  const { comment: store } = useIssueDetail();
  const { getUserDetails } = useMember();

  const reply = store.getCommentById(replyId);
  const [isEditing, setIsEditing] = useState(false);
  const editorRef = useRef<EditorRefApi>(null);

  if (!reply) return null;

  const userDetails = getUserDetails(reply.actor);
  const displayName = reply.actor_detail?.is_bot
    ? (reply.actor_detail?.first_name ?? "") + "Bot"
    : (userDetails?.display_name ?? reply.actor_detail?.display_name ?? "");
  const avatarUrl = userDetails?.avatar_url ?? reply.actor_detail?.avatar_url;

  return (
    <li className="flex flex-col gap-1.5" id={`comment-${reply.id}`}>
      <div className="flex items-center gap-2">
        <Avatar size="sm" name={displayName} src={getFileURL(avatarUrl ?? "")} className="shrink-0" />
        <div className="flex flex-1 flex-wrap items-center gap-1">
          <div className="text-caption-sm-medium">{displayName}</div>
          <div className="text-caption-sm text-tertiary">
            replied{" "}
            <Tooltip
              tooltipContent={`${renderFormattedDate(reply.created_at)} at ${renderFormattedTime(reply.created_at)}`}
              position="bottom"
            >
              <span className="text-tertiary">
                {calculateTimeAgo(reply.created_at)}
                {reply.edited_at && " (edited)"}
              </span>
            </Tooltip>
          </div>
        </div>
        {!disabled && (
          <CommentQuickActions
            activityOperations={activityOperations}
            comment={reply}
            setEditMode={() => setIsEditing(true)}
            // Replies are always thread-internal — neither switch is
            // meaningful here. Both hide cleanly when false.
            showAccessSpecifier={false}
            showCopyLinkOption={false}
          />
        )}
      </div>
      <div className={cn("pl-7")}>
        {isEditing ? (
          <CommentCardEditForm
            activityOperations={activityOperations}
            comment={reply}
            isEditing={isEditing}
            readOnlyEditorRef={editorRef.current}
            setIsEditing={setIsEditing}
            projectId={projectId}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
          />
        ) : (
          <LiteTextEditor
            editable={false}
            ref={editorRef}
            id={reply.id}
            initialValue={reply.comment_html ?? ""}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            containerClassName="!py-0"
            parentClassName="border-none"
            displayConfig={{ fontSize: "small-font" }}
          />
        )}
      </div>
    </li>
  );
});

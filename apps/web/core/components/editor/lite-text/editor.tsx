/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
// plane constants
import type { EIssueCommentAccessSpecifier } from "@plane/constants";
// plane imports
import { LiteTextEditorWithRef } from "@plane/editor";
import type { EditorRefApi, ILiteTextEditorProps, TFileHandler } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import type { MakeOptional } from "@plane/types";
import { cn, isCommentEmpty } from "@plane/utils";
// components
import { EditorMentionsRoot } from "@/components/editor/embeds/mentions";
import { IssueCommentToolbar } from "@/components/editor/lite-text/toolbar";
// hooks
import { useEditorConfig, useEditorMention } from "@/hooks/editor";
import { useMember } from "@/hooks/store/use-member";
import { useParseEditorContent } from "@/hooks/use-parse-editor-content";
// plane web hooks
import { useEditorFlagging } from "@/plane-web/hooks/use-editor-flagging";
// plane web service
import { WorkspaceService } from "@/services/workspace.service";
import { LiteToolbar } from "./lite-toolbar";
const workspaceService = new WorkspaceService();

type LiteTextEditorWrapperProps = MakeOptional<
  Omit<ILiteTextEditorProps, "fileHandler" | "mentionHandler" | "extendedEditorProps">,
  "disabledExtensions" | "flaggedExtensions" | "getEditorMetaData"
> & {
  workspaceSlug: string;
  workspaceId: string;
  projectId?: string;
  accessSpecifier?: EIssueCommentAccessSpecifier;
  handleAccessChange?: (accessKey: EIssueCommentAccessSpecifier) => void;
  showAccessSpecifier?: boolean;
  showSubmitButton?: boolean;
  isSubmitting?: boolean;
  showToolbarInitially?: boolean;
  variant?: "full" | "lite" | "none";
  issue_id?: string;
  parentClassName?: string;
  editorClassName?: string;
  submitButtonText?: string;
} & (
    | {
        editable: false;
      }
    | {
        editable: true;
        uploadFile: TFileHandler["upload"];
        duplicateFile: TFileHandler["duplicate"];
      }
  );

export const LiteTextEditor = React.forwardRef(function LiteTextEditor(
  props: LiteTextEditorWrapperProps,
  ref: React.ForwardedRef<EditorRefApi>
) {
  const { t } = useTranslation();
  const {
    containerClassName,
    editable,
    workspaceSlug,
    workspaceId,
    projectId,
    issue_id,
    accessSpecifier,
    handleAccessChange,
    showAccessSpecifier = false,
    showSubmitButton = true,
    isSubmitting = false,
    showToolbarInitially = true,
    variant = "full",
    parentClassName = "",
    placeholder = t("issue.comments.placeholder"),
    disabledExtensions: additionalDisabledExtensions = [],
    editorClassName = "",
    showPlaceholderOnEmpty = true,
    submitButtonText = "common.comment",
    ...rest
  } = props;
  // states
  const isLiteVariant = variant === "lite";
  const isFullVariant = variant === "full";
  const [isFocused, setIsFocused] = useState(isFullVariant ? showToolbarInitially : true);
  const [editorRef, setEditorRef] = useState<EditorRefApi | null>(null);
  // editor flaggings
  const { liteText: liteTextEditorExtensions } = useEditorFlagging({
    workspaceSlug,
    projectId,
  });
  // store hooks
  const { getUserDetails } = useMember();
  // parse content
  const { getEditorMetaData } = useParseEditorContent({
    projectId,
    workspaceSlug,
  });
  // use editor mention
  const { fetchMentions } = useEditorMention({
    searchEntity: async (payload) =>
      await workspaceService.searchEntity(workspaceSlug, {
        ...payload,
        project_id: projectId,
        issue_id,
      }),
  });
  // editor config
  const { getEditorFileHandlers } = useEditorConfig();
  function isMutableRefObject<T>(ref: React.ForwardedRef<T>): ref is React.MutableRefObject<T | null> {
    return !!ref && typeof ref === "object" && "current" in ref;
  }
  // derived values
  const isEmpty = isCommentEmpty(props.initialValue);

  // Stable handler identity matters: TipTap rebuilds the editor schema when
  // the fileHandler / mentionHandler reference changes. Without memoization,
  // every parent render recreated these objects and re-initialized ProseMirror
  // — visible cost on issue-detail pages with many read-only comments.
  const uploadFile = editable
    ? (props as Extract<LiteTextEditorWrapperProps, { editable: true }>).uploadFile
    : undefined;
  const duplicateFile = editable
    ? (props as Extract<LiteTextEditorWrapperProps, { editable: true }>).duplicateFile
    : undefined;

  const fileHandler = useMemo(
    () =>
      getEditorFileHandlers({
        projectId,
        uploadFile: editable && uploadFile ? uploadFile : async () => "",
        duplicateFile: editable && duplicateFile ? duplicateFile : async () => "",
        workspaceId,
        workspaceSlug,
      }),
    [getEditorFileHandlers, projectId, workspaceId, workspaceSlug, editable, uploadFile, duplicateFile]
  );

  // Refs let us bake a stable mentionHandler whose closures still see the
  // latest fetchMentions / getUserDetails without forcing an editor rebuild.
  const fetchMentionsRef = useRef(fetchMentions);
  const getUserDetailsRef = useRef(getUserDetails);
  useEffect(() => {
    fetchMentionsRef.current = fetchMentions;
    getUserDetailsRef.current = getUserDetails;
  });

  const mentionHandler = useMemo(
    () => ({
      searchCallback: async (query: string) => {
        const res = await fetchMentionsRef.current(query);
        if (!res) throw new Error("Failed in fetching mentions");
        return res;
      },
      renderComponent: EditorMentionsRoot,
      getMentionedEntityDetails: (id: string) => ({
        display_name: getUserDetailsRef.current(id)?.display_name ?? "",
      }),
    }),
    []
  );

  return (
    <div
      className={cn(
        "relative rounded-sm border border-subtle",
        {
          "p-3": editable && !isLiteVariant,
        },
        parentClassName
      )}
      onFocus={() => isFullVariant && !showToolbarInitially && setIsFocused(true)}
      onBlur={() => isFullVariant && !showToolbarInitially && setIsFocused(false)}
    >
      {/* Wrapper for lite toolbar layout */}
      <div className={cn(isLiteVariant && editable ? "flex items-end gap-1" : "")}>
        {/* Main Editor - always rendered once */}
        <div className={cn(isLiteVariant && editable ? "min-w-0 flex-1" : "")}>
          <LiteTextEditorWithRef
            ref={ref}
            disabledExtensions={[...liteTextEditorExtensions.disabled, ...additionalDisabledExtensions]}
            editable={editable}
            flaggedExtensions={liteTextEditorExtensions.flagged}
            fileHandler={fileHandler}
            getEditorMetaData={getEditorMetaData}
            handleEditorReady={(ready) => {
              if (ready) {
                setEditorRef(isMutableRefObject<EditorRefApi>(ref) ? ref.current : null);
              }
            }}
            mentionHandler={mentionHandler}
            placeholder={placeholder}
            showPlaceholderOnEmpty={showPlaceholderOnEmpty}
            containerClassName={cn(containerClassName, "relative", {
              "p-2": !editable,
            })}
            extendedEditorProps={{}}
            editorClassName={editorClassName}
            {...rest}
          />
        </div>

        {/* Lite Toolbar - conditionally rendered */}
        {isLiteVariant && editable && (
          <LiteToolbar
            executeCommand={(item) => {
              // TODO: update this while toolbar homogenization
              // @ts-expect-error type mismatch here
              editorRef?.executeMenuItemCommand({
                itemKey: item.itemKey,
                ...item.extraProps,
              });
            }}
            onSubmit={(e) => rest.onEnterKeyPress?.(e)}
            isSubmitting={isSubmitting}
            isEmpty={isEmpty}
          />
        )}
      </div>

      {/* Full Toolbar - conditionally rendered */}
      {isFullVariant && editable && (
        <div
          className={cn(
            "origin-top overflow-hidden transition-all duration-300 ease-out",
            isFocused ? "mt-3 max-h-[200px] scale-y-100 opacity-100" : "invisible max-h-0 scale-y-0 opacity-0"
          )}
        >
          <IssueCommentToolbar
            accessSpecifier={accessSpecifier}
            executeCommand={(item) => {
              // TODO: update this while toolbar homogenization
              // @ts-expect-error type mismatch here
              editorRef?.executeMenuItemCommand({
                itemKey: item.itemKey,
                ...item.extraProps,
              });
            }}
            handleAccessChange={handleAccessChange}
            handleSubmit={(e) => rest.onEnterKeyPress?.(e)}
            isCommentEmpty={isEmpty}
            isSubmitting={isSubmitting}
            showAccessSpecifier={showAccessSpecifier}
            editorRef={editorRef}
            showSubmitButton={showSubmitButton}
            submitButtonText={submitButtonText}
          />
        </div>
      )}
    </div>
  );
});

LiteTextEditor.displayName = "LiteTextEditor";

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import type { RefObject } from "react";
import { v4 as uuidv4 } from "uuid";
import type { EditorRefApi } from "@plane/editor";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TCommentsOperations } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  AtSign,
  Box,
  CloudArrowUp,
  FileText,
  HardDrive,
  MessageCircle,
  Paperclip,
  Plus,
  Smile,
} from "@/components/icons/lucide-shim";
import { isGoogleDrivePickerConfigured, pickGoogleDriveFile } from "@/components/google-drive/google-drive-picker";

type TCommentAttachmentMenu = {
  activityOperations: TCommentsOperations;
  className?: string;
  commentId?: string;
  editorRef: RefObject<EditorRefApi>;
  onAssetUploaded?: (assetId: string) => void;
};

const insertLinkedText = (editorRef: RefObject<EditorRefApi>, text: string, href: string) => {
  editorRef.current?.setEditorValueAtCursorPosition({
    type: "paragraph",
    content: [
      {
        type: "text",
        text,
        marks: [
          {
            type: "link",
            attrs: { href, target: "_blank" },
          },
        ],
      },
    ],
  });
};

export function CommentAttachmentMenu(props: TCommentAttachmentMenu) {
  const { activityOperations, className, commentId, editorRef, onAssetUploaded } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUploadFile = async (file: File | undefined) => {
    if (!file || isUploading) return;

    setIsUploading(true);
    try {
      const { asset_id, asset_url } = await activityOperations.uploadCommentAsset(uuidv4(), file, commentId);
      onAssetUploaded?.(asset_id);
      insertLinkedText(editorRef, file.name, asset_url);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Upload failed",
        message: "The file could not be added to the comment.",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAttachDriveFile = async () => {
    if (!isGoogleDrivePickerConfigured()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Google Drive is not configured",
        message: "Add the Google Drive API key and OAuth client ID to open the file picker.",
      });
      return;
    }

    const pickedFile = await pickGoogleDriveFile();
    if (!pickedFile) return;
    insertLinkedText(editorRef, pickedFile.name, pickedFile.web_view_link);
  };

  const menuItemClassName = "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-13";
  const iconClassName = "size-4 flex-shrink-0";

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => void handleUploadFile(event.target.files?.[0])}
      />
      <CustomMenu
        closeOnSelect
        placement="top-start"
        customButton={
          <Plus className={cn("size-4", isUploading ? "animate-spin" : "")} aria-hidden="true" strokeWidth={2.5} />
        }
        customButtonClassName={cn(
          "shadow-sm grid size-8 place-items-center rounded-full border border-subtle bg-surface-1 text-secondary transition-colors hover:bg-surface-2 hover:text-primary",
          className
        )}
        menuItemsClassName="z-[45]"
        optionsClassName="min-w-[186px] rounded-xl p-1.5 shadow-raised-200"
        ariaLabel="Add attachment"
      >
        <CustomMenu.MenuItem className={menuItemClassName} onClick={() => fileInputRef.current?.click()}>
          <Paperclip className={iconClassName} aria-hidden="true" />
          Upload file
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem disabled className={cn(menuItemClassName, "opacity-60")}>
          <Box className={cn(iconClassName, "text-[#0061ff]")} aria-hidden="true" />
          Dropbox
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem disabled className={cn(menuItemClassName, "opacity-60")}>
          <CloudArrowUp className={cn(iconClassName, "text-[#0078d4]")} aria-hidden="true" />
          OneDrive/SharePoint
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem disabled className={cn(menuItemClassName, "opacity-60")}>
          <Box className={cn(iconClassName, "text-[#0061d5]")} aria-hidden="true" />
          Box
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem className={menuItemClassName} onClick={() => void handleAttachDriveFile()}>
          <HardDrive className={cn(iconClassName, "text-[#188038]")} aria-hidden="true" />
          Google Drive
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem disabled className={cn(menuItemClassName, "opacity-60")}>
          <FileText className={cn(iconClassName, "text-[#188038]")} aria-hidden="true" />
          New Google Doc
        </CustomMenu.MenuItem>
        <div className="mt-1 flex items-center gap-1 border-t border-subtle pt-1">
          {[
            { key: "emoji", Icon: Smile },
            { key: "mention", Icon: AtSign },
            { key: "comment", Icon: MessageCircle },
          ].map(({ key, Icon }) => (
            <button
              key={key}
              type="button"
              disabled
              className="grid size-7 place-items-center rounded-md text-placeholder"
              aria-hidden="true"
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
      </CustomMenu>
    </>
  );
}

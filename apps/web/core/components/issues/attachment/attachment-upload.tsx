/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState, type MouseEvent } from "react";
import { observer } from "mobx-react";
import { useDropzone } from "react-dropzone";
import { HardDrive } from "@/components/icons/lucide-shim";
import { pickGoogleDriveFile } from "@/components/google-drive/google-drive-picker";
// plane web hooks
import { useFileSize } from "@/plane-web/hooks/use-file-size";
// types
import type { TAttachmentOperations } from "../issue-detail-widgets/attachments/helper";

type TAttachmentOperationsWithDrive = Pick<TAttachmentOperations, "create" | "createGoogleDrive">;

type Props = {
  workspaceSlug: string;
  disabled?: boolean;
  attachmentOperations: TAttachmentOperationsWithDrive;
};

export const IssueAttachmentUpload = observer(function IssueAttachmentUpload(props: Props) {
  const { workspaceSlug, disabled = false, attachmentOperations } = props;
  // states
  const [isLoading, setIsLoading] = useState(false);
  // file size
  const { maxFileSize } = useFileSize();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const currentFile: File = acceptedFiles[0];
      if (!currentFile || !workspaceSlug) return;

      setIsLoading(true);
      attachmentOperations.create(currentFile).finally(() => setIsLoading(false));
    },
    [attachmentOperations, workspaceSlug]
  );

  const handleAttachDrive = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!workspaceSlug || disabled || isLoading) return;
    const pickedFile = await pickGoogleDriveFile();
    if (!pickedFile) return;
    setIsLoading(true);
    attachmentOperations.createGoogleDrive(pickedFile).finally(() => setIsLoading(false));
  };

  const { getRootProps, getInputProps, isDragActive, isDragReject, fileRejections } = useDropzone({
    onDrop,
    maxSize: maxFileSize,
    multiple: false,
    disabled: isLoading || disabled,
  });

  const fileError =
    fileRejections.length > 0 ? `Invalid file type or size (max ${maxFileSize / 1024 / 1024} MB)` : null;

  return (
    <div
      {...getRootProps()}
      className={`flex h-[60px] items-center justify-center rounded-lg border-2 border-dashed bg-accent-primary/5 px-4 text-11 text-accent-primary ${
        isDragActive ? "border-accent-strong bg-accent-primary/10" : "border-subtle"
      } ${isDragReject ? "bg-danger-subtle" : ""} ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
    >
      <input {...getInputProps()} />
      <span className="flex items-center gap-2">
        {isDragActive ? (
          <p>Drop here...</p>
        ) : fileError ? (
          <p className="text-center text-danger-primary">{fileError}</p>
        ) : isLoading ? (
          <p className="text-center">Uploading...</p>
        ) : (
          <p className="text-center">Click or drag a file here</p>
        )}
      </span>
      {!disabled && !isLoading && (
        <button
          type="button"
          onClick={handleAttachDrive}
          className="ml-3 inline-flex items-center gap-1 rounded border border-subtle bg-surface-1 px-2 py-1 text-11 text-secondary hover:bg-surface-2"
        >
          <HardDrive className="size-3.5" />
          Google Drive
        </button>
      )}
    </div>
  );
});

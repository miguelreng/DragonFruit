/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TAgentChatAttachment, TAgentChatAttachmentPayload } from "@/services/agent-chat.service";

export const AGENT_CHAT_MAX_FILE_BYTES = 2_500_000;
export const AGENT_CHAT_MAX_FILES = 6;
export const AGENT_CHAT_ACCEPTED_FILE_TYPES =
  "image/png,image/jpeg,image/gif,image/webp,text/csv,application/pdf,.csv,.pdf";

export type TPendingAgentChatFile = {
  id: string;
  file: File;
};

export function classifyAgentChatFileKind(mime: string): TAgentChatAttachment["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/csv" || mime === "application/csv" || mime.startsWith("text/")) return "text";
  return "other";
}

export function buildPendingAgentChatFiles(filesList: FileList, currentCount: number) {
  const accepted: TPendingAgentChatFile[] = [];
  let rejectedSize = 0;

  for (const file of Array.from(filesList)) {
    if (currentCount + accepted.length >= AGENT_CHAT_MAX_FILES) break;
    if (file.size > AGENT_CHAT_MAX_FILE_BYTES) {
      rejectedSize += 1;
      continue;
    }
    accepted.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
    });
  }

  return { accepted, rejectedSize };
}

export async function fileToAgentChatAttachmentPayload(file: File): Promise<TAgentChatAttachmentPayload> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("read failed")));
    reader.readAsDataURL(file);
  });
  const commaAt = dataUrl.indexOf(",");
  return {
    name: file.name,
    mime_type: file.type || "application/octet-stream",
    content_base64: commaAt >= 0 ? dataUrl.slice(commaAt + 1) : "",
  };
}

export function formatAgentChatFileSize(size: number) {
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024).toFixed(size > 1024 * 1024 ? 0 : 1)} KB`;
}

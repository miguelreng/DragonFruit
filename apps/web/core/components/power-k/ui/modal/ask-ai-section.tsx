/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState, useCallback, useRef } from "react";
import { Command } from "cmdk";
import { FileText, Loader2, Paperclip, Sparkles, X } from "@/components/icons/lucide-shim";
import { cn } from "@plane/utils";
import {
  AGENT_CHAT_ACCEPTED_FILE_TYPES,
  AGENT_CHAT_MAX_FILE_BYTES,
  buildPendingAgentChatFiles,
  fileToAgentChatAttachmentPayload,
  formatAgentChatFileSize,
  type TPendingAgentChatFile,
} from "@/helpers/agent-chat-attachments";
import { AgentChatService } from "@/services/agent-chat.service";

type Props = {
  workspaceSlug: string | undefined;
  searchTerm: string;
};

const agentChatService = new AgentChatService();

export function PowerKAskAISection(props: Props) {
  const { workspaceSlug, searchTerm } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedFor, setSubmittedFor] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<TPendingAgentChatFile[]>([]);

  const handleAttach = useCallback(
    (filesList: FileList | null) => {
      if (!filesList || filesList.length === 0) return;
      const { accepted, rejectedSize } = buildPendingAgentChatFiles(filesList, pendingFiles.length);
      if (rejectedSize > 0) {
        setError(`Files over ${Math.round(AGENT_CHAT_MAX_FILE_BYTES / 1_000_000)} MB were skipped.`);
      }
      if (accepted.length > 0) {
        setError(null);
        setPendingFiles((cur) => [...cur, ...accepted]);
      }
    },
    [pendingFiles.length]
  );

  const handleRemovePending = useCallback((id: string) => {
    setPendingFiles((cur) => cur.filter((entry) => entry.id !== id));
  }, []);

  const ask = useCallback(async () => {
    const trimmed = searchTerm.trim();
    const hasFiles = pendingFiles.length > 0;
    if (!workspaceSlug || (!trimmed && !hasFiles) || pending) return;
    setPending(true);
    setError(null);
    setAnswer(null);
    const fileSummary = pendingFiles.map((entry) => entry.file.name).join(", ");
    setSubmittedFor(trimmed || fileSummary);
    try {
      const attachments = await Promise.all(pendingFiles.map((entry) => fileToAgentChatAttachmentPayload(entry.file)));
      const session = await agentChatService.createSession(workspaceSlug, {
        title: trimmed || "Attachment question",
      });
      const res = await agentChatService.sendMessage(
        workspaceSlug,
        session.id,
        trimmed || "Please describe the attached file(s).",
        attachments,
        {
          tool_mode: "auto",
          context_note:
            "The user sent this from the command palette Ask Atlas bar. Answer concisely and use any attached files as primary context.",
        }
      );
      const assistantMessage = res.assistant_message;
      const text =
        assistantMessage.error_message || assistantMessage.content?.trim() || "The LLM returned an empty response.";
      if (assistantMessage.error_message) {
        setError(text);
      } else {
        setAnswer(text);
        setPendingFiles([]);
      }
    } catch (err: any) {
      const detail =
        err?.data?.error ||
        err?.data?.detail ||
        err?.error ||
        err?.detail ||
        (typeof err?.data === "string" ? err.data : undefined) ||
        err?.statusText;
      setError(detail || "Could not reach the configured LLM provider. Check Settings → Atlas.");
    } finally {
      setPending(false);
    }
  }, [workspaceSlug, searchTerm, pending, pendingFiles]);

  const hasQuery = searchTerm.trim().length > 0;
  const hasFiles = pendingFiles.length > 0;

  return (
    <Command.Group heading="Ask Atlas" forceMount>
      <input
        ref={fileInputRef}
        type="file"
        accept={AGENT_CHAT_ACCEPTED_FILE_TYPES}
        multiple
        className="hidden"
        onChange={(e) => {
          handleAttach(e.target.files);
          e.target.value = "";
        }}
      />
      <Command.Item
        value={`ai-ask-trigger ${searchTerm} ${pendingFiles.map((entry) => entry.file.name).join(" ")}`}
        forceMount
        onSelect={ask}
        disabled={pending}
        className="items-start focus:outline-none"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2 text-secondary">
            {pending ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-accent-primary" />
            ) : (
              <Sparkles className="size-3.5 shrink-0 text-accent-primary" />
            )}
            <span className="truncate">
              {hasQuery ? (
                <>
                  Ask Atlas: <span className="text-primary">{searchTerm}</span>
                </>
              ) : hasFiles ? (
                <span className="text-primary">Ask Atlas about attached files</span>
              ) : (
                <span className="text-tertiary">Type a question to ask your configured LLM</span>
              )}
            </span>
          </div>
          {pendingFiles.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {pendingFiles.map((entry) => (
                <PendingFileChip key={entry.id} file={entry.file} onRemove={() => handleRemovePending(entry.id)} />
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={pending}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="grid size-6 place-items-center rounded-md text-tertiary hover:bg-layer-1 hover:text-primary"
            aria-label="Attach file"
            title="Attach image, CSV, or PDF"
          >
            <Paperclip className="size-3.5" />
          </button>
          <span className="text-11 text-tertiary">↵</span>
        </div>
      </Command.Item>
      {(answer || error) && (
        <div
          className={cn("mx-2 mt-1 rounded border border-subtle bg-layer-1 p-2 text-12 leading-snug", {
            "text-secondary": !!answer,
            "text-danger-primary": !!error,
          })}
        >
          {error ?? answer}
          {submittedFor && answer && <div className="mt-2 text-11 text-tertiary">For: {submittedFor}</div>}
        </div>
      )}
    </Command.Group>
  );
}

function PendingFileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <li className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-subtle bg-layer-1 px-1.5 py-0.5 text-11">
      <FileText className="size-3 shrink-0 text-tertiary" />
      <span className="min-w-0 truncate text-primary">{file.name}</span>
      <span className="shrink-0 text-tertiary">{formatAgentChatFileSize(file.size)}</span>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="grid size-4 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-primary"
        aria-label={`Remove ${file.name}`}
      >
        <X className="size-3" />
      </button>
    </li>
  );
}

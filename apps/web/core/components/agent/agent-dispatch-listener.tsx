/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Sparkle, X } from "@/components/icons/lucide-shim";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { AgentWebhookService } from "@/services/agent-webhook.service";

type InvokeDetail = {
  paragraphText?: string;
  selectionText?: string;
  blockId?: string | null;
};

const agentService = new AgentWebhookService();

/**
 * Listens for `dragonfruit:agent-invoke` events fired by the editor's
 * `/agent` slash command. Opens a prompt modal, then POSTs to the
 * workspace's configured agent webhook. Mount once at the workspace layout.
 */
export const AgentDispatchListener = observer(function AgentDispatchListener() {
  const { workspaceSlug, projectId, pageId } = useParams() as {
    workspaceSlug?: string;
    projectId?: string;
    pageId?: string;
  };

  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [prompt, setPrompt] = useState("");
  const detailRef = useRef<InvokeDetail>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function onInvoke(e: Event) {
      const ce = e as CustomEvent<InvokeDetail>;
      detailRef.current = ce.detail ?? {};
      setPrompt("");
      setIsOpen(true);
      // Focus the textarea after the modal mounts.
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    window.addEventListener("dragonfruit:agent-invoke", onInvoke);
    return () => window.removeEventListener("dragonfruit:agent-invoke", onInvoke);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || !workspaceSlug) return;
    setIsSending(true);
    try {
      await agentService.dispatch(workspaceSlug, {
        prompt: trimmed,
        project_id: projectId ?? null,
        page_id: pageId ?? null,
        block_id: detailRef.current.blockId ?? null,
        selection_text: detailRef.current.selectionText || detailRef.current.paragraphText || null,
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Sent to your agent",
        message: "The agent will write back to this page when it's done.",
      });
      setIsOpen(false);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const message =
        status === 409
          ? "No agent webhook is configured for this workspace yet."
          : "Could not reach the agent webhook.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Dispatch failed", message });
    } finally {
      setIsSending(false);
    }
  }, [prompt, workspaceSlug, projectId, pageId]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/30 pt-32"
      onClick={() => !isSending && setIsOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-lg border border-subtle-1 bg-canvas p-4 shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkle className="size-4 text-tertiary" />
            <span className="text-sm font-medium">Ask the agent</span>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            disabled={isSending}
            className="text-tertiary hover:text-primary disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            } else if (e.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder="What should the agent do with this block?"
          rows={3}
          className="w-full resize-none rounded-md border border-subtle-1 bg-transparent px-3 py-2 text-sm outline-none focus:border-strong"
        />
        {detailRef.current.paragraphText && (
          <div className="mt-2 text-xs text-tertiary">
            Context: <span className="italic">"{detailRef.current.paragraphText.slice(0, 140)}"</span>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-tertiary">⌘↩ to send</div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSending || !prompt.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isSending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Sparkles } from "@/components/icons/lucide-shim";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { AIService } from "@/services/ai.service";

type InvokeDetail = {
  paragraphText?: string;
  selectionText?: string;
  blockId?: string | null;
};

const aiService = new AIService();

/**
 * Renders the always-available floating Ask AI bar for page editors.
 * Slash-command events can still prefill editor context, but the request
 * now goes through the app's first-party AI API instead of a workspace webhook.
 */
export const AgentDispatchListener = observer(function AgentDispatchListener() {
  const { workspaceSlug, pageId } = useParams() as {
    workspaceSlug?: string;
    pageId?: string;
  };

  const [isSending, setIsSending] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittedFor, setSubmittedFor] = useState<string | null>(null);
  const [context, setContext] = useState<InvokeDetail>({});
  const detailRef = useRef<InvokeDetail>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function onInvoke(e: Event) {
      const ce = e as CustomEvent<InvokeDetail>;
      detailRef.current = ce.detail ?? {};
      setContext(detailRef.current);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    window.addEventListener("dragonfruit:agent-invoke", onInvoke);
    return () => window.removeEventListener("dragonfruit:agent-invoke", onInvoke);
  }, []);

  const contextText = context.selectionText?.trim() || context.paragraphText?.trim() || "";

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || !workspaceSlug) return;
    setIsSending(true);
    setError(null);
    setAnswer(null);
    setSubmittedFor(trimmed);
    try {
      const res = await aiService.createGptTask(workspaceSlug, {
        prompt: contextText ? `${trimmed}\n\nContext from the editor:\n${contextText}` : trimmed,
        task: contextText
          ? "Help the user with writing using the provided editor context when relevant. Keep the answer concise and practical."
          : "Answer the user's question concisely and practically.",
        include_workspace_context: true,
      });
      const text =
        (typeof res === "string" && res) || res?.response || res?.answer || res?.message || res?.content || "";

      if (text) {
        setAnswer(text);
      } else {
        setError("The AI returned an empty response.");
      }
    } catch (err) {
      const response = err as {
        data?: { error?: string; detail?: string } | string;
        statusText?: string;
      };
      const detail =
        response?.data && typeof response.data === "object"
          ? response.data.error || response.data.detail
          : typeof response?.data === "string"
            ? response.data
            : response?.statusText;
      setError(detail || "Could not reach the local AI service. Check the workspace AI settings.");
    } finally {
      setIsSending(false);
    }
  }, [contextText, prompt, workspaceSlug]);

  if (!workspaceSlug || !pageId) return null;

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4">
      <div
        role="presentation"
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-in fade-in slide-in-from-bottom-2 pointer-events-auto w-full max-w-2xl rounded-2xl border border-subtle bg-surface-1 p-3 shadow-raised-200 duration-150"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full border border-subtle bg-layer-1 text-accent-primary">
              <Sparkles className="size-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-primary">Ask AI</div>
              <div className="truncate text-11 text-tertiary">
                {contextText ? "Using the current editor context" : "Always available while you write"}
              </div>
            </div>
          </div>
          {contextText && (
            <button
              type="button"
              onClick={() => {
                detailRef.current = {};
                setContext({});
              }}
              className="rounded-md px-2 py-1 text-11 text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
            >
              Clear context
            </button>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-subtle bg-layer-1 p-2">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={
              contextText ? "Tell AI how to help with this passage..." : "Ask AI anything about what you're writing..."
            }
            rows={2}
            className="text-sm w-full resize-none bg-transparent px-2 py-1 outline-none placeholder:text-placeholder"
          />
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-subtle pt-2">
            <div className="min-w-0 text-11 text-tertiary">
              {contextText ? (
                <span className="block truncate">Context: "{contextText.slice(0, 140)}"</span>
              ) : (
                "No selection required"
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSending || !prompt.trim()}
              className="bg-primary text-xs text-primary-foreground rounded-md px-3 py-1.5 font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSending ? "Asking..." : "Send"}
            </button>
          </div>
        </div>

        {(answer || error) && (
          <div
            className={`text-sm mt-3 rounded-xl border p-3 leading-6 ${
              error
                ? "border-danger-primary/30 bg-red-500/5 text-danger-primary"
                : "border-subtle bg-layer-1 text-secondary"
            }`}
          >
            <div className="max-h-52 overflow-y-auto whitespace-pre-wrap">{error ?? answer}</div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-subtle pt-3">
              <div className="truncate text-11 text-tertiary">{submittedFor ? `For: ${submittedFor}` : "Ask AI"}</div>
              {answer && (
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(answer);
                    setToast({
                      type: TOAST_TYPE.CURSOR_BUDDY_SUCCESS,
                      title: "Copied response",
                      message: "The AI answer is ready to paste into your document.",
                    });
                  }}
                  className="rounded-md px-2 py-1 text-11 text-tertiary transition-colors hover:bg-white/60 hover:text-primary"
                >
                  Copy
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 text-11 text-tertiary">Press `Cmd`/`Ctrl` + `Enter` to send.</div>
      </div>
    </div>
  );
});

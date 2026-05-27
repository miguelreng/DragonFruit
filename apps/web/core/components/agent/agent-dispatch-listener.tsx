/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ArrowUp, ArrowBendDownRight, ChevronDown, FileText, ListChecks, PenTool, Plus, Sparkles } from "@plane/icons";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { AgentChatService, type TAgentChatMessage, type TAgentChatSession } from "@/services/agent-chat.service";

type InvokeDetail = {
  paragraphText?: string;
  selectionText?: string;
  blockId?: string | null;
};

type TAIMode = "quick-ask" | "rewrite" | "plan" | "summarize";

type TDocChatMessage = {
  authorName?: string;
  content: string;
  id: string;
  pills?: string[];
  role: "assistant" | "error" | "user";
  copyable?: boolean;
};

const createInitialMessages = (): TDocChatMessage[] => [
  {
    content: "Atlas is ready for this doc. Tell me the topic, and I’ll help you shape it.",
    copyable: false,
    id: "doc-chat-starter",
    role: "assistant",
  },
];

const agentChatService = new AgentChatService();

const AI_MODES: {
  id: TAIMode;
  label: string;
  Icon: typeof Sparkles;
  placeholder: (hasContext: boolean) => string;
  buildTask: (hasContext: boolean) => string;
  buildPrompt: (input: string, context: string) => string;
}[] = [
  {
    id: "quick-ask",
    label: "Quick ask",
    Icon: Sparkles,
    placeholder: (hasContext) =>
      hasContext ? "Ask Atlas about this passage..." : "Ask Atlas about what you're writing...",
    buildTask: (hasContext) =>
      hasContext
        ? "Answer the user's question concisely and use the provided writing context when relevant."
        : "Answer the user's question concisely and practically.",
    buildPrompt: (input, context) => (context ? `${input}\n\nContext from the editor:\n${context}` : input),
  },
  {
    id: "rewrite",
    label: "Rewrite",
    Icon: PenTool,
    placeholder: (hasContext) =>
      hasContext ? "Describe how to rewrite it..." : "Paste or describe what you want rewritten...",
    buildTask: (hasContext) =>
      hasContext
        ? "Rewrite the provided text according to the user's request. Return clean, ready-to-use prose."
        : "Help the user rewrite text according to their request. Return clean, ready-to-use prose.",
    buildPrompt: (input, context) =>
      context ? `Rewrite request: ${input}\n\nText to rewrite:\n${context}` : `Rewrite request: ${input}`,
  },
  {
    id: "plan",
    label: "Plan",
    Icon: ListChecks,
    placeholder: (hasContext) =>
      hasContext ? "Turn this into a writing plan..." : "Topic or brief for the document...",
    buildTask: (hasContext) =>
      hasContext
        ? "Create a concise writing plan for the document. Return 4 to 6 short outline items, one per line, with no numbering. Each item should be a clear section or angle the user can write from, using the provided context."
        : "Create a concise writing plan for the document topic. Return 4 to 6 short outline items, one per line, with no numbering. Each item should be a clear section or angle the user can write from.",
    buildPrompt: (input, context) =>
      context
        ? `Document topic or brief: ${input}\n\nUse this writing context to shape the outline:\n${context}`
        : `Document topic or brief: ${input}`,
  },
  {
    id: "summarize",
    label: "Summarize",
    Icon: FileText,
    placeholder: (hasContext) => (hasContext ? "Summarize this section..." : "Ask Atlas to summarize your topic..."),
    buildTask: (hasContext) =>
      hasContext
        ? "Summarize the provided text clearly and briefly, focusing on the most important points."
        : "Provide a concise summary based on the user's request.",
    buildPrompt: (input, context) => (context ? `Summary request: ${input}\n\nText to summarize:\n${context}` : input),
  },
];

const cleanResponseLine = (line: string) =>
  line
    .trim()
    .replace(/^[-*•]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^"+|"+$/g, "");

const parseResponsePills = (text: string, mode: TAIMode) => {
  const lineItems = text
    .split(/\r?\n+/)
    .map(cleanResponseLine)
    .filter(Boolean);

  if (mode === "plan" && lineItems.length > 0) {
    return lineItems.slice(0, 6);
  }

  if (lineItems.length > 1) {
    return lineItems.slice(0, 6);
  }

  return [];
};

const mapChatMessageToDocMessage = (message: TAgentChatMessage): TDocChatMessage => {
  const content = message.error_message || message.content;
  const role = message.error_message ? "error" : message.role;

  return {
    authorName: message.role === "user" ? message.user_display_name : undefined,
    content,
    id: message.id,
    pills: role === "assistant" ? parseResponsePills(content, "quick-ask") : undefined,
    copyable: role === "assistant",
    role,
  };
};

/**
 * Renders the always-available floating Atlas bar for page editors.
 * Slash-command events can still prefill editor context, but the request
 * now goes through the app's first-party AI API instead of a workspace webhook.
 */
export const AgentDispatchListener = observer(function AgentDispatchListener() {
  const { workspaceSlug, projectId, pageId } = useParams() as {
    workspaceSlug?: string;
    projectId?: string;
    pageId?: string;
  };

  const [session, setSession] = useState<TAgentChatSession | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<TDocChatMessage[]>(createInitialMessages());
  const [context, setContext] = useState<InvokeDetail>({});
  const [mode, setMode] = useState<TAIMode>("quick-ask");
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const detailRef = useRef<InvokeDetail>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!modeMenuRef.current?.contains(event.target as Node)) {
        setIsModeMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!workspaceSlug || !projectId || !pageId) return;

    let isActive = true;

    async function loadDocSession() {
      setIsLoadingSession(true);
      setSession(null);
      setMessages(createInitialMessages());
      setPrompt("");

      try {
        const created = await agentChatService.createSession(workspaceSlug!, {
          scope_type: "page",
          page_id: pageId!,
          project_id: projectId!,
        });
        const detail = await agentChatService.getSession(workspaceSlug!, created.id, { project_id: projectId! });
        if (!isActive) return;

        setSession(detail.session);
        const loadedMessages = detail.messages.map(mapChatMessageToDocMessage);
        setMessages(loadedMessages.length > 0 ? loadedMessages : createInitialMessages());
      } catch (err) {
        if (!isActive) return;
        const response = err as { error?: string; detail?: string };
        setMessages([
          {
            content: response?.error || response?.detail || "Could not load this doc's Atlas conversation.",
            id: "doc-chat-load-error",
            role: "error",
          },
        ]);
      } finally {
        if (isActive) {
          setIsLoadingSession(false);
        }
      }
    }

    void loadDocSession();

    return () => {
      isActive = false;
    };
  }, [pageId, projectId, workspaceSlug]);

  const contextText = context.selectionText?.trim() || context.paragraphText?.trim() || "";
  const activeMode = AI_MODES.find((entry) => entry.id === mode) ?? AI_MODES[0]!;
  const ActiveModeIcon = activeMode.Icon;

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || !workspaceSlug || !projectId || !session) return;
    setIsSending(true);
    setPrompt("");
    const userMessageId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        content: trimmed,
        id: userMessageId,
        role: "user",
      },
    ]);
    try {
      const contextNote = [
        `Atlas writing mode: ${activeMode.label}.`,
        `Task: ${activeMode.buildTask(Boolean(contextText))}`,
        contextText ? `Editor context:\n${contextText}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const res = await agentChatService.sendMessage(workspaceSlug, session.id, trimmed, [], {
        project_id: projectId,
        tool_mode: "none",
        context_note: contextNote,
      });
      const text = res.assistant_message.error_message || res.assistant_message.content;

      if (text) {
        setMessages((current) => [
          ...current.map((message) =>
            message.id === userMessageId ? mapChatMessageToDocMessage(res.user_message) : message
          ),
          {
            ...mapChatMessageToDocMessage(res.assistant_message),
            pills: parseResponsePills(text, mode),
          },
        ]);
      } else {
        setMessages((current) => [
          ...current,
          {
            content: "Atlas returned an empty response.",
            id: crypto.randomUUID(),
            role: "error",
          },
        ]);
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
      setMessages((current) => [
        ...current,
        {
          content: detail || "Could not reach Atlas. Check the workspace AI settings.",
          id: crypto.randomUUID(),
          role: "error",
        },
      ]);
      setPrompt(trimmed);
    } finally {
      setIsSending(false);
    }
  }, [activeMode, contextText, mode, projectId, prompt, session, workspaceSlug]);

  if (!workspaceSlug || !projectId || !pageId) return null;

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[100] flex justify-center px-4">
      <div className="flex w-full max-w-2xl flex-col items-stretch gap-2">
        <div className="pointer-events-auto flex max-h-[40vh] flex-col gap-2 overflow-y-auto px-1 pb-1">
          {messages.map((message) => {
            if (message.role === "user") {
              return (
                <div
                  key={message.id}
                  className="mr-auto max-w-[80%] rounded-full border border-subtle bg-layer-1 px-3 py-2 text-[12px] leading-5 text-primary shadow-raised-100"
                >
                  {message.authorName && <span className="mr-1 text-tertiary">{message.authorName}</span>}
                  {message.content}
                </div>
              );
            }

            if (message.role === "error") {
              return (
                <div
                  key={message.id}
                  className="border-danger-primary/30 bg-red-500/5 ml-auto max-w-[85%] rounded-full border px-3 py-2 text-[12px] leading-5 text-danger-primary shadow-raised-100"
                >
                  {message.content}
                </div>
              );
            }

            return (
              <div key={message.id} className="ml-auto flex max-w-[85%] flex-col items-end gap-2">
                {message.pills?.length ? (
                  <div className="flex flex-col items-end gap-2">
                    {message.pills.map((_, index, pills) => {
                      const pill = pills[pills.length - 1 - index]!;
                      return (
                        <button
                          key={`${message.id}-${pill}`}
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(pill);
                            setToast({
                              type: TOAST_TYPE.CURSOR_BUDDY_SUCCESS,
                              title: "Copied suggestion",
                              message: "The Atlas writing cue is ready to paste into your document.",
                            });
                          }}
                          className="max-w-full rounded-full border border-subtle bg-surface-1 px-3 py-2 text-left text-[12px] text-secondary shadow-raised-100 transition-colors hover:bg-layer-1 hover:text-primary"
                        >
                          {pill}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="w-full rounded-2xl border border-subtle bg-surface-1 px-3 py-2 text-[12px] leading-5 whitespace-pre-wrap text-primary shadow-raised-100">
                    {message.content}
                  </div>
                )}
                {message.copyable !== false && (
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(message.content);
                      setToast({
                        type: TOAST_TYPE.CURSOR_BUDDY_SUCCESS,
                        title: "Copied full response",
                        message: "The full Atlas response is ready to paste into your document.",
                      });
                    }}
                    className="rounded-full border border-subtle bg-layer-1 px-3 py-2 text-[12px] text-tertiary transition-colors hover:bg-layer-2 hover:text-primary"
                  >
                    Copy all
                  </button>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div
          role="presentation"
          onMouseDown={(e) => e.stopPropagation()}
          className="animate-in fade-in slide-in-from-bottom-2 pointer-events-auto w-full rounded-[18px] border border-subtle bg-surface-1 px-3 py-2 shadow-raised-200 duration-150"
        >
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={activeMode.placeholder(Boolean(contextText))}
            rows={1}
            className="max-h-16 min-h-[22px] w-full resize-none bg-transparent text-[14px] leading-5 text-primary outline-none placeholder:text-placeholder/70"
          />

          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="text-sm flex min-w-0 items-center gap-1.5 text-tertiary">
              <button
                type="button"
                className="grid size-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-layer-1 hover:text-primary"
                aria-label="Add context"
              >
                <Plus className="size-2.5" />
              </button>
              <div ref={modeMenuRef} className="relative flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsModeMenuOpen((current) => !current)}
                  className="inline-flex items-center gap-1 rounded-full px-0.5 py-0.5 text-[12px] text-accent-primary transition-opacity hover:opacity-80"
                >
                  <ActiveModeIcon className="size-2.5" />
                  <span className="font-medium">{activeMode.label}</span>
                  <ChevronDown className="size-2.5" />
                </button>
                {isModeMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 min-w-36 rounded-xl border border-subtle bg-surface-1 p-1.5 shadow-raised-200">
                    {AI_MODES.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          setMode(entry.id);
                          setIsModeMenuOpen(false);
                        }}
                        className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors ${
                          entry.id === mode ? "bg-layer-1 text-primary" : "text-secondary hover:bg-layer-1"
                        }`}
                      >
                        <entry.Icon className="mr-1.5 size-3 shrink-0" />
                        {entry.label}
                      </button>
                    ))}
                  </div>
                )}
                {contextText && (
                  <button
                    type="button"
                    onClick={() => {
                      detailRef.current = {};
                      setContext({});
                    }}
                    className="truncate rounded-md px-1 py-0.5 text-[10px] transition-colors hover:bg-layer-1 hover:text-primary"
                  >
                    Clear context
                  </button>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <div className="hidden items-center gap-1 text-[10px] text-tertiary sm:flex">
                <ArrowBendDownRight className="size-2.5" />
                <span>Enter to send</span>
              </div>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSending || isLoadingSession || !session || !prompt.trim()}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-layer-2 text-primary transition-colors hover:bg-layer-3 disabled:opacity-50"
                aria-label="Send prompt"
              >
                {isSending || isLoadingSession ? (
                  <span className="text-xs leading-none">...</span>
                ) : (
                  <ArrowUp className="size-3.5" />
                )}
              </button>
            </div>
          </div>

          {contextText && (
            <div className="mt-1 truncate pl-0.5 text-[10px] text-tertiary">Context: "{contextText.slice(0, 96)}"</div>
          )}
        </div>
      </div>
    </div>
  );
});

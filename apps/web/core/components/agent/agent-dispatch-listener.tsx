/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { EditorRefApi } from "@plane/editor";
import { ChevronDown, Eraser, FileText, ListChecks, PenTool, Plus, Sparkles } from "@plane/icons";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { Loader } from "@plane/ui";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
import {
  AgentChatService,
  type TAgentChatMessage,
  type TAgentChatSession,
  type TAtlasDocWriteEvent,
  type TAtlasDocWriteIntent,
  type TAtlasDocWriteMode,
} from "@/services/agent-chat.service";

type InvokeDetail = {
  paragraphText?: string;
  selectionText?: string;
  blockId?: string | null;
  from?: number;
  to?: number;
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

const createInitialMessages = (): TDocChatMessage[] => [];

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
    .replace(/^#+\s*/, "")
    .replace(/^"+|"+$/g, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^__(.+)__$/, "$1")
    .replace(/^`(.+)`$/, "$1");

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

function isEditorWritingRequest(text: string): boolean {
  // Only brand-new task/sticky/note creation routes to the create_* tools. In a
  // doc, "crea/create … (an essay, a doc, a section)" means write content inline.
  if (/\b(create|make|add|crea|crear|nuev[ao]|new)\b.{0,80}\b(task|work item|sticky|note|tarea|nota)\b/i.test(text))
    return false;
  // Writing OR editing the current document (EN + ES) — kept broad on purpose so
  // "create/crea … / update my doc / actualiza el documento / amplía / continúa…" all land inline.
  return /\b(help\s+me\s+(?:to\s+)?write|write|draft|compose|generate|prepare|rewrite|replace|change|fix|correct|translate|turn\s+this\s+into|create|make|crea\b|crear\w*|update|expand|extend|continue|revise|edit|improve|polish|append|insert|summari[sz]e|outline|escr[ií]b\w*|red[aá]ct\w*|reescrib\w*|reemplaz\w*|sustitu\w*|cambi\w*|corrige\w*|corregir|traduce\w*|traducir|convierte\w*|convertir|comp[oó]n|componer|prepara\w*|genera\b|generar|gen[eé]rame|actualiz\w*|ampl[ií]a\w*|ampliar|exti[eé]nd\w*|extender|contin[uú]a\w*|continuar|revisa\w*|revisar|edita\w*|editar|mejora\w*|mejorar|completa\w*|completar|resum\w*|desarroll\w*|inserta\w*|insertar|a[ñn]ad\w*|agrega\w*|agregar)\b/i.test(
    text
  );
}

function isSelectionEditRequest(text: string): boolean {
  return /\b(replace|change|swap|rewrite|edit|revise|improve|polish|fix|correct|translate|make\s+it|turn\s+it\s+into|make\s+this|turn\s+this\s+into|reemplaz\w*|sustitu\w*|cambi\w*|pon\w*|haz(?:lo|la|le)?|hacerlo|vuelve\w*|convierte\w*|convertir|corrige\w*|corregir|traduce\w*|traducir|reescrib\w*|edita\w*|editar|mejora\w*|mejorar|otra\s+palabra|m[aá]s\s+(?:formal|claro|clara|breve|corto|corta|largo|larga|simple|natural))\b/i.test(
    text
  );
}

function inferDocWriteIntent(text: string): TAtlasDocWriteIntent {
  if (/\b(delete|remove|erase|elimina\w*|borrar|borra\w*|quita\w*|remueve\w*)\b/i.test(text)) return "delete";
  if (
    /\b(replace|replace\s+entire|replace\s+all|swap|overwrite|change|reescrib\w*|reemplaz\w*|sustitu\w*|cambi\w*|otra\s+palabra)\b/i.test(
      text
    )
  )
    return "replace";
  if (/\b(append|insert|add|continue|inserta\w*|insertar|a[ñn]ad\w*|agrega\w*|contin[uú]a\w*)\b/i.test(text))
    return "insert";
  return "update";
}

type TStreamDocReviewArgs = {
  activePageEditorRef: EditorRefApi;
  anchorPos?: number;
  pageId: string;
  projectId?: string;
  prompt: string;
  selectionText?: string;
  sessionId: string;
  setMessages: Dispatch<SetStateAction<TDocChatMessage[]>>;
  userMessageId: string;
  workspaceSlug: string;
};

async function streamDocReview(args: TStreamDocReviewArgs) {
  const {
    activePageEditorRef,
    anchorPos,
    pageId,
    projectId,
    prompt,
    selectionText,
    sessionId,
    setMessages,
    userMessageId,
    workspaceSlug,
  } = args;
  const editorDocument = activePageEditorRef.getDocument();
  const documentMarkdown = activePageEditorRef.getMarkDown();
  const cursorPosition = anchorPos ?? activePageEditorRef.getCurrentCursorPosition();
  const mode: TAtlasDocWriteMode = documentMarkdown.trim().length > 0 ? "update" : "create";
  const intent = mode === "create" ? "insert" : inferDocWriteIntent(prompt);
  let streamError: string | null = null;
  let receivedProposal = false;

  activePageEditorRef.startAtlasReviewSession({
    id: `local-atlas-doc-write-${Date.now()}`,
    mode,
    anchorPos: cursorPosition,
  });

  try {
    await agentChatService.streamDocWrite(
      workspaceSlug,
      sessionId,
      {
        page_id: pageId,
        project_id: projectId,
        prompt,
        mode,
        intent,
        cursor_position: cursorPosition,
        selection_text: selectionText ?? activePageEditorRef.getSelectedText(),
        document_markdown: documentMarkdown,
        document_json: editorDocument.json,
      },
      (event: TAtlasDocWriteEvent) => {
        if (event.event === "session_started") {
          activePageEditorRef.startAtlasReviewSession({
            id: event.session_id,
            mode: event.mode,
            anchorPos: cursorPosition,
          });
          setMessages((current) =>
            current.map((message) =>
              message.id === userMessageId ? mapChatMessageToDocMessage(event.user_message) : message
            )
          );
        } else if (event.event === "proposal_started") {
          receivedProposal = true;
          activePageEditorRef.appendAtlasProposal({
            id: event.proposal_id,
            operation: event.operation,
            status: "streaming",
            anchorPos: cursorPosition,
            targetBlockId: event.target_block_id || undefined,
            targetOriginalText: event.target_original_text || undefined,
            contentText: "",
            contentHtml: "",
          });
        } else if (event.event === "proposal_delta") {
          activePageEditorRef.updateAtlasProposal(event.proposal_id, {
            contentText: event.content_text,
            contentHtml: event.content_html,
            status: "streaming",
          });
        } else if (event.event === "proposal_completed") {
          activePageEditorRef.updateAtlasProposal(event.proposal_id, {
            status: "pending",
            contentText: event.content_text,
            contentHtml: event.content_html,
            targetBlockId: event.target_block_id || undefined,
            targetOriginalText: event.target_original_text || undefined,
          });
        } else if (event.event === "session_completed") {
          activePageEditorRef.setAtlasReviewLoading(false);
          setMessages((current) => [...current, mapChatMessageToDocMessage(event.assistant_message)]);
        } else if (event.event === "error") {
          streamError = event.error;
        }
      }
    );
  } catch (error) {
    if (!receivedProposal) activePageEditorRef.rejectAllAtlasProposals();
    throw error;
  }

  if (streamError) {
    if (!receivedProposal) activePageEditorRef.rejectAllAtlasProposals();
    throw new Error(streamError);
  }

  setToast({
    type: TOAST_TYPE.CURSOR_BUDDY_SUCCESS,
    title: "Atlas drafted edits",
    message: "Review them inline, then accept or reject each paragraph.",
  });
}

/**
 * Renders the floating Atlas bar for doc page editors.
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
  const [messages, setMessages] = useState<TDocChatMessage[]>([]);
  const [context, setContext] = useState<InvokeDetail>({});
  const [mode, setMode] = useState<TAIMode>("quick-ask");
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [pendingProposals, setPendingProposals] = useState(0);
  const [isDrafting, setIsDrafting] = useState(false);
  // Two-step inline confirm for the destructive "clear conversation".
  const [confirmingClear, setConfirmingClear] = useState(false);
  const detailRef = useRef<InvokeDetail>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const projectPages = usePageStore(EPageStoreType.PROJECT);
  const activePage = pageId ? projectPages.getPageById(pageId) : undefined;
  const isDocPage = activePage?.page_type === "doc";
  const activePageEditorRef = activePage?.editor.editorRef ?? null;

  useEffect(() => {
    if (!isDocPage) return;

    function onInvoke(e: Event) {
      const ce = e as CustomEvent<InvokeDetail>;
      detailRef.current = ce.detail ?? {};
      setContext(detailRef.current);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    window.addEventListener("dragonfruit:agent-invoke", onInvoke);
    return () => window.removeEventListener("dragonfruit:agent-invoke", onInvoke);
  }, [isDocPage]);

  useEffect(() => {
    if (!isDocPage) return;

    function onReplyToSelection(e: Event) {
      const detail = (e as CustomEvent<{ text?: string; from?: number; to?: number }>).detail;
      const text = detail?.text?.trim();
      if (!text) return;

      const nextContext: InvokeDetail = {
        selectionText: text,
        from: detail.from,
        to: detail.to,
      };
      detailRef.current = nextContext;
      setContext(nextContext);
      setMode("quick-ask");
      requestAnimationFrame(() => textareaRef.current?.focus());
    }

    window.addEventListener("dragonfruit:reply-to-selection", onReplyToSelection);
    return () => window.removeEventListener("dragonfruit:reply-to-selection", onReplyToSelection);
  }, [isDocPage]);

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

  // Track how many Atlas proposals are still awaiting review so the bar can
  // surface bulk Accept all / Reject all only while there's something pending.
  useEffect(() => {
    if (!isDocPage || !activePageEditorRef) {
      setPendingProposals(0);
      return;
    }
    const sync = () => setPendingProposals(activePageEditorRef.getActiveAtlasProposalCount());
    sync();
    const unsubscribe = activePageEditorRef.onStateChange?.(sync);
    return () => unsubscribe?.();
  }, [activePageEditorRef, isDocPage]);

  useEffect(() => {
    if (!workspaceSlug || !projectId || !pageId || !isDocPage) return;

    let isActive = true;

    async function loadDocSession() {
      setIsLoadingSession(true);
      setSession(null);
      setMessages([]);
      setPrompt("");
      setConfirmingClear(false);

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
  }, [isDocPage, pageId, projectId, workspaceSlug]);

  const contextText = context.selectionText?.trim() || context.paragraphText?.trim() || "";
  const activeMode = AI_MODES.find((entry) => entry.id === mode) ?? AI_MODES[0]!;
  const ActiveModeIcon = activeMode.Icon;
  const shouldShowConversationLoader = isLoadingSession && messages.length === 0;
  // Live hint: when what's typed reads as a doc-writing action (and there's a
  // page to write into), the mode chip flips to "Writing" so the user knows it
  // will land in the document rather than answer in chat.
  const isWriteIntent =
    Boolean(activePageEditorRef) &&
    (isEditorWritingRequest(prompt.trim()) || Boolean(context.selectionText && isSelectionEditRequest(prompt.trim())));

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
      const shouldWriteIntoEditor = Boolean(
        activePageEditorRef &&
        (isEditorWritingRequest(trimmed) || Boolean(context.selectionText && isSelectionEditRequest(trimmed)))
      );

      if (shouldWriteIntoEditor && activePageEditorRef && pageId) {
        setIsDrafting(true);
        await streamDocReview({
          activePageEditorRef,
          anchorPos: context.from,
          pageId,
          projectId,
          prompt: trimmed,
          selectionText: context.selectionText,
          sessionId: session.id,
          setMessages,
          userMessageId,
          workspaceSlug,
        });
        return;
      }

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
            : err instanceof Error
              ? err.message
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
      setIsDrafting(false);
    }
  }, [
    activeMode,
    activePageEditorRef,
    context.from,
    context.selectionText,
    contextText,
    mode,
    pageId,
    projectId,
    prompt,
    session,
    workspaceSlug,
  ]);

  // Clear conversation — destructive. The chat messages go away for good
  // but whatever Atlas wrote lives in the document, so the result stays.
  // Page sessions are get-or-create by page, so we must delete the old
  // session *before* recreating, otherwise the create would just return
  // the same (still-undeleted) session.
  const handleClearConversation = useCallback(async () => {
    if (!workspaceSlug || !projectId || !pageId) return;
    // Keep the result: bake any still-pending Atlas edits into the doc.
    if (activePageEditorRef && activePageEditorRef.getActiveAtlasProposalCount() > 0) {
      activePageEditorRef.acceptAllAtlasProposals();
    }
    const previous = session;
    setConfirmingClear(false);
    setMessages([]);
    setSession(null);
    setIsLoadingSession(true);
    try {
      if (previous) await agentChatService.deleteSession(workspaceSlug, previous.id);
      const created = await agentChatService.createSession(workspaceSlug, {
        scope_type: "page",
        page_id: pageId,
        project_id: projectId,
      });
      setSession(created);
    } catch (err) {
      const response = err as { error?: string; detail?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't clear the conversation",
        message: response?.error || response?.detail || "Try again.",
      });
    } finally {
      setIsLoadingSession(false);
    }
  }, [activePageEditorRef, pageId, projectId, session, workspaceSlug]);

  if (!workspaceSlug || !projectId || !pageId || !isDocPage) return null;

  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4">
      <div className="relative isolate w-full">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-4 -top-24 -bottom-10 h-auto [background:linear-gradient(to_bottom,transparent_0%,var(--bg-surface-1)_68%,var(--bg-surface-1)_100%),radial-gradient(150%_130%_at_50%_100%,var(--bg-surface-1)_45%,transparent_75%)] dark:[background:linear-gradient(to_bottom,transparent_0%,rgba(12,10,10,0.7)_58%,oklch(0.17_0.01_0)_100%),radial-gradient(150%_130%_at_50%_100%,oklch(0.17_0.01_0)_34%,rgba(12,10,10,0.82)_54%,transparent_78%)]"
        />
        <div className="relative mx-auto flex w-full max-w-2xl flex-col items-stretch gap-2">
          <div className="relative">
            <div className="pointer-events-auto flex max-h-[12vh] flex-col gap-1.5 overflow-y-auto px-1 pt-4 pb-1 [box-shadow:inset_0_18px_14px_-12px_rgba(255,255,255,0.95)] dark:[box-shadow:inset_0_18px_16px_-12px_rgba(0,0,0,0.72)]">
              {shouldShowConversationLoader ? (
                <div className="mr-auto flex max-w-[78%] items-center gap-2 rounded-full border border-subtle bg-surface-1 px-3 py-2 shadow-raised-100">
                  <Loader className="flex items-center gap-1.5">
                    <Loader.Item className="rounded-full" width="5px" height="5px" />
                    <Loader.Item className="rounded-full" width="5px" height="5px" />
                    <Loader.Item className="rounded-full" width="5px" height="5px" />
                  </Loader>
                </div>
              ) : (
                messages.map((message) => {
                  if (message.role === "user") {
                    return (
                      <div
                        key={message.id}
                        className="mr-auto max-w-[80%] rounded-[18px] border border-subtle bg-layer-1 px-3 py-2 text-[12px] leading-5 break-words whitespace-pre-wrap text-primary shadow-raised-100"
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
                        className="border-danger-primary/30 bg-red-500/5 ml-auto max-w-[85%] rounded-[18px] border px-3 py-2 text-[12px] leading-5 break-words whitespace-pre-wrap text-danger-primary shadow-raised-100"
                      >
                        {message.content}
                      </div>
                    );
                  }

                  return (
                    <div key={message.id} className="ml-auto flex max-w-[85%] min-w-0 flex-col items-end gap-2">
                      {message.pills?.length ? (
                        <div className="flex w-full min-w-0 flex-col items-end gap-2">
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
                                className="max-w-full rounded-[18px] border border-subtle bg-surface-1 px-3 py-2 text-left text-[12px] break-words whitespace-pre-wrap text-secondary shadow-raised-100 transition-colors hover:bg-layer-1 hover:text-primary"
                              >
                                {pill}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[12px] leading-5 break-words whitespace-pre-wrap text-primary shadow-raised-100">
                          {message.content}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {isSending && !isDrafting && (
                <div className="ml-auto flex max-w-[85%] items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-2 shadow-raised-100">
                  <Loader className="flex items-center gap-1.5">
                    <Loader.Item className="rounded-full" width="5px" height="5px" />
                    <Loader.Item className="rounded-full" width="5px" height="5px" />
                    <Loader.Item className="rounded-full" width="5px" height="5px" />
                  </Loader>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            {messages.length > 1 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-surface-1/0 via-surface-1/50 to-transparent dark:from-transparent dark:via-black/35"
              />
            )}
            {messages.length > 0 && !shouldShowConversationLoader && (
              <div className="pointer-events-auto absolute top-0 right-1 z-10">
                {confirmingClear ? (
                  <div className="flex items-center gap-0.5 rounded-full border border-subtle bg-surface-1 py-0.5 pr-0.5 pl-2 shadow-raised-100">
                    <span className="text-[11px] text-tertiary">Clear chat?</span>
                    <button
                      type="button"
                      onClick={() => void handleClearConversation()}
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium text-danger-primary transition-colors hover:bg-layer-1"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingClear(false)}
                      className="rounded-full px-2 py-0.5 text-[11px] text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingClear(true)}
                    className="grid size-6 place-items-center rounded-full border border-subtle bg-surface-1 text-tertiary shadow-raised-100 transition-colors hover:text-primary"
                    aria-label="Clear conversation"
                    title="Clear conversation"
                  >
                    <Eraser className="size-3" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div
            role="presentation"
            onMouseDown={(e) => e.stopPropagation()}
            className="animate-in fade-in slide-in-from-bottom-2 pointer-events-auto relative w-full rounded-[18px] border border-subtle bg-surface-1/72 px-3 py-1.5 shadow-raised-200 backdrop-blur-sm duration-150"
          >
            {/* Gradient carries its own rounding so the bar itself can stay
                overflow-visible — otherwise the mode menu (which opens upward
                with `bottom-full`) gets clipped at the bar's top edge. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[18px] bg-gradient-to-b from-surface-1/0 via-surface-1/35 to-surface-1/90 dark:from-transparent dark:via-black/10 dark:to-black/30"
            />
            {isDrafting ? (
              <div className="relative mb-1 flex items-center gap-2 border-b border-subtle pb-1.5">
                <span className="text-[11px] text-tertiary">Atlas is drafting</span>
                <span className="flex items-center gap-0.5">
                  <span className="size-1 animate-bounce rounded-full bg-accent-primary" />
                  <span className="size-1 animate-bounce rounded-full bg-accent-primary [animation-delay:0.15s]" />
                  <span className="size-1 animate-bounce rounded-full bg-accent-primary [animation-delay:0.3s]" />
                </span>
              </div>
            ) : pendingProposals > 0 ? (
              <div className="relative mb-1 flex items-center gap-2 border-b border-subtle pb-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] text-tertiary">
                  {pendingProposals} {pendingProposals === 1 ? "edit" : "edits"} awaiting review
                </span>
                <button
                  type="button"
                  onClick={() => activePageEditorRef?.acceptAllAtlasProposals()}
                  className="inline-flex h-6 shrink-0 items-center rounded-full bg-accent-primary px-2.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  Accept all
                </button>
                <button
                  type="button"
                  onClick={() => activePageEditorRef?.rejectAllAtlasProposals()}
                  className="inline-flex h-6 shrink-0 items-center rounded-full border border-subtle px-2.5 text-[11px] font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                >
                  Reject all
                </button>
              </div>
            ) : null}
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

            <div className="relative my-0.5 flex items-center justify-between gap-1.5">
              <div className="text-sm flex min-w-0 items-center gap-1 text-tertiary">
                <button
                  type="button"
                  className="grid size-6 shrink-0 place-items-center rounded-full border border-subtle bg-layer-2 text-tertiary transition-colors hover:bg-layer-3 hover:text-primary"
                  aria-label="Add context"
                  title="Add context"
                >
                  <Plus className="size-3" />
                </button>
                <div ref={modeMenuRef} className="relative flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsModeMenuOpen((current) => !current)}
                    className={`inline-flex items-center gap-1 rounded-full px-0.5 py-0 text-[12px] transition-opacity hover:opacity-80 ${
                      isWriteIntent ? "text-accent-primary" : "text-tertiary"
                    }`}
                  >
                    {isWriteIntent ? <PenTool className="size-3.5" /> : <ActiveModeIcon className="size-3.5" />}
                    <span className="font-medium">{isWriteIntent ? "Writing" : activeMode.label}</span>
                    <ChevronDown className="size-3" />
                  </button>
                  {isModeMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-1.5 min-w-36 rounded-xl border border-subtle bg-surface-1 p-1.5 shadow-raised-200">
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
                      className="truncate rounded-lg px-1 py-0.5 text-[10px] transition-colors hover:bg-layer-1 hover:text-primary"
                    >
                      Clear context
                    </button>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <div className="hidden items-center gap-1 text-[10px] text-tertiary sm:flex">
                  <span>Enter to send</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={isSending || isLoadingSession || !session || !prompt.trim()}
                  className="inline-flex h-7 shrink-0 items-center rounded-lg border border-subtle bg-layer-2 px-2.5 text-[12px] font-medium text-primary transition-colors hover:bg-layer-3 disabled:opacity-50"
                  aria-label="Send prompt"
                >
                  {isSending || isLoadingSession ? (
                    <span className="text-xs leading-none">...</span>
                  ) : (
                    <span>Send</span>
                  )}
                </button>
              </div>
            </div>

            {contextText && (
              <div className="relative mt-1 truncate pl-0.5 text-[10px] text-tertiary">
                Replying to selection: "{contextText.slice(0, 96)}"
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

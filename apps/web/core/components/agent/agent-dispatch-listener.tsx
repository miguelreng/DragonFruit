/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import MarkdownIt from "markdown-it";
import type { EditorRefApi } from "@plane/editor";
import {
  ChevronDown,
  Eraser,
  FileText,
  Link,
  ListChecks,
  Paperclip,
  PenTool,
  Plus,
  Sparkles,
  Whiteboard,
  X,
} from "@/components/icons/lucide-shim";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { Loader } from "@plane/ui";
import {
  AGENT_CHAT_ACCEPTED_FILE_TYPES,
  AGENT_CHAT_MAX_FILE_BYTES,
  buildPendingAgentChatFiles,
  fileToAgentChatAttachmentPayload,
  formatAgentChatFileSize,
  type TPendingAgentChatFile,
} from "@/helpers/agent-chat-attachments";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
import {
  AgentChatService,
  type TAgentChatAttachmentPayload,
  type TAgentChatMessage,
  type TAgentChatSession,
  type TAtlasDocWriteEvent,
  type TAtlasDocWriteIntent,
  type TAtlasDocWriteMode,
} from "@/services/agent-chat.service";
import { BookmarkService } from "@/services/bookmark.service";
import { IssueService } from "@/services/issue";
import { ProjectPageService } from "@/services/page";
import { WorkspaceService } from "@/services/workspace.service";
import {
  bookmarkToMentionedReference,
  bookmarkToReferenceContextContent,
  buildAtlasReferencesContext,
  extractAtlasMentionTokens,
  getAtlasMentionMatch,
  getAtlasReferenceTypeLabel,
  getAtlasPromptHighlightParts,
  htmlToPlainText,
  issueSearchResponseToMentionedReference,
  issueToReferenceContextContent,
  pageSearchResponseToMentionedReference,
  referenceIdentity,
  type TAtlasReferenceContextSource,
  type TAtlasMentionedReference,
  type TAtlasMentionMatch,
  whiteboardJsonToPlainText,
} from "./atlas-doc-mentions";

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
const bookmarkService = new BookmarkService();
const issueService = new IssueService();
const projectPageService = new ProjectPageService();
const workspaceService = new WorkspaceService();

// Atlas streams its drafts as Markdown, but the editor's doc-review proposals are
// inserted by parsing HTML. Convert the Markdown to HTML here so "# heading",
// "**bold**", "1. item" become real heading/bold/list nodes instead of literal
// characters. html:false keeps any raw HTML in the model output escaped (safe).
const markdownRenderer = new MarkdownIt({ html: false, linkify: true, breaks: false });
const atlasMarkdownToHtml = (text: string | undefined): string => {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";
  return markdownRenderer.render(trimmed);
};

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

const getAtlasReferenceIcon = (type: TAtlasMentionedReference["type"]) => {
  switch (type) {
    case "bookmark":
      return Link;
    case "task":
      return ListChecks;
    case "whiteboard":
      return Whiteboard;
    case "doc":
    default:
      return FileText;
  }
};

type TAtlasReferenceContextOverrides = {
  content: string;
  details?: string[];
  projectId?: string;
  subtitle?: string;
  title?: string;
  type?: TAtlasMentionedReference["type"];
  url?: string;
  workspaceSlug?: string;
};

const buildAtlasReferenceContextSource = (
  reference: TAtlasMentionedReference,
  overrides: TAtlasReferenceContextOverrides
): TAtlasReferenceContextSource => ({
  content: overrides.content,
  details: overrides.details,
  id: reference.id,
  insertText: reference.insertText,
  projectId: overrides.projectId ?? reference.projectId,
  subtitle: overrides.subtitle ?? reference.subtitle,
  title: overrides.title ?? reference.title,
  type: overrides.type ?? reference.type,
  url: overrides.url ?? reference.url,
  workspaceSlug: overrides.workspaceSlug ?? reference.workspaceSlug,
});

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
  return /\b(help\s+me\s+(?:to\s+)?write|write|draft|compose|generate|prepare|rewrite|replace|change|fix|correct|translate|turn\s+this\s+into|create|make|crea\b|crear\w*|update|expand|extend|continue|revise|edit|improve|polish|add|append|insert|summari[sz]e|outline|escr[ií]b\w*|red[aá]ct\w*|reescrib\w*|reemplaz\w*|sustitu\w*|cambi\w*|corrige\w*|corregir|traduce\w*|traducir|convierte\w*|convertir|comp[oó]n|componer|prepara\w*|genera\b|generar|gen[eé]rame|actualiz\w*|ampl[ií]a\w*|ampliar|exti[eé]nd\w*|extender|contin[uú]a\w*|continuar|revisa\w*|revisar|edita\w*|editar|mejora\w*|mejorar|completa\w*|completar|resum\w*|desarroll\w*|inserta\w*|insertar|a[ñn]ad\w*|agrega\w*|agregar)\b/i.test(
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
  contextNote?: string;
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
    contextNote,
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
        context_note: contextNote,
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
            // Render from the Markdown source so formatting (headings, bold,
            // lists) is applied instead of inserted as literal characters.
            contentHtml: atlasMarkdownToHtml(event.content_text),
            status: "streaming",
          });
        } else if (event.event === "proposal_completed") {
          activePageEditorRef.updateAtlasProposal(event.proposal_id, {
            status: "pending",
            contentText: event.content_text,
            contentHtml: atlasMarkdownToHtml(event.content_text),
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

function PendingFileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <li className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-subtle bg-layer-1 px-1.5 py-0.5 text-[11px]">
      <FileText className="size-3 shrink-0 text-tertiary" />
      <span className="min-w-0 truncate text-primary">{file.name}</span>
      <span className="shrink-0 text-tertiary">{formatAgentChatFileSize(file.size)}</span>
      <button
        type="button"
        onClick={onRemove}
        className="grid size-4 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-primary"
        aria-label={`Remove ${file.name}`}
      >
        <X className="size-3" />
      </button>
    </li>
  );
}

/**
 * Renders the floating Atlas bar for doc page editors.
 * Slash-command events can still prefill editor context, but the request
 * now goes through the app's first-party AI API instead of a workspace webhook.
 */
type TAgentDispatchListenerProps = {
  // Optional override for routes that render a doc page but don't carry :pageId
  // in the URL (e.g. the project Brief, which resolves its backing page id).
  pageId?: string;
};

export const AgentDispatchListener = observer(function AgentDispatchListener(props: TAgentDispatchListenerProps) {
  const { pageId: pageIdOverride } = props;
  const params = useParams() as {
    workspaceSlug?: string;
    projectId?: string;
    pageId?: string;
  };
  const { workspaceSlug, projectId } = params;
  const pageId = pageIdOverride ?? params.pageId;

  const [session, setSession] = useState<TAgentChatSession | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<TDocChatMessage[]>([]);
  const [context, setContext] = useState<InvokeDetail>({});
  const [mode, setMode] = useState<TAIMode>("quick-ask");
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [pendingProposals, setPendingProposals] = useState(0);
  const [selectedProposals, setSelectedProposals] = useState(0);
  const [isDrafting, setIsDrafting] = useState(false);
  // Two-step inline confirm for the destructive "clear conversation".
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [docMentionMatch, setDocMentionMatch] = useState<TAtlasMentionMatch | null>(null);
  const [docMentionResults, setDocMentionResults] = useState<TAtlasMentionedReference[]>([]);
  const [docMentionIndex, setDocMentionIndex] = useState(0);
  const [isSearchingDocs, setIsSearchingDocs] = useState(false);
  const [docMentionError, setDocMentionError] = useState<string | null>(null);
  const [mentionedDocs, setMentionedDocs] = useState<TAtlasMentionedReference[]>([]);
  const [pendingFiles, setPendingFiles] = useState<TPendingAgentChatFile[]>([]);
  const detailRef = useRef<InvokeDetail>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  // Snapshot of the document HTML captured at the start of each Atlas doc-write
  // session. Used by "Discard Atlas changes" to revert in place via
  // replaceProviderDocumentFromHTML. Cleared after discard / accept-all / reject-all.
  const atlasSnapshotRef = useRef<string | null>(null);
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

  // Track how many proposals are individually selected so the bar can surface
  // Accept/Reject selected when ≥1 is checked.
  useEffect(() => {
    if (!isDocPage || !activePageEditorRef) {
      setSelectedProposals(0);
      return;
    }
    const sync = () => setSelectedProposals(activePageEditorRef.getSelectedAtlasProposalCount?.() ?? 0);
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

  const searchMentionReferences = useCallback(
    async (query: string) => {
      if (!workspaceSlug || !projectId) return [];

      let hadError = false;
      const [entityResponse, bookmarkResponse] = await Promise.all([
        workspaceService
          .searchEntity(workspaceSlug, {
            count: 8,
            project_id: projectId,
            query,
            query_type: ["page", "issue"],
          })
          .catch(() => {
            hadError = true;
            return { issue: [], page: [] };
          }),
        bookmarkService.listProjectBookmarks(workspaceSlug, projectId, { query }).catch(() => {
          hadError = true;
          return { results: [] };
        }),
      ]);

      const references = [
        ...(entityResponse.issue ?? [])
          .map(issueSearchResponseToMentionedReference)
          .filter((reference): reference is TAtlasMentionedReference => !!reference),
        ...(entityResponse.page ?? [])
          .map(pageSearchResponseToMentionedReference)
          .filter((reference): reference is TAtlasMentionedReference => !!reference),
        ...(bookmarkResponse.results ?? [])
          .slice(0, 8)
          .map(bookmarkToMentionedReference)
          .filter((reference): reference is TAtlasMentionedReference => !!reference),
      ];

      const uniqueReferences = references.filter(
        (reference, index, list) =>
          list.findIndex((entry) => referenceIdentity(entry) === referenceIdentity(reference)) === index
      );
      if (hadError && uniqueReferences.length === 0) throw new Error("Could not search references.");
      return uniqueReferences.slice(0, 12);
    },
    [projectId, workspaceSlug]
  );

  useEffect(() => {
    if (!workspaceSlug || !projectId || !docMentionMatch) {
      setDocMentionResults([]);
      setDocMentionError(null);
      setIsSearchingDocs(false);
      return;
    }

    let isActive = true;
    setIsSearchingDocs(true);
    setDocMentionError(null);

    const handle = window.setTimeout(async () => {
      const query = docMentionMatch.query.trim();
      const fallbackQuery = query.replace(/[-_]+/g, " ").trim();

      try {
        let references = await searchMentionReferences(query);

        if (references.length === 0 && fallbackQuery && fallbackQuery !== query) {
          references = await searchMentionReferences(fallbackQuery);
        }

        if (!isActive) return;
        setDocMentionResults(references);
        setDocMentionIndex(0);
      } catch {
        if (!isActive) return;
        setDocMentionResults([]);
        setDocMentionError("Could not search references.");
      } finally {
        if (isActive) setIsSearchingDocs(false);
      }
    }, 180);

    return () => {
      isActive = false;
      window.clearTimeout(handle);
    };
  }, [docMentionMatch, projectId, searchMentionReferences, workspaceSlug]);

  useEffect(() => {
    setMentionedDocs((current) => current.filter((doc) => prompt.includes(doc.insertText)));
  }, [prompt]);

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
  const selectedDocMention = docMentionResults[docMentionIndex] ?? docMentionResults[0];
  const isDocMentionPickerOpen = Boolean(
    docMentionMatch &&
    (isSearchingDocs || docMentionResults.length > 0 || docMentionError || docMentionMatch.query.trim())
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [prompt]);

  const syncDocMentionMatch = useCallback((value: string, cursorPosition: number | null | undefined) => {
    const nextMatch = getAtlasMentionMatch(value, cursorPosition);
    setDocMentionMatch((current) => {
      if (!current && !nextMatch) return current;
      if (
        current &&
        nextMatch &&
        current.from === nextMatch.from &&
        current.to === nextMatch.to &&
        current.query === nextMatch.query
      )
        return current;
      return nextMatch;
    });
  }, []);

  const insertDocMentionTrigger = useCallback(() => {
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? prompt.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const needsLeadingSpace = selectionStart > 0 && !/\s/.test(prompt[selectionStart - 1] ?? "");
    const insertText = needsLeadingSpace ? " @" : "@";
    const nextPrompt = `${prompt.slice(0, selectionStart)}${insertText}${prompt.slice(selectionEnd)}`;
    const nextCursor = selectionStart + insertText.length;

    setPrompt(nextPrompt);
    syncDocMentionMatch(nextPrompt, nextCursor);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }, [prompt, syncDocMentionMatch]);

  const handleAttach = useCallback(
    (filesList: FileList | null) => {
      if (!filesList || filesList.length === 0) return;
      const { accepted, rejectedSize } = buildPendingAgentChatFiles(filesList, pendingFiles.length);
      if (rejectedSize > 0) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "File too large",
          message: `Files over ${Math.round(AGENT_CHAT_MAX_FILE_BYTES / 1_000_000)} MB were skipped.`,
        });
      }
      if (accepted.length > 0) setPendingFiles((current) => [...current, ...accepted]);
    },
    [pendingFiles.length]
  );

  const handleRemovePendingFile = useCallback((id: string) => {
    setPendingFiles((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const selectDocMention = useCallback(
    (doc: TAtlasMentionedReference | undefined) => {
      if (!docMentionMatch || !doc) return;

      const insertText = `${doc.insertText} `;
      const nextPrompt = `${prompt.slice(0, docMentionMatch.from)}${insertText}${prompt
        .slice(docMentionMatch.to)
        .replace(/^\s+/, "")}`;
      const nextCursor = docMentionMatch.from + insertText.length;

      setPrompt(nextPrompt);
      setMentionedDocs((current) =>
        current.some((entry) => referenceIdentity(entry) === referenceIdentity(doc)) ? current : [...current, doc]
      );
      setDocMentionMatch(null);
      setDocMentionResults([]);
      setDocMentionError(null);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [docMentionMatch, prompt]
  );

  const resolvePromptMentionedDocs = useCallback(
    async (text: string, selectedDocs: TAtlasMentionedReference[]) => {
      if (!workspaceSlug || !projectId) return selectedDocs;

      const selectedTokens = new Set(selectedDocs.map((doc) => doc.insertText));
      const unresolvedTokens = extractAtlasMentionTokens(text).filter((token) => !selectedTokens.has(token));
      if (unresolvedTokens.length === 0) return selectedDocs;

      const resolvedDocs = await Promise.all(
        unresolvedTokens.map(async (token) => {
          const query = token.slice(1).trim();
          const fallbackQuery = query.replace(/[-_]+/g, " ").trim();
          try {
            let references = await searchMentionReferences(query);

            if (references.length === 0 && fallbackQuery && fallbackQuery !== query) {
              references = await searchMentionReferences(fallbackQuery);
            }

            return references.find((reference) => reference.insertText === token) ?? references[0] ?? null;
          } catch {
            return null;
          }
        })
      );

      const docs = [...selectedDocs, ...resolvedDocs.filter((doc): doc is TAtlasMentionedReference => !!doc)];
      return docs.filter(
        (doc, index, list) => list.findIndex((entry) => referenceIdentity(entry) === referenceIdentity(doc)) === index
      );
    },
    [projectId, searchMentionReferences, workspaceSlug]
  );

  const resolveMentionedDocsContext = useCallback(
    async (docs: TAtlasMentionedReference[]) => {
      if (!workspaceSlug || !projectId || docs.length === 0) return "";

      const uniqueDocs = docs.filter(
        (doc, index, list) => list.findIndex((entry) => referenceIdentity(entry) === referenceIdentity(doc)) === index
      );
      const sources = await Promise.all(
        uniqueDocs.map(async (doc) => {
          try {
            if (doc.type === "task") {
              const issue = await issueService.retrieve(workspaceSlug, doc.projectId ?? projectId, doc.id);
              const identifier = [doc.subtitle, issue.sequence_id ? `#${issue.sequence_id}` : ""]
                .filter(Boolean)
                .join(" ");
              return buildAtlasReferenceContextSource(doc, {
                content: issueToReferenceContextContent(issue),
                details: [
                  identifier,
                  issue.priority ? `Priority: ${issue.priority}` : "",
                  issue.state_id ? `State ID: ${issue.state_id}` : "",
                  issue.start_date ? `Start date: ${issue.start_date}` : "",
                  issue.target_date ? `Target date: ${issue.target_date}` : "",
                  issue.completed_at ? `Completed at: ${issue.completed_at}` : "",
                ],
                projectId: issue.project_id ?? doc.projectId,
                title: issue.name?.trim() || doc.title,
              });
            }

            if (doc.type === "bookmark") {
              const bookmark = await bookmarkService.retrieveBookmark(
                workspaceSlug,
                doc.projectId ?? projectId,
                doc.id
              );
              return buildAtlasReferenceContextSource(doc, {
                content: bookmarkToReferenceContextContent(bookmark),
                details: [
                  bookmark.tags.length > 0 ? `Tags: ${bookmark.tags.join(", ")}` : "",
                  bookmark.entity_type ? `Entity type: ${bookmark.entity_type}` : "",
                  bookmark.entity_identifier ? `Entity ID: ${bookmark.entity_identifier}` : "",
                ],
                projectId: bookmark.project_id,
                title: bookmark.title?.trim() || doc.title,
                url: bookmark.url || doc.url || undefined,
                workspaceSlug: bookmark.workspace_slug,
              });
            }

            const page = await projectPageService.fetchById(workspaceSlug, doc.projectId ?? projectId, doc.id, false);
            const isWhiteboard = doc.type === "whiteboard" || page.page_type === "whiteboard";
            const type: TAtlasMentionedReference["type"] = isWhiteboard ? "whiteboard" : "doc";
            return buildAtlasReferenceContextSource(doc, {
              content: isWhiteboard
                ? whiteboardJsonToPlainText(page.description_json)
                : htmlToPlainText(page.description_html) || page.description_snippet || "",
              projectId: doc.projectId,
              subtitle: getAtlasReferenceTypeLabel(type),
              title: page.name?.trim() || doc.title,
              type,
              workspaceSlug: doc.workspaceSlug,
            });
          } catch {
            return buildAtlasReferenceContextSource(doc, {
              content: "",
              projectId: doc.projectId,
              title: doc.title,
              workspaceSlug: doc.workspaceSlug,
            });
          }
        })
      );

      return buildAtlasReferencesContext(sources);
    },
    [projectId, workspaceSlug]
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    const hasFiles = pendingFiles.length > 0;
    if ((!trimmed && !hasFiles) || !workspaceSlug || !projectId || !session) return;
    let docsForRequest = mentionedDocs.filter((doc) => trimmed.includes(doc.insertText));
    setIsSending(true);

    let attachments: TAgentChatAttachmentPayload[] = [];
    try {
      attachments = await Promise.all(pendingFiles.map((entry) => fileToAgentChatAttachmentPayload(entry.file)));
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't read attachment" });
      setIsSending(false);
      return;
    }

    const submittedFiles = pendingFiles;
    setPrompt("");
    setPendingFiles([]);
    setMentionedDocs([]);
    setDocMentionMatch(null);
    const userMessageId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        content: trimmed || `Attached ${submittedFiles.length} ${submittedFiles.length === 1 ? "file" : "files"}.`,
        id: userMessageId,
        role: "user",
        pills: submittedFiles.map((entry) => entry.file.name),
      },
    ]);
    try {
      docsForRequest = await resolvePromptMentionedDocs(trimmed, docsForRequest);
      const referencedDocsContext = await resolveMentionedDocsContext(docsForRequest);
      const shouldWriteIntoEditor = Boolean(
        activePageEditorRef &&
        !hasFiles &&
        (isEditorWritingRequest(trimmed) || Boolean(context.selectionText && isSelectionEditRequest(trimmed)))
      );

      if (shouldWriteIntoEditor && activePageEditorRef && pageId) {
        // Capture the pre-session snapshot BEFORE any Atlas proposal is written in.
        // Used by "Discard Atlas changes" to revert the doc in place.
        atlasSnapshotRef.current = activePageEditorRef.getDocument().html;
        setIsDrafting(true);
        await streamDocReview({
          activePageEditorRef,
          anchorPos: context.from,
          pageId,
          projectId,
          prompt: trimmed,
          contextNote: referencedDocsContext,
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
        referencedDocsContext,
      ]
        .filter(Boolean)
        .join("\n\n");
      const res = await agentChatService.sendMessage(
        workspaceSlug,
        session.id,
        trimmed || "Please describe the attached file(s).",
        attachments,
        {
          project_id: projectId,
          tool_mode: "auto",
          context_note: contextNote,
        }
      );
      const text = res.assistant_message.error_message || res.assistant_message.content;

      if (text) {
        setMessages((current) => [
          ...current.map((message) =>
            message.id === userMessageId
              ? {
                  ...mapChatMessageToDocMessage(res.user_message),
                  pills: submittedFiles.map((entry) => entry.file.name),
                }
              : message
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
          content: detail || "Could not reach Atlas. Check the workspace Atlas settings.",
          id: crypto.randomUUID(),
          role: "error",
        },
      ]);
      setPrompt(trimmed);
      setPendingFiles(submittedFiles);
      setMentionedDocs(docsForRequest);
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
    mentionedDocs,
    pageId,
    pendingFiles,
    projectId,
    prompt,
    resolveMentionedDocsContext,
    resolvePromptMentionedDocs,
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
      atlasSnapshotRef.current = null;
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

  const promptHighlightParts = prompt ? getAtlasPromptHighlightParts(prompt) : [];

  return (
    <div
      aria-live="polite"
      data-atlas-ai-bar="true"
      className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4"
    >
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
                        <div className="w-full rounded-[18px] border border-subtle bg-surface-1 px-3 py-2 text-[12px] leading-5 break-words whitespace-pre-wrap text-primary shadow-raised-100">
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
                {selectedProposals > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => activePageEditorRef?.acceptSelectedAtlasProposals?.()}
                      className="inline-flex h-6 shrink-0 items-center rounded-full bg-accent-primary px-2.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Accept selected ({selectedProposals})
                    </button>
                    <button
                      type="button"
                      onClick={() => activePageEditorRef?.rejectSelectedAtlasProposals?.()}
                      className="inline-flex h-6 shrink-0 items-center rounded-full border border-subtle px-2.5 text-[11px] font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                    >
                      Reject selected ({selectedProposals})
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    atlasSnapshotRef.current = null;
                    activePageEditorRef?.acceptAllAtlasProposals();
                  }}
                  className="inline-flex h-6 shrink-0 items-center rounded-full bg-accent-primary px-2.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  Accept all
                </button>
                <button
                  type="button"
                  onClick={() => {
                    atlasSnapshotRef.current = null;
                    activePageEditorRef?.rejectAllAtlasProposals();
                  }}
                  className="inline-flex h-6 shrink-0 items-center rounded-full border border-subtle px-2.5 text-[11px] font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                >
                  Reject all
                </button>
                {atlasSnapshotRef.current !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Discard Atlas’s changes and revert the document to before this session? This also discards any manual edits you made since."
                        )
                      )
                        return;
                      const snapshot = atlasSnapshotRef.current;
                      atlasSnapshotRef.current = null;
                      if (snapshot !== null) {
                        activePageEditorRef?.replaceProviderDocumentFromHTML(snapshot);
                      }
                      activePageEditorRef?.clearAtlasReview();
                    }}
                    className="inline-flex h-6 shrink-0 items-center rounded-full border border-subtle px-2.5 text-[11px] font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                  >
                    Discard Atlas changes
                  </button>
                )}
              </div>
            ) : null}
            {isDocMentionPickerOpen && (
              <div className="absolute bottom-full left-3 z-30 mb-2 max-h-64 w-72 overflow-y-auto rounded-xl border border-subtle bg-surface-1 p-1.5 shadow-raised-200">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-tertiary">
                  <Sparkles className="size-3.5" />
                  <span>References</span>
                </div>
                {isSearchingDocs ? (
                  <div className="flex items-center gap-2 px-2 py-2 text-[12px] text-tertiary">
                    <Loader className="flex items-center gap-1.5">
                      <Loader.Item className="rounded-full" width="5px" height="5px" />
                      <Loader.Item className="rounded-full" width="5px" height="5px" />
                      <Loader.Item className="rounded-full" width="5px" height="5px" />
                    </Loader>
                  </div>
                ) : docMentionResults.length > 0 ? (
                  <div className="space-y-0.5">
                    {docMentionResults.map((doc, index) => {
                      const isSelected = index === docMentionIndex;
                      const ReferenceIcon = getAtlasReferenceIcon(doc.type);
                      return (
                        <button
                          key={referenceIdentity(doc)}
                          type="button"
                          onMouseEnter={() => setDocMentionIndex(index)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectDocMention(doc)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors ${
                            isSelected
                              ? "bg-layer-1 text-primary"
                              : "text-secondary hover:bg-layer-1 hover:text-primary"
                          }`}
                        >
                          <span
                            className={`grid size-6 shrink-0 place-items-center rounded-md ${
                              isSelected ? "bg-layer-2 text-primary" : "bg-layer-2 text-tertiary"
                            }`}
                          >
                            <ReferenceIcon className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{doc.title}</span>
                            <span className="block truncate text-[10px] text-tertiary">
                              {doc.subtitle ?? getAtlasReferenceTypeLabel(doc.type)}
                            </span>
                          </span>
                          <span className="shrink-0 text-[10px] text-[#ff2da1]">{doc.insertText}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-2 py-2 text-[12px] text-tertiary">{docMentionError ?? "No references found"}</div>
                )}
              </div>
            )}
            <div className="relative min-h-[22px]">
              {promptHighlightParts.length > 0 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 max-h-40 w-full overflow-hidden text-[14px] leading-5 break-words whitespace-pre-wrap text-primary"
                >
                  {promptHighlightParts.map((part) =>
                    part.isMention ? (
                      <span key={part.key} className="text-[#ff2da1]">
                        {part.text}
                      </span>
                    ) : (
                      <span key={part.key}>{part.text}</span>
                    )
                  )}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  syncDocMentionMatch(e.target.value, e.target.selectionStart);
                }}
                onKeyDown={(e) => {
                  if (docMentionMatch && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setDocMentionIndex((current) =>
                        docMentionResults.length ? (current + 1) % docMentionResults.length : 0
                      );
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setDocMentionIndex((current) =>
                        docMentionResults.length
                          ? (current - 1 + docMentionResults.length) % docMentionResults.length
                          : 0
                      );
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      if (selectedDocMention) {
                        e.preventDefault();
                        selectDocMention(selectedDocMention);
                        return;
                      }
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setDocMentionMatch(null);
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                onKeyUp={(e) => syncDocMentionMatch(e.currentTarget.value, e.currentTarget.selectionStart)}
                onClick={(e) => syncDocMentionMatch(e.currentTarget.value, e.currentTarget.selectionStart)}
                onSelect={(e) => syncDocMentionMatch(e.currentTarget.value, e.currentTarget.selectionStart)}
                placeholder={activeMode.placeholder(Boolean(contextText))}
                rows={1}
                className={`relative z-10 max-h-40 min-h-[22px] w-full resize-none bg-transparent text-[14px] leading-5 outline-none placeholder:text-placeholder/70 ${
                  prompt ? "text-transparent caret-[#ff2da1]" : "text-primary"
                }`}
              />
            </div>

            {pendingFiles.length > 0 && (
              <ul className="relative mt-2 flex flex-wrap gap-1">
                {pendingFiles.map((entry) => (
                  <PendingFileChip
                    key={entry.id}
                    file={entry.file}
                    onRemove={() => handleRemovePendingFile(entry.id)}
                  />
                ))}
              </ul>
            )}

            <div className="relative my-0.5 flex items-center justify-between gap-1.5">
              <div className="text-sm flex min-w-0 items-center gap-1 text-tertiary">
                <button
                  type="button"
                  onClick={insertDocMentionTrigger}
                  className="grid size-6 shrink-0 place-items-center rounded-full border border-subtle bg-layer-2 text-tertiary transition-colors hover:bg-layer-3 hover:text-primary"
                  aria-label="Add context"
                  title="Add context"
                >
                  <Plus className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="grid size-6 shrink-0 place-items-center rounded-full border border-subtle bg-layer-2 text-tertiary transition-colors hover:bg-layer-3 hover:text-primary"
                  aria-label="Attach file"
                  title="Attach image, CSV, or PDF"
                >
                  <Paperclip className="size-3" />
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
                    <div className="absolute bottom-full left-0 z-30 mb-1.5 min-w-36 rounded-xl border border-subtle bg-surface-1 p-1.5 shadow-raised-200">
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
                  disabled={isSending || isLoadingSession || !session || (!prompt.trim() && pendingFiles.length === 0)}
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
              <div className="relative mt-1 truncate pl-0.5 text-[10px] text-accent-primary">
                Replying to selection: "{contextText.slice(0, 96)}"
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

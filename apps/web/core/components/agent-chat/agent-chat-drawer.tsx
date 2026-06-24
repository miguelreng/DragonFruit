/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js/lib/core";
// Hand-picked language set for chat — see the editor's lowlight-languages
// for the editor's larger curated set. Chat replies usually skew JS/TS/
// Python/SQL/Shell/JSON; we register exactly those plus a few extras.
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";

// Register once. Aliases (`js`, `ts`, `py`) ride along via the language
// definitions themselves. The `github-dark.css` theme is already loaded
// globally through `@plane/editor/styles` (apps/web/styles/globals.css)
// so the `.hljs-*` spans we emit pick up the right colours.
let _hljsRegistered = false;
function ensureHljsRegistered() {
  if (_hljsRegistered) return;
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("diff", diff);
  hljs.registerLanguage("html", xml);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("js", javascript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("md", markdown);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("py", python);
  hljs.registerLanguage("shell", bash);
  hljs.registerLanguage("sh", bash);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("ts", typescript);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("yml", yaml);
  _hljsRegistered = true;
}
// plane imports
import type { EditorRefApi } from "@plane/editor";
import type { TProject } from "@plane/types";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Avatar, CustomMenu, Spinner } from "@plane/ui";
import { calculateTimeAgo, cn } from "@plane/utils";
// components
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  Eraser,
  FileText,
  Folder,
  History,
  Image as ImageIconBase,
  Paperclip,
  Plus,
  Sparkles,
  Trash2,
  UndoLeft,
  X,
} from "@/components/icons/lucide-shim";
// constants
import { ATLAS_IDENTITY } from "@/constants/atlas";
import {
  AGENT_CHAT_ACCEPTED_FILE_TYPES,
  AGENT_CHAT_MAX_FILE_BYTES,
  buildPendingAgentChatFiles,
  classifyAgentChatFileKind,
  fileToAgentChatAttachmentPayload,
  formatAgentChatFileSize,
} from "@/helpers/agent-chat-attachments";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useProject } from "@/hooks/store/use-project";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
// services
import { AgentChatService } from "@/services/agent-chat.service";
import type {
  TAgentChatAttachment,
  TAgentChatAttachmentPayload,
  TAgentChatMessage,
  TAgentChatSession,
  TAtlasDocWriteEvent,
  TAtlasDocWriteIntent,
  TAtlasDocWriteMode,
} from "@/services/agent-chat.service";
import { AgentService } from "@/services/agent.service";
import type { TAgent, TAgentInboxItem } from "@/services/agent.service";
// local imports — `./reply-context` (not the barrel) avoids a self-import cycle
import { useActiveDocPageId } from "./active-doc-page";
import { consumePendingReplyContext, subscribePendingReplyContext, type PendingReplyContext } from "./reply-context";

const chatService = new AgentChatService();
const agentService = new AgentService();

type View = "chat" | "history";

/**
 * Topbar "Talk to AI" drawer.
 *
 * Single-column, chat-app feel. Two views:
 *   - `chat`     — the active conversation. Header carries Atlas'
 *                  identity, a history button, and close. Composer at the
 *                  bottom with an embedded send button. Empty state shows
 *                  avatar large + a prompt.
 *   - `history`  — past sessions list. From here you can resume, delete,
 *                  or start a new Atlas session.
 *
 * The single-column shape mirrors the in-app chat UX in Linear / Cursor
 * / ChatGPT — past sessions are an *occasional* navigation, not an
 * always-visible sidebar that eats half the drawer width.
 */
export const AgentChatDrawer = observer(function AgentChatDrawer({
  dismissible = true,
}: {
  // Whether the user can close the sidebar. Desktop docks it permanently
  // (false); mobile renders a dismissible overlay (true).
  dismissible?: boolean;
}) {
  const { workspaceSlug: rawSlug, projectId: rawProjectId, pageId: rawPageId } = useParams();
  const workspaceSlug = rawSlug?.toString();
  const projectId = rawProjectId?.toString();
  // Most doc routes carry :pageId; the Brief publishes its resolved page id via
  // the active-doc-page bridge so co-writing works there too.
  const overrideDocPageId = useActiveDocPageId();
  const pageId = rawPageId?.toString() ?? overrideDocPageId ?? undefined;
  const { toggleAgentChat } = useAppTheme();
  const projectPages = usePageStore(EPageStoreType.PROJECT);
  const { joinedProjectIds, getProjectById } = useProject();
  const onClose = () => toggleAgentChat(false);

  // Which project Atlas grounds answers/tools in. Defaults to the project
  // you're viewing and re-scopes when you navigate into a different one, but
  // an explicit pick from the scope selector sticks until the route changes.
  // `undefined` = whole workspace (no project filter — backend already
  // treats project_id as optional across search/create tools).
  const [scopeProjectId, setScopeProjectId] = useState<string | undefined>(projectId);
  const lastRouteProjectRef = useRef(projectId);
  useEffect(() => {
    if (projectId !== lastRouteProjectRef.current) {
      lastRouteProjectRef.current = projectId;
      setScopeProjectId(projectId);
    }
  }, [projectId]);

  // Legacy agent rows still back Atlas internally. We only use them to
  // enrich existing sessions with avatar/model metadata during the transition.
  const { data: agents } = useSWR<TAgent[]>(
    workspaceSlug ? `agents/${workspaceSlug}` : null,
    () => agentService.list(workspaceSlug!),
    { revalidateOnFocus: false }
  );

  const { data: sessionsData, mutate: refetchSessions } = useSWR<{ sessions: TAgentChatSession[] }>(
    workspaceSlug ? `agent-chats/${workspaceSlug}` : null,
    () => chatService.listSessions(workspaceSlug!),
    { revalidateOnFocus: false }
  );
  const sessions = useMemo<TAgentChatSession[]>(() => sessionsData?.sessions ?? [], [sessionsData]);

  const [view, setView] = useState<View>("chat");
  const [activeId, setActiveId] = useState<string | null>(null);

  // On first open: jump straight into the most recent chat. If there's
  // no chat history, drop into history view (which is the new-chat
  // launchpad) so the user has somewhere to start.
  useEffect(() => {
    if (activeId) return;
    if (sessions.length > 0) {
      setActiveId(sessions[0]!.id);
      setView("chat");
    } else if (sessionsData) {
      // Only flip to history once we've actually loaded — otherwise
      // we'd flash the empty state during the initial SWR fetch.
      setView("history");
    }
  }, [activeId, sessions, sessionsData]);

  const handleStartSession = useCallback(async () => {
    if (!workspaceSlug) return;
    try {
      const session = await chatService.createSession(workspaceSlug);
      await refetchSessions();
      setActiveId(session.id);
      setView("chat");
    } catch (err) {
      // Surface so the user doesn't see the "Start chat" button click
      // and nothing happen — common failures are: agent disabled,
      // workspace permission, disabled Atlas config, or a stale session.
      const message = (err as { error?: string } | undefined)?.error ?? "Couldn't start the chat. Try again.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Chat error", message });
      // eslint-disable-next-line no-console
      console.error("[agent-chat] createSession failed", err);
    }
  }, [workspaceSlug, refetchSessions]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!workspaceSlug) return;
      await chatService.deleteSession(workspaceSlug, sessionId);
      if (activeId === sessionId) setActiveId(null);
      await refetchSessions();
    },
    [workspaceSlug, activeId, refetchSessions]
  );

  // "Clear conversation" — destructive. Wipes the active chat's messages
  // and drops the user onto a fresh, empty thread. Whatever Atlas wrote
  // lives in the document, not the chat, so the result survives. We
  // create the replacement session *before* deleting the old one so the
  // auto-resume effect (which only fires when `activeId` is null) never
  // gets a window to re-attach to a stale/deleted session.
  const handleClearSession = useCallback(async () => {
    if (!workspaceSlug || !activeId) return;
    const clearedId = activeId;
    try {
      const session = await chatService.createSession(workspaceSlug);
      setActiveId(session.id);
      setView("chat");
      await chatService.deleteSession(workspaceSlug, clearedId);
    } catch (err) {
      const message = (err as { error?: string } | undefined)?.error ?? "Couldn't clear the chat. Try again.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Chat error", message });
    } finally {
      await refetchSessions();
    }
  }, [workspaceSlug, activeId, refetchSessions]);

  const activeSession = sessions.find((s) => s.id === activeId);
  const activeAgent = useMemo(
    () => (activeSession ? (agents ?? []).find((a) => a.id === activeSession.agent) : undefined),
    [agents, activeSession]
  );
  const activePage = pageId ? projectPages.getPageById(pageId) : undefined;
  const activePageEditorRef = activePage?.editor.editorRef ?? null;

  return (
    // In-flow column. The parent (WorkspaceContentWrapper) already
    // wraps us in a `pr-2 pb-2` gap-on-the-frame container, so we
    // just paint our own rounded surface here at the matching size.
    // Match the main workspace panel so the AI drawer reads as the same
    // surface family inside the app frame.
    <aside
      className={cn(
        "t-panel-slide flex h-full w-full flex-col overflow-hidden rounded-lg border-[0.5px] border-subtle bg-surface-1"
      )}
      data-open="true"
    >
      {view === "chat" && (
        <ChatView
          workspaceSlug={workspaceSlug ?? ""}
          projectId={scopeProjectId}
          joinedProjectIds={joinedProjectIds}
          getProjectById={getProjectById}
          onScopeChange={setScopeProjectId}
          sessionId={activeId}
          agent={activeAgent}
          sessions={sessions}
          pageId={pageId}
          activePageEditorRef={activePageEditorRef}
          onClose={onClose}
          dismissible={dismissible}
          onOpenHistory={() => setView("history")}
          onStartSession={handleStartSession}
          onClearSession={handleClearSession}
          onSentRefreshSessions={() => void refetchSessions()}
        />
      )}
      {view === "history" && (
        <HistoryView
          sessions={sessions}
          activeId={activeId}
          onPickSession={(id) => {
            setActiveId(id);
            setView("chat");
          }}
          onStartSession={handleStartSession}
          onDeleteSession={handleDeleteSession}
          onClose={onClose}
          dismissible={dismissible}
          onBack={activeId ? () => setView("chat") : undefined}
        />
      )}
    </aside>
  );
});

// ---------------------------------------------------------------- //
// Chat view                                                          //
// ---------------------------------------------------------------- //

// Project scope selector. Picks which project Atlas grounds its answers
// and tools in — or "Whole workspace" for no filter. A slim strip under
// the header so the current scope is always visible, one click to change.
function AgentChatScopeBar(props: {
  projectId: string | undefined;
  joinedProjectIds: string[];
  getProjectById: (projectId: string | undefined | null) => TProject | undefined;
  onChange: (projectId: string | undefined) => void;
}) {
  const { projectId, joinedProjectIds, getProjectById, onChange } = props;
  const current = projectId ? getProjectById(projectId) : undefined;
  const label = current?.name ?? "Whole workspace";
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="text-11 text-tertiary">Context</span>
      <CustomMenu
        placement="bottom-end"
        closeOnSelect
        customButtonClassName="outline-none"
        customButton={
          <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-11 font-medium text-secondary hover:bg-surface-2">
            <Folder className="size-3 text-tertiary" />
            <span className="max-w-[90px] truncate">{label}</span>
            <ChevronDown className="size-3 text-tertiary" />
          </span>
        }
      >
        <CustomMenu.MenuItem onClick={() => onChange(undefined)}>Whole workspace</CustomMenu.MenuItem>
        {joinedProjectIds.map((id) => {
          const project = getProjectById(id);
          if (!project) return null;
          return (
            <CustomMenu.MenuItem key={id} onClick={() => onChange(id)}>
              <span className="block max-w-[200px] truncate">{project.name}</span>
            </CustomMenu.MenuItem>
          );
        })}
      </CustomMenu>
    </div>
  );
}

function ChatView(props: {
  workspaceSlug: string;
  projectId: string | undefined;
  joinedProjectIds: string[];
  getProjectById: (projectId: string | undefined | null) => TProject | undefined;
  onScopeChange: (projectId: string | undefined) => void;
  pageId: string | undefined;
  sessionId: string | null;
  agent: TAgent | undefined;
  sessions: TAgentChatSession[];
  activePageEditorRef: EditorRefApi | null;
  onClose: () => void;
  dismissible: boolean;
  onOpenHistory: () => void;
  onStartSession: () => Promise<void>;
  onClearSession: () => Promise<void>;
  onSentRefreshSessions: () => void;
}) {
  const {
    workspaceSlug,
    projectId,
    joinedProjectIds,
    getProjectById,
    onScopeChange,
    pageId,
    sessionId,
    agent,
    activePageEditorRef,
    onClose,
    dismissible,
    onOpenHistory,
    onStartSession,
    onClearSession,
    onSentRefreshSessions,
  } = props;

  // ---- Agent inbox polling (needs_input runs for this user) ----
  // Poll at 60 s — quick enough to surface Atlas asking a question
  // without hammering the API on every drawer open.
  const { data: inboxData, mutate: mutateInbox } = useSWR<TAgentInboxItem[]>(
    workspaceSlug ? `agent-inbox/${workspaceSlug}` : null,
    () => agentService.inbox(workspaceSlug),
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );
  const inboxItems = inboxData ?? [];
  // Locally dismissed completed/failed rows — cleared when inbox refreshes.
  const [dismissedRunIds, setDismissedRunIds] = useState<Set<string>>(new Set());
  const [inboxDrafts, setInboxDrafts] = useState<Record<string, string>>({});
  const [inboxSubmitting, setInboxSubmitting] = useState<Set<string>>(new Set());

  const handleInboxRespond = useCallback(
    async (runId: string, payload: { response?: string; approved?: boolean }) => {
      if (!workspaceSlug) return;
      setInboxSubmitting((s) => new Set(s).add(runId));
      try {
        await agentService.respondToRun(workspaceSlug, runId, payload);
        // Optimistic: remove the run from the list immediately.
        void mutateInbox((cur) => (cur ?? []).filter((r) => r.run_id !== runId), { revalidate: true });
        setInboxDrafts((d) => {
          const next = { ...d };
          delete next[runId];
          return next;
        });
      } catch {
        // Silent — the strip will just stay visible until the next poll.
      } finally {
        setInboxSubmitting((s) => {
          const next = new Set(s);
          next.delete(runId);
          return next;
        });
      }
    },
    [workspaceSlug, mutateInbox]
  );

  // "Clear conversation" confirmation. We snapshot the pending Atlas
  // proposal count when the modal opens so the copy can promise the
  // user their in-doc edits are kept.
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [pendingProposalCount, setPendingProposalCount] = useState(0);

  const openClearConfirm = () => {
    setPendingProposalCount(activePageEditorRef?.getActiveAtlasProposalCount() ?? 0);
    setConfirmClearOpen(true);
  };

  const handleConfirmClear = async () => {
    setClearing(true);
    try {
      // Keep the result: bake any still-pending Atlas edits into the
      // document before the chat (and its proposal session) goes away.
      if (activePageEditorRef && activePageEditorRef.getActiveAtlasProposalCount() > 0) {
        activePageEditorRef.acceptAllAtlasProposals();
      }
      await onClearSession();
      setConfirmClearOpen(false);
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      {/* Header — agent identity on the left, clear + history + close on
          the right. Sits at h-11 to match the page-level header strip. */}
      <header className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-subtle px-3">
        <span className="text-13 font-medium text-primary">Atlas</span>
        <span className="min-w-0 flex-1" />
        {sessionId && (
          <IconButton
            variant="tertiary"
            size="sm"
            icon={Eraser}
            onClick={openClearConfirm}
            aria-label="Clear conversation"
          />
        )}
        <IconButton variant="tertiary" size="sm" icon={History} onClick={onOpenHistory} aria-label="Chat history" />
        {dismissible && (
          <IconButton variant="tertiary" size="sm" icon={X} onClick={onClose} aria-label="Close" />
        )}
      </header>

      <AlertModalCore
        isOpen={confirmClearOpen}
        handleClose={() => setConfirmClearOpen(false)}
        handleSubmit={() => void handleConfirmClear()}
        isSubmitting={clearing}
        variant="danger"
        title="Clear conversation?"
        content={
          pendingProposalCount > 0
            ? "This permanently deletes the chat messages and starts a fresh thread. Atlas' edits already in your document are kept."
            : "This permanently deletes the chat messages and starts a fresh thread. Anything Atlas wrote in your document stays."
        }
        primaryButtonText={{ loading: "Clearing", default: "Clear chat" }}
      />

      <AgentInboxStrip
        workspaceSlug={workspaceSlug}
        items={inboxItems}
        dismissedRunIds={dismissedRunIds}
        drafts={inboxDrafts}
        submitting={inboxSubmitting}
        onDraftChange={(runId, text) => setInboxDrafts((d) => ({ ...d, [runId]: text }))}
        onRespond={handleInboxRespond}
        onDismiss={(runId) => setDismissedRunIds((s) => new Set(s).add(runId))}
      />

      {sessionId ? (
        <ChatThread
          key={sessionId}
          workspaceSlug={workspaceSlug}
          sessionId={sessionId}
          projectId={projectId}
          pageId={pageId}
          agent={agent}
          activePageEditorRef={activePageEditorRef}
          joinedProjectIds={joinedProjectIds}
          getProjectById={getProjectById}
          onScopeChange={onScopeChange}
          onSentRefreshSessions={onSentRefreshSessions}
        />
      ) : (
        <NewChatLanding onStartSession={onStartSession} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- //
// Agent inbox strip                                                  //
// ---------------------------------------------------------------- //

/**
 * Compact strip that surfaces needs_input agent runs (+ recent
 * completed/failed) at the top of the chat view.  Renders nothing
 * when there are no items to show so the drawer stays clean for the
 * common "no pending runs" case.
 */
function AgentInboxStrip(props: {
  workspaceSlug: string;
  items: TAgentInboxItem[];
  dismissedRunIds: Set<string>;
  drafts: Record<string, string>;
  submitting: Set<string>;
  onDraftChange: (runId: string, text: string) => void;
  onRespond: (runId: string, payload: { response?: string; approved?: boolean }) => Promise<void>;
  onDismiss: (runId: string) => void;
}) {
  const { items, dismissedRunIds, drafts, submitting, onDraftChange, onRespond, onDismiss } = props;

  const actionable = items.filter((i) => i.status === "needs_input");
  const recent = items.filter(
    (i) => (i.status === "completed" || i.status === "failed") && !dismissedRunIds.has(i.run_id)
  );

  if (actionable.length === 0 && recent.length === 0) return null;

  return (
    <div className="flex-shrink-0 border-b border-subtle bg-surface-1 px-3 py-2">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sparkles className="size-3 text-[#e548a5]" />
        <span className="text-11 font-medium text-[#e548a5]">Atlas needs you</span>
      </div>
      <div className="flex flex-col gap-2">
        {actionable.map((item) => (
          <div
            key={item.run_id}
            className="flex flex-col gap-1.5 rounded-lg border-[0.5px] border-subtle bg-layer-1 p-2"
          >
            {/* Issue + message */}
            <div className="flex items-start gap-1.5">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-[#e548a5]" />
              <div className="min-w-0 flex-1">
                {item.issue && (
                  <div className="truncate text-11 font-medium text-primary">
                    #{item.issue.sequence_id} {item.issue.name}
                  </div>
                )}
                <div className="text-11 text-secondary">{item.message}</div>
              </div>
            </div>
            {/* Action controls */}
            {item.kind === "approval" ? (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={submitting.has(item.run_id)}
                  onClick={() => void onRespond(item.run_id, { approved: true })}
                  className="t-press rounded-md bg-[#e548a5] px-2.5 py-1 text-11 font-medium text-white hover:bg-[#d93d9a] disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={submitting.has(item.run_id)}
                  onClick={() => void onRespond(item.run_id, { approved: false })}
                  className="t-press rounded-md border-[0.5px] border-subtle bg-layer-2 px-2.5 py-1 text-11 font-medium text-secondary hover:bg-layer-1 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={drafts[item.run_id] ?? ""}
                  onChange={(e) => onDraftChange(item.run_id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && (drafts[item.run_id] ?? "").trim()) {
                      e.preventDefault();
                      void onRespond(item.run_id, { response: (drafts[item.run_id] ?? "").trim() });
                    }
                  }}
                  placeholder="Reply to Atlas…"
                  className="min-w-0 flex-1 rounded-md border-[0.5px] border-subtle bg-layer-2 px-2 py-1 text-11 text-primary placeholder:text-placeholder focus:border-strong focus:outline-none"
                />
                <button
                  type="button"
                  disabled={submitting.has(item.run_id) || !(drafts[item.run_id] ?? "").trim()}
                  onClick={() => void onRespond(item.run_id, { response: (drafts[item.run_id] ?? "").trim() })}
                  className="t-press rounded-md bg-[#e548a5] px-2.5 py-1 text-11 font-medium text-white hover:bg-[#d93d9a] disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        ))}
        {recent.map((item) => (
          <div key={item.run_id} className="flex items-center gap-1.5 rounded-md px-2 py-1">
            {item.status === "completed" ? (
              <CheckCircle className="size-3 shrink-0 text-secondary" />
            ) : (
              <AlertCircle className="size-3 shrink-0 text-tertiary" />
            )}
            {item.issue && <span className="text-11 font-medium text-secondary">#{item.issue.sequence_id}</span>}
            <span className="flex-1 truncate text-11 text-tertiary">
              {item.status === "completed" ? "Atlas finished" : "Atlas failed"}
            </span>
            <button
              type="button"
              onClick={() => onDismiss(item.run_id)}
              className="t-press grid size-4 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-primary"
              aria-label="Dismiss"
            >
              <X className="size-2.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewChatLanding(props: { onStartSession: () => Promise<void> }) {
  const { onStartSession } = props;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-layer-1">
        <Sparkles className="size-5 text-accent-primary" />
      </div>
      <div className="space-y-1">
        <div className="text-14 font-medium text-primary">Ask Atlas</div>
        <div className="text-12 text-tertiary">Start a persistent workspace conversation.</div>
      </div>
      <button
        type="button"
        onClick={() => void onStartSession()}
        className="t-press rounded-lg bg-[#e548a5] px-3 py-2 text-13 font-medium text-white hover:bg-[#d93d9a]"
      >
        Start chat
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- //
// History view                                                       //
// ---------------------------------------------------------------- //

function HistoryView(props: {
  sessions: TAgentChatSession[];
  activeId: string | null;
  onPickSession: (id: string) => void;
  onStartSession: () => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onClose: () => void;
  dismissible: boolean;
  onBack: (() => void) | undefined;
}) {
  const { sessions, activeId, onPickSession, onStartSession, onDeleteSession, onClose, onBack, dismissible } = props;
  // Most recent first.
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
  );

  return (
    <>
      <header className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-subtle px-3">
        <div className="flex flex-1 items-center gap-2">
          <Sparkles className="size-4 text-accent-primary" />
          <div className="text-13 font-medium text-primary">Atlas sessions</div>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded px-2 py-1 text-12 text-secondary hover:bg-layer-2 hover:text-primary"
          >
            Back
          </button>
        )}
        {dismissible && (
          <IconButton variant="tertiary" size="sm" icon={X} onClick={onClose} aria-label="Close" />
        )}
      </header>

      <div className="border-b border-subtle px-3 py-2">
        <button
          type="button"
          onClick={() => void onStartSession()}
          className="t-press flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border-accent-strong bg-[#e548a5] px-3 py-2 text-13 font-medium text-white hover:bg-[#d93d9a]"
        >
          <Plus className="size-3.5" />
          New chat
        </button>
      </div>

      <ul className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto">
        {sessions.length === 0 && <li className="px-3 py-6 text-center text-12 text-tertiary">No past chats yet.</li>}
        {sortedSessions.map((s) => (
          <li
            key={s.id}
            className={cn(
              "group flex items-center gap-2 border-b border-subtle px-3 py-2 last:border-b-0",
              activeId === s.id ? "bg-layer-1" : "hover:bg-layer-1"
            )}
          >
            <button type="button" onClick={() => onPickSession(s.id)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-13 text-primary">{s.title || "New chat"}</div>
              <div className="flex items-center gap-1 truncate text-11 text-tertiary">
                <span className="truncate">{s.agent_name || "Atlas"}</span>
                <span aria-hidden>·</span>
                <span>{calculateTimeAgo(s.last_activity_at)}</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => void onDeleteSession(s.id)}
              className="hover:text-error rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Delete chat"
            >
              <Trash2 className="size-3.5 text-tertiary" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- //
// Active conversation                                                //
// ---------------------------------------------------------------- //

// Composer modes, shown as chips on doc surfaces. "Quick ask" is plain chat;
// the others bias Atlas toward writing into the open document.
type TAtlasAiMode = "quick-ask" | "rewrite" | "plan" | "summarize";

const AI_MODES: { id: TAtlasAiMode; label: string }[] = [
  { id: "quick-ask", label: "Quick ask" },
  { id: "rewrite", label: "Rewrite" },
  { id: "plan", label: "Plan" },
  { id: "summarize", label: "Summarize" },
];

// Best-effort intent detection so the mode pill follows what the user types
// (e.g. "write a…" → Rewrite). Returns null when nothing clearly matches so a
// manual pick is never overridden.
function inferAiMode(text: string): TAtlasAiMode | null {
  const t = text.toLowerCase();
  if (/\b(summari[sz]e|summary|tl;?dr|resum)/.test(t)) return "summarize";
  if (/\b(plan|outline|roadmap|checklist|step[-\s]?by[-\s]?step)\b/.test(t)) return "plan";
  if (/\b(write|draft|compose|re-?write|rewrite|edit|revise|expand|continue|create|generate)\b/.test(t)) return "rewrite";
  return null;
}

function ChatThread(props: {
  workspaceSlug: string;
  sessionId: string;
  projectId: string | undefined;
  pageId: string | undefined;
  agent: TAgent | undefined;
  activePageEditorRef: EditorRefApi | null;
  joinedProjectIds: string[];
  getProjectById: (projectId: string | undefined | null) => TProject | undefined;
  onScopeChange: (projectId: string | undefined) => void;
  onSentRefreshSessions: () => void;
}) {
  const {
    workspaceSlug,
    sessionId,
    projectId,
    pageId,
    agent,
    activePageEditorRef,
    joinedProjectIds,
    getProjectById,
    onScopeChange,
    onSentRefreshSessions,
  } = props;
  const { data, mutate } = useSWR(
    `agent-chat/${workspaceSlug}/${sessionId}`,
    () => chatService.getSession(workspaceSlug, sessionId),
    { revalidateOnFocus: false }
  );
  const messages = data?.messages ?? [];

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [aiMode, setAiMode] = useState<TAtlasAiMode>("quick-ask");
  // Passage the user highlighted in the doc and chose to "Ask Atlas" about.
  // Seeded from the shared bridge on mount (the drawer opens *after* the pick,
  // so a window listener here would miss it), then kept live via subscribe.
  const [replyContext, setReplyContext] = useState<PendingReplyContext | null>(() => consumePendingReplyContext());
  // Wrap pending files with a stable id so list keys don't rely on
  // array index (two files with the same name would otherwise share a
  // key). The id is local to this component — never sent to the server.
  const [pendingFiles, setPendingFiles] = useState<{ id: string; file: File }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pin scroll to the bottom as messages arrive. Using `behavior:
  // instant` avoids the visible jump that smooth scrolling produces
  // when many turns load at once (initial mount).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  // Auto-grow the textarea up to a ceiling — chat composers feel best
  // when they expand with the message instead of forcing a hard scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  // Pin a freshly-picked passage and focus the composer. The mount-time read
  // already happened in the `replyContext` initializer; this catches picks
  // that arrive while the drawer is already open.
  useEffect(() => {
    if (replyContext) textareaRef.current?.focus();
    return subscribePendingReplyContext((ctx) => {
      if (!ctx) return;
      setReplyContext(ctx);
      consumePendingReplyContext();
      textareaRef.current?.focus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (accepted.length > 0) setPendingFiles((cur) => [...cur, ...accepted]);
    },
    [pendingFiles.length]
  );

  const handleRemovePending = useCallback((id: string) => {
    setPendingFiles((cur) => cur.filter((entry) => entry.id !== id));
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    const hasFiles = pendingFiles.length > 0;
    // Snapshot the pinned passage now — by the time the request resolves the
    // user may have cleared it or picked another. Intent decides what we do
    // with it: an edit-like ask routes into the doc-write flow scoped to the
    // selection; anything else rides along as private grounding context.
    const reply = replyContext;
    // Allow attachments-only messages — common for "what's in this
    // CSV?" without any typed text.
    if ((!trimmed && !hasFiles) || sending) return;
    setSending(true);

    // Read each pending file into base64. We do this here rather than
    // up-front on `handleAttach` so the user pays the encode cost on
    // send, not on the small drag-in animation. Files are small per
    // cap so reading them in parallel is fine.
    let attachments: TAgentChatAttachmentPayload[] = [];
    try {
      attachments = await Promise.all(pendingFiles.map((entry) => fileToAgentChatAttachmentPayload(entry.file)));
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't read attachment" });
      setSending(false);
      return;
    }

    // Rewrite / Plan / Summarize explicitly target the open document; Quick ask
    // stays plain chat unless the text itself reads like an edit request.
    const isWriteMode = aiMode === "rewrite" || aiMode === "plan" || aiMode === "summarize";
    const shouldWriteIntoEditor = Boolean(
      activePageEditorRef &&
      !hasFiles &&
      (isWriteMode || isEditorWritingRequest(trimmed) || Boolean(replyContext && isSelectionEditRequest(trimmed)))
    );

    if (shouldWriteIntoEditor && activePageEditorRef && pageId) {
      const document = activePageEditorRef.getDocument();
      const documentMarkdown = activePageEditorRef.getMarkDown();
      const liveCursorPosition = activePageEditorRef.getCurrentCursorPosition();
      // A pinned passage anchors the edit to where it was picked — the live
      // editor selection has usually collapsed once focus moved to the
      // composer. Fall back to the cursor for a plain "write…" request.
      const anchorPos = reply ? reply.from : liveCursorPosition;
      // When replying to a passage Atlas should edit that text, not start a
      // fresh doc — force "update" so the model targets the existing block.
      const mode: TAtlasDocWriteMode = reply || documentMarkdown.trim().length > 0 ? "update" : "create";
      const intent = mode === "create" ? "insert" : inferDocWriteIntent(trimmed);
      let streamError: string | null = null;

      setDraft("");
      setPendingFiles([]);
      setReplyContext(null);
      activePageEditorRef.startAtlasReviewSession({
        id: `local-atlas-doc-write-${Date.now()}`,
        mode,
        anchorPos,
      });

      try {
        await chatService.streamDocWrite(
          workspaceSlug,
          sessionId,
          {
            page_id: pageId,
            project_id: projectId,
            prompt: trimmed,
            mode,
            intent,
            cursor_position: anchorPos,
            selection_text: reply?.text ?? activePageEditorRef.getSelectedText(),
            document_markdown: documentMarkdown,
            document_json: document.json,
          },
          (event: TAtlasDocWriteEvent) => {
            if (event.event === "session_started") {
              activePageEditorRef.startAtlasReviewSession({
                id: event.session_id,
                mode: event.mode,
                anchorPos,
              });
              void mutate(
                (current) =>
                  current ? { session: current.session, messages: [...current.messages, event.user_message] } : current,
                { revalidate: false }
              );
            } else if (event.event === "proposal_started") {
              activePageEditorRef.appendAtlasProposal({
                id: event.proposal_id,
                operation: event.operation,
                status: "streaming",
                anchorPos,
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
              void mutate(
                (current) =>
                  current
                    ? { session: current.session, messages: [...current.messages, event.assistant_message] }
                    : current,
                { revalidate: false }
              );
            } else if (event.event === "error") {
              activePageEditorRef.setAtlasReviewLoading(false);
              streamError = event.error;
            }
          }
        );
        if (streamError) throw new Error(streamError);
        setToast({
          type: TOAST_TYPE.CURSOR_BUDDY_SUCCESS,
          title: "Atlas drafted edits",
          message: "Review them inline, then accept or reject each paragraph.",
        });
        await mutate();
        onSentRefreshSessions();
      } catch (err) {
        activePageEditorRef.setAtlasReviewLoading(false);
        const msg = err instanceof Error ? err.message : "Couldn't draft document edits.";
        setToast({ type: TOAST_TYPE.ERROR, title: "Doc write failed", message: msg });
        await mutate();
      } finally {
        setSending(false);
      }
      return;
    }

    const optimistic: TAgentChatMessage = {
      id: `local-${Date.now()}`,
      session: sessionId,
      user: null,
      user_display_name: "",
      user_avatar_url: "",
      role: "user",
      content: trimmed,
      // Hydrate optimistic attachments so the bubble renders thumbnails
      // immediately instead of flashing in once the server echoes them.
      attachments: pendingFiles.map(({ file: f }, i) => ({
        name: f.name,
        mime_type: f.type || "application/octet-stream",
        size: f.size,
        kind: classifyAgentChatFileKind(f.type || ""),
        data_url: attachments[i]?.content_base64
          ? `data:${attachments[i]!.mime_type};base64,${attachments[i]!.content_base64}`
          : undefined,
      })),
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost_usd: 0,
      error_message: "",
      created_at: new Date().toISOString(),
    };
    await mutate(
      (current) => (current ? { session: current.session, messages: [...current.messages, optimistic] } : current),
      { revalidate: false }
    );
    setDraft("");
    setPendingFiles([]);
    setReplyContext(null);
    // A pinned passage that didn't read as an edit request rides along as
    // private grounding so Atlas can resolve "this/that" against the exact
    // text the user highlighted. The backend caps context_note at 4k chars.
    const contextNote = reply
      ? `The user highlighted this passage in the current document and is asking a follow-up about it:\n\n"""\n${reply.text}\n"""`
      : undefined;
    try {
      const response = await chatService.sendMessage(workspaceSlug, sessionId, trimmed, attachments, {
        project_id: projectId,
        tool_mode: shouldWriteIntoEditor ? "none" : "auto",
        context_note: contextNote,
        fact_check: true,
      });
      const generatedContent = response.assistant_message.content?.trim();
      if (shouldWriteIntoEditor && generatedContent && !response.assistant_message.error_message) {
        activePageEditorRef?.setEditorValueAtCursorPosition(markdownToEditorHtml(generatedContent));
        activePageEditorRef?.scrollToNodeViaDOMCoordinates({ behavior: "smooth" });
        setToast({
          type: TOAST_TYPE.CURSOR_BUDDY_SUCCESS,
          title: "Added to page",
          message: `${agent?.name ?? "Atlas"} wrote it into the editor.`,
        });
      }
      await mutate();
      onSentRefreshSessions();
    } catch (err) {
      const msg = (err as { error?: string } | undefined)?.error ?? "Couldn't send message.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Send failed", message: msg });
      await mutate();
    } finally {
      setSending(false);
    }
  }, [
    activePageEditorRef,
    agent?.name,
    aiMode,
    draft,
    pendingFiles,
    replyContext,
    sending,
    sessionId,
    workspaceSlug,
    projectId,
    pageId,
    mutate,
    onSentRefreshSessions,
  ]);

  const isEmpty = messages.length === 0;

  return (
    <>
      <div ref={scrollRef} className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto px-4 py-5">
        {isEmpty && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Avatar size="lg" name={agent?.name ?? "Atlas"} src={ATLAS_IDENTITY.avatarSrc} className="shrink-0" />
            <div className="space-y-1">
              <div className="text-14 font-medium text-primary">How can Atlas help?</div>
              <div className="max-w-xs text-12 text-tertiary">
                Ask a question, brainstorm, or paste in something you want rewritten. Tasks and pages are not
                auto-attached.
              </div>
            </div>
          </div>
        )}
        {!isEmpty && (
          <ul className="flex flex-col gap-4">
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
            {sending && (
              <li className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-12 text-tertiary">
                  <Spinner height="12px" width="12px" />
                  Thinking…
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Composer. The outer wrapper carries the Enter handler so the
          keypress is captured even when focus is briefly on the send
          button (e.g. tab-focus then space-press). Visually we render
          the composer as one rounded surface with input + attach + send
          embedded — Cursor/ChatGPT shape. */}
      <div
        role="presentation"
        className="relative flex-shrink-0 bg-surface-1 px-3 py-3"
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.shiftKey &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey &&
            (draft.trim().length > 0 || pendingFiles.length > 0) &&
            !sending
          ) {
            e.preventDefault();
            void handleSend();
          }
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-surface-1 to-transparent"
        />
        <input
          ref={fileInputRef}
          type="file"
          // Mirror the server-side accepted MIME types. The picker uses
          // both extension hints and mime types so the file dialog
          // filters sensibly on every OS.
          accept={AGENT_CHAT_ACCEPTED_FILE_TYPES}
          multiple
          className="hidden"
          onChange={(e) => {
            handleAttach(e.target.files);
            // Reset so picking the same file twice still fires onChange.
            e.target.value = "";
          }}
        />
        <div
          className={cn(
            "flex flex-col gap-2 rounded-2xl border-[0.5px] border-subtle bg-surface-1 px-3 py-2 transition-colors focus-within:border-strong"
          )}
        >
          {replyContext && (
            <div className="border-accent-primary flex items-start gap-2 rounded-lg border-l-2 bg-layer-2 py-1 pr-1 pl-2">
              <div className="min-w-0 flex-1 py-0.5">
                <div className="text-[11px] font-medium text-accent-primary">Replying to selection</div>
                <p className="text-xs line-clamp-2 text-tertiary">{replyContext.text}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplyContext(null)}
                className="t-press grid size-5 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-1 hover:text-primary"
                aria-label="Remove reply context"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
          {pendingFiles.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {pendingFiles.map((entry) => (
                <PendingAttachmentChip
                  key={entry.id}
                  file={entry.file}
                  onRemove={() => handleRemovePending(entry.id)}
                />
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-1.5">
            {AI_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setAiMode(m.id)}
                className={cn(
                  "t-press rounded-full px-2.5 py-0.5 text-11 transition-colors",
                  aiMode === m.id
                    ? "bg-accent-subtle font-medium text-accent-primary"
                    : "border-[0.5px] border-subtle text-secondary hover:bg-layer-2 hover:text-primary"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => {
                const value = e.target.value;
                setDraft(value);
                const next = inferAiMode(value);
                if (next) setAiMode(next);
              }}
              rows={1}
              placeholder="Message Atlas…  type @ to add a doc or task"
              className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-13 leading-[1.4] text-primary placeholder:text-placeholder focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || (draft.trim().length === 0 && pendingFiles.length === 0)}
              className="t-press grid size-7 shrink-0 place-items-center rounded-md text-secondary transition-colors hover:text-primary disabled:opacity-40"
              aria-label="Send message"
            >
              {sending ? (
                <Spinner height="14px" width="14px" className="fill-current text-current/30" />
              ) : (
                <UndoLeft className="size-4 rotate-180" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setDraft((d) => `${d}@`);
                textareaRef.current?.focus();
              }}
              className="t-press grid size-7 shrink-0 place-items-center rounded-full border-[0.5px] border-subtle text-secondary transition-colors hover:bg-layer-2 hover:text-primary"
              aria-label="Mention a doc or task"
              title="Mention a doc or task"
            >
              <span className="text-13 leading-none">@</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="t-press grid size-7 shrink-0 place-items-center rounded-full border-[0.5px] border-subtle text-secondary transition-colors hover:bg-layer-2 hover:text-primary"
              aria-label="Attach file"
              title="Attach image, CSV, or PDF"
            >
              <Paperclip className="size-3.5" />
            </button>
            <AgentChatScopeBar
              projectId={projectId}
              joinedProjectIds={joinedProjectIds}
              getProjectById={getProjectById}
              onChange={onScopeChange}
            />
          </div>
        </div>
      </div>
    </>
  );
}

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

function markdownToEditorHtml(markdownSource: string): string {
  const blocks = parseMarkdownBlocks(markdownSource);
  if (blocks.length === 0) return `<p>${escapeHtml(markdownSource)}</p>`;
  return blocks.map(editorHtmlFromBlock).join("");
}

function editorHtmlFromBlock(block: Block): string {
  switch (block.kind) {
    case "h": {
      const level = Math.min(block.level, 3);
      return `<h${level}>${inlineMarkdownToHtml(block.text)}</h${level}>`;
    }
    case "ul":
      return `<ul>${block.items.map((item) => `<li><p>${inlineMarkdownToHtml(item)}</p></li>`).join("")}</ul>`;
    case "ol":
      return `<ol>${block.items.map((item) => `<li><p>${inlineMarkdownToHtml(item)}</p></li>`).join("")}</ol>`;
    case "quote":
      return `<blockquote>${inlineMarkdownToHtml(block.text)}</blockquote>`;
    case "code":
      return `<pre><code>${escapeHtml(block.content)}</code></pre>`;
    case "table":
      return [
        "<table><tbody>",
        `<tr>${block.headers.map((cell) => `<th>${inlineMarkdownToHtml(cell)}</th>`).join("")}</tr>`,
        ...block.rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdownToHtml(cell)}</td>`).join("")}</tr>`),
        "</tbody></table>",
      ].join("");
    case "hr":
      return "<hr />";
    case "p":
      return `<p>${inlineMarkdownToHtml(block.text)}</p>`;
  }
}

function inlineMarkdownToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_(?!\s)(.+?)(?<!\s)_/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ------------------------------------------------------------------ //
// Attachment helpers                                                   //
// ------------------------------------------------------------------ //

function PendingAttachmentChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  // Build a transient object URL just for the preview. Revoke when
  // the chip unmounts (file removed or message sent) so we don't leak
  // blob handles.
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  const Icon = isImage ? ImageIconBase : FileText;
  const sizeLabel = formatAgentChatFileSize(file.size);

  return (
    <li className="group relative inline-flex items-center gap-1.5 rounded-lg border-[0.5px] border-subtle bg-surface-1 py-1 pr-1 pl-1.5">
      {previewUrl ? (
        <img src={previewUrl} alt="" className="size-6 rounded object-cover" />
      ) : (
        <Icon className="size-3.5 text-tertiary" />
      )}
      <span className="max-w-[120px] truncate text-11 text-primary">{file.name}</span>
      <span className="text-11 text-tertiary">{sizeLabel}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 grid size-4 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-primary"
        aria-label={`Remove ${file.name}`}
      >
        <X className="size-3" />
      </button>
    </li>
  );
}

const MessageRow = memo(function MessageRow({
  message,
}: {
  message: TAgentChatMessage;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    const visibleContent = stripCopilotContextForDisplay(message.content ?? "");
    const attachments = message.attachments ?? [];
    // User turns are right-aligned soft pills — no avatar needed,
    // the position alone signals authorship. Attachments render above
    // (image thumbnails or filename chips) inside the same bubble.
    return (
      <li className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-1.5">
          {attachments.length > 0 && (
            <ul className="flex flex-wrap justify-end gap-1.5">
              {attachments.map((a) => (
                // The message itself has a stable id; combined with the
                // attachment's name + size that's a deterministic key
                // for the chip list inside this bubble. No array index.
                <SentAttachmentChip key={`${message.id}-${a.name}-${a.size}`} attachment={a} />
              ))}
            </ul>
          )}
          {visibleContent && (
            <div className="rounded-2xl rounded-br-md bg-layer-1 px-3.5 py-2 text-13 whitespace-pre-wrap text-primary">
              {visibleContent}
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <li className="flex">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {message.error_message ? (
          <div className="text-error max-w-full text-13">{message.error_message}</div>
        ) : message.content ? (
          // LLM replies are markdown by convention — bullet lists,
          // bold, code fences, headings. Without rendering, the user
          // sees raw `**` and `*` characters. AssistantMarkdown applies
          // chat-appropriate styling (tighter spacing, no horizontal
          // overflow, inline code chips).
          <AssistantMarkdown source={message.content} />
        ) : (
          <div className="text-13 text-tertiary italic">(empty reply)</div>
        )}
      </div>
    </li>
  );
});

function stripCopilotContextForDisplay(content: string): string {
  if (!content.includes("Copilot context:") && !content.includes("Atlas context:")) return content;
  const legacyContextBlock =
    /(?:\r?\n){2}(?:Copilot|Atlas) context:\n[\s\S]*?Resolve words like "this", "that", "look at this", "translate this", or "summarize this" against the selected text, focused text, hovered UI element, URL, visual attachment, and frontmost app context above\. If selected text is present, treat it as the primary object of the request\./g;
  return content.replace(legacyContextBlock, "").trim();
}

// Markdown-with-chat-styling. We don't reuse `MarkdownRenderer` from
// the UI lib because its defaults assume document-width content (big
// left margins on lists, secondary-color paragraphs). Chat bubbles
// need compact spacing and primary text so the reply reads like a
// teammate's message, not a long-form doc.
/**
 * Tiny in-house markdown renderer scoped to what assistant replies
 * actually emit. We dropped `react-markdown` because its v8 transitive
 * dep on `remark-rehype@10` needs `mdast-util-to-hast` exports that
 * the pnpm-override-pinned v13 removed (Vite fails on dep optimization).
 *
 * Covers the common LLM-output cases:
 *   - paragraphs (blank-line separated)
 *   - `# / ## / ###` headings
 *   - `- ` and `* ` bullet lists
 *   - `1. ` numbered lists
 *   - `> quote` blockquotes
 *   - ```fenced``` code blocks
 *   - inline `code`, **bold**, *italic*, _italic_, [text](url)
 *
 * What it deliberately doesn't do: tables, footnotes, raw HTML
 * passthrough, syntax highlighting. LLM output rarely needs those in
 * chat, and skipping them is also our safety net — we never call
 * dangerouslySetInnerHTML, so there's no HTML-injection surface.
 */
function AssistantMarkdown({ source }: { source: string }) {
  // Register hljs languages on first render — no-op after that.
  useEffect(() => {
    ensureHljsRegistered();
  }, []);

  // Footnote pre-pass: pull `[^id]: text` defs out of the source up
  // front so the block parser doesn't see them as paragraphs. The map
  // threads through the inline renderer where `[^id]` references
  // resolve into a numbered superscript link.
  const { stripped, footnotes } = useMemo(() => extractFootnotes(source), [source]);
  const blocks = useMemo(() => parseMarkdownBlocks(stripped), [stripped]);

  return (
    <div className="text-13 text-primary">
      {blocks.map((block, i) => renderBlock(block, i, footnotes))}
      {footnotes.length > 0 && (
        <section className="mt-3 border-t border-subtle pt-2">
          <ol className="ml-4 list-decimal space-y-0.5 text-11 text-tertiary">
            {footnotes.map((fn) => (
              <li key={fn.id} id={`fn-${fn.id}`} className="leading-snug">
                {renderInline(fn.text, footnotes)}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

type Footnote = { id: string; index: number; text: string };

type TableAlign = "left" | "center" | "right" | undefined;

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; content: string; lang: string }
  | { kind: "table"; headers: string[]; rows: string[][]; aligns: TableAlign[] }
  | { kind: "hr" };

// Strip `[^id]: text` definition lines from the source. Returns the
// cleaned source plus an ordered list of footnotes (numbering follows
// the order of definition, not first reference — matches CommonMark).
function extractFootnotes(src: string): { stripped: string; footnotes: Footnote[] } {
  const footnotes: Footnote[] = [];
  const stripped = src
    .split(/\r?\n/)
    .filter((line) => {
      const m = /^\[\^([A-Za-z0-9_-]+)\]:\s*(.*)$/.exec(line);
      if (!m) return true;
      footnotes.push({ id: m[1]!, index: footnotes.length + 1, text: m[2]!.trim() });
      return false;
    })
    .join("\n");
  return { stripped, footnotes };
}

function parseMarkdownBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Skip blank lines between blocks.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block: ``` or ```lang. Reads until the closing ```.
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] || "";
      const collected: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        collected.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      blocks.push({ kind: "code", content: collected.join("\n"), lang });
      continue;
    }

    // Horizontal rule.
    if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // Heading (only level 1-3 — assistant rarely uses deeper).
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "h", level: heading[1]!.length as 1 | 2 | 3, text: heading[2]!.trim() });
      i++;
      continue;
    }

    // Blockquote: one or more consecutive `> ` lines.
    if (/^>\s?/.test(line)) {
      const collected: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        collected.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", text: collected.join("\n") });
      continue;
    }

    // GFM table: a `| ... |` line followed by a `|---|---|` separator
    // line. The separator cells may contain `:` for alignment markers
    // (e.g. `|:---|---:|:---:|` = left, right, centre). Anything that
    // looks like a pipe row but doesn't have a separator on the very
    // next line falls through to the paragraph branch — defensive,
    // since LLMs sometimes emit single-row "tables" as decoration.
    const tableHeaderCells = line.match(/^\|(.*)\|$/);
    if (tableHeaderCells && i + 1 < lines.length) {
      const sep = (lines[i + 1] ?? "").trim();
      if (/^\|(\s*:?-{3,}:?\s*\|)+$/.test(sep)) {
        const headers = splitTableRow(line);
        const aligns: TableAlign[] = splitTableRow(sep).map((cell) => {
          const t = cell.trim();
          const left = t.startsWith(":");
          const right = t.endsWith(":");
          if (left && right) return "center";
          if (right) return "right";
          if (left) return "left";
          return undefined;
        });
        i += 2; // skip header + separator
        const rows: string[][] = [];
        while (i < lines.length && /^\|(.*)\|$/.test(lines[i] ?? "")) {
          rows.push(splitTableRow(lines[i] ?? ""));
          i++;
        }
        blocks.push({ kind: "table", headers, rows, aligns });
        continue;
      }
    }

    // Unordered list: consecutive `- ` or `* ` lines.
    if (/^(-|\*)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^(-|\*)\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^(-|\*)\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list: consecutive `1. ` lines (any digit prefix).
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Paragraph: consume until a blank line or a block-start regex hit.
    // `|` is a table-start sentinel here so a paragraph never absorbs
    // the header row of a real table; the table branch above already
    // bails to paragraph if the separator line is missing.
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !/^(#{1,3}\s|>\s?|-\s|\*\s|\d+\.\s|```|\||(-{3,}|_{3,}|\*{3,})\s*$)/.test(lines[i] ?? "")
    ) {
      para.push(lines[i]!);
      i++;
    }
    if (para.length > 0) blocks.push({ kind: "p", text: para.join(" ") });
  }

  return blocks;
}

// Split one table row by `|`, dropping the leading/trailing delimiters
// and trimming each cell. Escaped `\|` inside cells stays as a literal
// pipe — matches GFM.
function splitTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function renderBlock(block: Block, key: number, footnotes: Footnote[]): React.ReactNode {
  switch (block.kind) {
    case "p":
      return (
        <p key={key} className="my-1.5 leading-snug first:mt-0 last:mb-0">
          {renderInline(block.text, footnotes)}
        </p>
      );
    case "h":
      // h1/h2 collapse to the same in-bubble size; h3 is one step smaller.
      if (block.level === 3) {
        return (
          <h4 key={key} className="mt-2 mb-1 text-13 font-semibold first:mt-0">
            {renderInline(block.text, footnotes)}
          </h4>
        );
      }
      return (
        <h3 key={key} className="mt-2 mb-1 text-14 font-semibold first:mt-0">
          {renderInline(block.text, footnotes)}
        </h3>
      );
    case "ul":
      return (
        <ul key={key} className="my-1.5 ml-4 list-disc space-y-0.5 first:mt-0 last:mb-0">
          {block.items.map((item) => (
            // Block parent + item content form the key. If two items in
            // one list have identical text, React falls back to order —
            // the whole tree re-mounts when `source` changes anyway
            // (useMemo rebuilds the blocks array), so this is safe.
            <li key={`${key}-${item}`} className="leading-snug">
              {renderInline(item, footnotes)}
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="my-1.5 ml-4 list-decimal space-y-0.5 first:mt-0 last:mb-0">
          {block.items.map((item) => (
            <li key={`${key}-${item}`} className="leading-snug">
              {renderInline(item, footnotes)}
            </li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote key={key} className="my-1.5 border-l-2 border-subtle pl-2 text-secondary italic">
          {renderInline(block.text, footnotes)}
        </blockquote>
      );
    case "code":
      return <CodeBlock key={key} content={block.content} lang={block.lang} />;
    case "table": {
      // Precompute per-cell metadata so the JSX below uses content-
      // stable keys with no array index in the key expression (keeps
      // `no-array-index-key` happy). Tables in chat output don't
      // typically have duplicate rows; if they did, React would warn
      // — fine since the whole tree re-mounts when the message body
      // changes.
      const headerCells = block.headers.map((cell, idx) => ({
        cell,
        align: block.aligns[idx],
        cellKey: `${key}-th-${cell || `col-${idx}`}`,
        colName: cell || `col-${idx}`,
      }));
      const bodyRows = block.rows.map((row) => {
        const rowJoin = row.join("");
        return {
          rowKey: `${key}-tr-${rowJoin}`,
          cells: row.map((cell, cIdx) => ({
            cell,
            align: block.aligns[cIdx],
            cellKey: `${key}-td-${rowJoin}-${headerCells[cIdx]?.colName ?? `c${cIdx}`}`,
          })),
        };
      });
      return (
        <div key={key} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse border-subtle text-left text-[12px]">
            <thead className="bg-layer-2">
              <tr>
                {headerCells.map((h) => (
                  <th
                    key={h.cellKey}
                    style={{ textAlign: h.align }}
                    className="border border-subtle px-2 py-1 font-semibold text-primary"
                  >
                    {renderInline(h.cell, footnotes)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((r) => (
                <tr key={r.rowKey} className="hover:bg-layer-1/50">
                  {r.cells.map((c) => (
                    <td
                      key={c.cellKey}
                      style={{ textAlign: c.align }}
                      className="border border-subtle px-2 py-1 text-primary"
                    >
                      {renderInline(c.cell, footnotes)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "hr":
      return <hr key={key} className="my-2 border-subtle" />;
    default:
      return null;
  }
}

/**
 * Syntax-highlighted code block. We trust hljs's HTML output because
 * it escapes the input before wrapping in fixed-shape spans — there's
 * no path for arbitrary user content to ride through as live HTML.
 * Falls back to plaintext when the language is unknown or unregistered.
 */
function CodeBlock({ content, lang }: { content: string; lang: string }) {
  const langKey = (lang || "").toLowerCase();
  const isRegistered = langKey && hljs.getLanguage(langKey);
  const html = useMemo(() => {
    if (!isRegistered) return null;
    try {
      return hljs.highlight(content, { language: langKey, ignoreIllegals: true }).value;
    } catch {
      return null;
    }
  }, [content, langKey, isRegistered]);

  if (html) {
    return (
      <pre className="my-1.5 overflow-x-auto rounded bg-layer-2 p-2 text-12" data-language={langKey}>
        <code
          className={`hljs language-${langKey}`}
          // hljs returns HTML with span class names; the input was
          // escaped by hljs before insertion, so this is safe.
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    );
  }

  // Plain code fence with no recognised language — render as text.
  return (
    <pre className="my-1.5 overflow-x-auto rounded bg-layer-2 p-2 text-12" data-language={langKey || undefined}>
      <code>{content}</code>
    </pre>
  );
}

// Whitelisted inline HTML tags. Anything outside this set renders as
// escaped text — the whole point of the in-house renderer is that no
// arbitrary HTML rides through. These are pure formatting tags with
// no scripting, no resource fetches, no event handlers.
const INLINE_HTML_TAGS = new Set(["br", "sub", "sup", "kbd", "mark"]);

// Inline renderer. Order matters: scan for the highest-precedence
// token starting at each position. Code spans hide their contents from
// further parsing (so `**not bold**` inside backticks stays literal).
function renderInline(text: string, footnotes: Footnote[]): React.ReactNode {
  const out: React.ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;
  const nextKey = () => `i${keyCounter++}`;

  while (i < text.length) {
    const rest = text.slice(i);

    // Inline code: `...`
    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      out.push(
        <code key={nextKey()} className="font-mono rounded bg-layer-2 px-1 py-px text-[11px]">
          {code[1]}
        </code>
      );
      i += code[0].length;
      continue;
    }

    // Bold: **...**
    const bold = /^\*\*([^*]+)\*\*/.exec(rest);
    if (bold) {
      out.push(
        <strong key={nextKey()} className="font-semibold text-primary">
          {renderInline(bold[1]!, footnotes)}
        </strong>
      );
      i += bold[0].length;
      continue;
    }

    // Italic: *...* or _..._ (single delimiters, no leading whitespace
    // inside the open/close pair). Avoid matching the middle of a word.
    const italicStar = /^\*([^*\s][^*]*)\*/.exec(rest);
    if (italicStar) {
      out.push(
        <em key={nextKey()} className="italic">
          {renderInline(italicStar[1]!, footnotes)}
        </em>
      );
      i += italicStar[0].length;
      continue;
    }
    const italicUnder = /^_([^_\s][^_]*)_/.exec(rest);
    if (italicUnder) {
      out.push(
        <em key={nextKey()} className="italic">
          {renderInline(italicUnder[1]!, footnotes)}
        </em>
      );
      i += italicUnder[0].length;
      continue;
    }

    // Footnote reference: [^id]. Resolves to the matching def from
    // the pre-pass. References to unknown ids render as plain text so
    // `[^foo]` mid-sentence isn't silently swallowed.
    const fnRef = /^\[\^([A-Za-z0-9_-]+)\]/.exec(rest);
    if (fnRef) {
      const target = footnotes.find((f) => f.id === fnRef[1]);
      if (target) {
        out.push(
          <sup key={nextKey()} className="text-[10px]">
            <a
              href={`#fn-${target.id}`}
              className="text-accent-primary hover:underline"
              aria-label={`Footnote ${target.index}`}
            >
              [{target.index}]
            </a>
          </sup>
        );
        i += fnRef[0].length;
        continue;
      }
    }

    // Link: [label](url) — only http(s) or relative urls render
    // clickable; anything else falls back to plain text to keep the
    // bubble safe from javascript: payloads.
    const link = /^\[([^\]]+)\]\(([^)]+)\)/.exec(rest);
    if (link) {
      const safe = /^(https?:\/\/|\/|#|mailto:)/.test(link[2]!);
      if (safe) {
        out.push(
          <a
            key={nextKey()}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="decoration-tertiary hover:decoration-accent-primary text-accent-primary underline underline-offset-2"
          >
            {link[1]}
          </a>
        );
      } else {
        out.push(<Fragment key={nextKey()}>{link[1]}</Fragment>);
      }
      i += link[0].length;
      continue;
    }

    // Whitelisted inline HTML. Self-closing tags (`<br>`, `<br/>`)
    // and wrapping pairs (`<sub>...</sub>`). Anything matching `<` but
    // not in the whitelist falls through to the literal-text branch.
    // We deliberately don't parse attributes — even `class` is denied
    // so there's no path to inject styling that masks malicious intent.
    const selfClose = /^<(br)\s*\/?\s*>/i.exec(rest);
    if (selfClose && INLINE_HTML_TAGS.has(selfClose[1]!.toLowerCase())) {
      out.push(<br key={nextKey()} />);
      i += selfClose[0].length;
      continue;
    }
    const pair = /^<(sub|sup|kbd|mark)>([^<]*)<\/\1>/i.exec(rest);
    if (pair && INLINE_HTML_TAGS.has(pair[1]!.toLowerCase())) {
      const tag = pair[1]!.toLowerCase();
      const inner = renderInline(pair[2]!, footnotes);
      if (tag === "sub") out.push(<sub key={nextKey()}>{inner}</sub>);
      else if (tag === "sup") out.push(<sup key={nextKey()}>{inner}</sup>);
      else if (tag === "kbd") {
        out.push(
          <kbd
            key={nextKey()}
            className="font-mono rounded border-[0.5px] border-subtle bg-layer-2 px-1 py-px text-[10px]"
          >
            {inner}
          </kbd>
        );
      } else if (tag === "mark") {
        // No native `mark` colour token in this design system — use a
        // soft accent tint that reads as a highlight on both themes.
        out.push(
          <mark key={nextKey()} className="rounded bg-accent-primary/15 px-0.5 text-primary">
            {inner}
          </mark>
        );
      }
      i += pair[0].length;
      continue;
    }

    // No token at this position — eat one character of plain text.
    // Buffering would be faster, but inputs are short.
    out.push(<Fragment key={nextKey()}>{text[i]}</Fragment>);
    i++;
  }

  return out;
}

// Renders one attachment inside a sent user bubble. Images get a small
// thumbnail (data_url comes back from the server, so no extra fetch);
// CSV/PDF/other render as a filename chip with a type icon.
function SentAttachmentChip({ attachment }: { attachment: TAgentChatAttachment }) {
  const isImage = attachment.kind === "image";
  if (isImage && attachment.data_url) {
    return (
      <li className="overflow-hidden rounded-lg border-[0.5px] border-subtle bg-surface-1">
        <img src={attachment.data_url} alt={attachment.name} className="block max-h-48 max-w-[12rem] object-cover" />
      </li>
    );
  }
  const Icon = isImage ? ImageIconBase : FileText;
  const sizeLabel =
    attachment.size > 1024 * 1024
      ? `${(attachment.size / 1024 / 1024).toFixed(1)} MB`
      : `${(attachment.size / 1024).toFixed(attachment.size > 1024 * 1024 ? 0 : 1)} KB`;
  return (
    <li className="inline-flex items-center gap-1.5 rounded-lg border-[0.5px] border-subtle bg-surface-1 py-1 pr-2 pl-1.5">
      <Icon className="size-3.5 text-tertiary" />
      <span className="max-w-[160px] truncate text-11 text-primary">{attachment.name}</span>
      <span className="text-11 text-tertiary">{sizeLabel}</span>
    </li>
  );
}

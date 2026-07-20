/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {
  Fragment,
  Suspense,
  createContext,
  lazy,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { orderBy } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR, { mutate as globalMutate } from "swr";

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
import { AlertModalCore, Button, CustomMenu, Spinner, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { parseChartSpec } from "@/components/chart/spec";
import {
  ArrowRightLeft,
  ChartNoAxesColumn,
  Check,
  Copy,
  Dialog,
  Eraser,
  FileText,
  Folder,
  Image as ImageIconBase,
  Lightbulb,
  ListChecks,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PanelRight,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Sparkles,
  LayoutGrid,
  Trash2,
  UndoLeft,
  X,
} from "@/components/icons/lucide-shim";
// constants
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
import { useWorkspace } from "@/hooks/store/use-workspace";
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
import type { TAgent, TMcpServerSummary } from "@/services/agent.service";
import { INTEGRATIONS } from "@/constants/integrations";
import { WorkspaceService } from "@/services/workspace.service";
import { BookmarkService } from "@/services/bookmark.service";
import { IssueService } from "@/services/issue/issue.service";
import { ProjectPageService } from "@/services/page/project-page.service";
// local imports — `./reply-context` (not the barrel) avoids a self-import cycle
import { useActiveDocPageId } from "./active-doc-page";
import { consumeAtlasComposerFocus } from "./composer-focus";
import {
  buildAtlasReferencesContext,
  getAtlasMentionMatch,
  getAtlasMentionToken,
  getAtlasPromptHighlightParts,
  getAtlasReferenceTypeLabel,
  htmlToPlainText,
  issueToReferenceContextContent,
  referenceIdentity,
  bookmarkToMentionedReference,
  whiteboardJsonToPlainText,
  type TAtlasMentionedReference,
  type TAtlasMentionMatch,
  type TAtlasReferenceContextSource,
} from "./atlas-doc-mentions";
import { consumePendingReplyContext, subscribePendingReplyContext, type PendingReplyContext } from "./reply-context";

const chatService = new AgentChatService();
const agentService = new AgentService();
const workspaceService = new WorkspaceService();
const bookmarkService = new BookmarkService();
const issueService = new IssueService();
const projectPageService = new ProjectPageService();

// Morphing-infinity loader (loading-ui.com/morphing-infinity): one SVG path
// morphing circle → infinity → circle on a 5s loop, animated via SMIL so it
// needs no motion library. The three keyframe paths share an identical
// command structure (M + 4×C + Z) so `d` interpolates smoothly.
const MI_CIRCLE_A =
  "M 12 8 C 14.21 8 16 9.79 16 12 C 16 14.21 14.21 16 12 16 C 9.79 16 8 14.21 8 12 C 8 9.79 9.79 8 12 8 Z";
const MI_INFINITY =
  "M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z";
const MI_CIRCLE_B =
  "M 12 16 C 14.21 16 16 14.21 16 12 C 16 9.79 14.21 8 12 8 C 9.79 8 8 9.79 8 12 C 8 14.21 9.79 16 12 16 Z";

function MorphingInfinity({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="status"
      aria-label="Loading"
      className={className}
    >
      <path d={MI_CIRCLE_A}>
        <animate
          attributeName="d"
          dur="5s"
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0;0.25;0.5;0.75;1"
          keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
          values={`${MI_CIRCLE_A};${MI_INFINITY};${MI_CIRCLE_B};${MI_INFINITY};${MI_CIRCLE_A}`}
        />
      </path>
    </svg>
  );
}

// A drag carrying files (vs. selected text or a dragged element). Guards the
// composer's drop overlay so it only appears for real file drags.
const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

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
  onCollapse,
  isExpanded = false,
  onToggleExpand,
}: {
  // Whether the user can close the sidebar. Desktop docks it permanently
  // (false); mobile renders a dismissible overlay (true).
  dismissible?: boolean;
  // Desktop only: collapse the docked sidebar to a slim rail. Absent on mobile
  // (which uses `dismissible` to close the overlay instead).
  onCollapse?: () => void;
  // Desktop only: whether the docked sidebar is in full-width focus mode
  // (sessions sidebar + centered conversation; the page content is closed).
  isExpanded?: boolean;
  // Desktop only: toggle the docked sidebar between its default width and
  // full-width focus mode. Absent on mobile.
  onToggleExpand?: () => void;
}) {
  const { workspaceSlug: rawSlug, projectId: rawProjectId, pageId: rawPageId } = useParams();
  const workspaceSlug = rawSlug?.toString();
  const projectId = rawProjectId?.toString();
  // Most doc routes carry :pageId; the Brief publishes its resolved page id via
  // the active-doc-page bridge so co-writing works there too.
  const overrideDocPageId = useActiveDocPageId();
  const routeDocPageId = rawPageId?.toString() ?? overrideDocPageId ?? undefined;
  // The composer surfaces the doc as a context pill; its ✕ drops the doc from
  // Atlas' context (no co-writing target, no doc-scoped suggestions). Keyed by
  // page id so navigating to a different doc re-attaches automatically.
  const [dismissedDocPageId, setDismissedDocPageId] = useState<string | null>(null);
  // A dismissal only lasts while the user stays on that doc — navigating away
  // (even to the docs list) forgets it, so coming back re-attaches the pill.
  useEffect(() => {
    setDismissedDocPageId((current) => (current && current !== routeDocPageId ? null : current));
  }, [routeDocPageId]);
  const pageId = routeDocPageId && routeDocPageId !== dismissedDocPageId ? routeDocPageId : undefined;
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
  // Use the first loaded session immediately instead of waiting for the effect
  // below to copy it into state. This avoids an intermediate no-session paint
  // between SWR resolving and the newer ChatThread empty state rendering.
  const displayedActiveId = activeId ?? sessions[0]?.id ?? null;

  const handleStartSession = useCallback(async () => {
    if (!workspaceSlug) return;
    try {
      const session = await chatService.createSession(workspaceSlug);
      setActiveId(session.id);
      setView("chat");
      await refetchSessions();
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

  // On first open, resume the most recent chat. A workspace without history
  // gets one empty session automatically so the first surface is Atlas' useful
  // empty state (with starter actions), not the chat-history launchpad.
  const initializedWorkspaceRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeId) return;
    if (sessions.length > 0) {
      setActiveId(sessions[0]!.id);
      setView("chat");
      return;
    }
    if (!sessionsData || !workspaceSlug || initializedWorkspaceRef.current === workspaceSlug) return;

    initializedWorkspaceRef.current = workspaceSlug;
    setView("chat");
    void handleStartSession();
  }, [activeId, handleStartSession, sessions, sessionsData, workspaceSlug]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!workspaceSlug) return;
      await chatService.deleteSession(workspaceSlug, sessionId);
      if (activeId === sessionId) {
        setActiveId(null);
        if (sessions.length === 1) initializedWorkspaceRef.current = null;
      }
      await refetchSessions();
    },
    [workspaceSlug, activeId, refetchSessions, sessions.length]
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

  const activeSession = sessions.find((s) => s.id === displayedActiveId);
  const persistSessionContext = useCallback(
    async (nextProjectId: string | undefined, nextPageId: string | undefined) => {
      if (!workspaceSlug || !displayedActiveId) return;
      try {
        await chatService.updateSessionContext(workspaceSlug, displayedActiveId, {
          projectId: nextProjectId,
          pageId: nextPageId,
          surface: "web",
        });
        await refetchSessions();
      } catch (err) {
        // Context sync is additive; a transient failure should not block chat.
        // eslint-disable-next-line no-console
        console.error("[agent-chat] context sync failed", err);
      }
    },
    [displayedActiveId, refetchSessions, workspaceSlug]
  );
  const handleScopeChange = useCallback(
    (nextProjectId: string | undefined) => {
      setScopeProjectId(nextProjectId);
      void persistSessionContext(nextProjectId, pageId);
    },
    [pageId, persistSessionContext]
  );
  const lastPersistedPageRef = useRef<{ sessionId: string; pageId: string | undefined } | null>(null);
  useEffect(() => {
    if (!displayedActiveId) return;
    const previous = lastPersistedPageRef.current;
    if (previous?.sessionId === displayedActiveId && previous.pageId === pageId) return;
    lastPersistedPageRef.current = { sessionId: displayedActiveId, pageId };
    // Opening Atlas inside a doc attaches it. Leaving/dismissing that doc
    // clears the attachment, but merely switching conversations does not.
    if (pageId || previous?.sessionId === displayedActiveId) {
      void persistSessionContext(scopeProjectId, pageId);
    }
  }, [displayedActiveId, pageId, persistSessionContext, scopeProjectId]);
  const lastPersistedProjectRef = useRef<{ sessionId: string; projectId: string | undefined } | null>(null);
  useEffect(() => {
    if (!displayedActiveId || pageId) return;
    const previous = lastPersistedProjectRef.current;
    if (previous?.sessionId === displayedActiveId && previous.projectId === projectId) return;
    lastPersistedProjectRef.current = { sessionId: displayedActiveId, projectId };
    if (projectId || previous?.sessionId === displayedActiveId) {
      void persistSessionContext(projectId, undefined);
    }
  }, [displayedActiveId, pageId, persistSessionContext, projectId]);
  useEffect(() => {
    if (!activeSession || projectId || pageId) return;
    setScopeProjectId(activeSession.context_project ?? undefined);
  }, [activeSession, pageId, projectId]);
  const activeAgent = useMemo(
    () => (activeSession ? (agents ?? []).find((a) => a.id === activeSession.agent) : undefined),
    [agents, activeSession]
  );
  const activePage = pageId ? projectPages.getPageById(pageId) : undefined;
  const activePageEditorRef = activePage?.editor.editorRef ?? null;
  const effectivePageId = pageId ?? activeSession?.context_page ?? undefined;
  // Pill label. Falls back to "Untitled" while a real doc is attached — the
  // pill should still show (and be dismissible) for unnamed docs.
  const activeDocTitle = activePage
    ? activePage.name?.trim() || "Untitled"
    : (activeSession?.context_page_name ?? undefined);
  const handleDismissDocContext = useCallback(() => {
    if (routeDocPageId) {
      setDismissedDocPageId(routeDocPageId);
      return;
    }
    void persistSessionContext(scopeProjectId, undefined);
  }, [persistSessionContext, routeDocPageId, scopeProjectId]);

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
      {/* Full mode always shows the chat — its persistent sessions sidebar
          replaces the history view-swap, so "history" only renders at the
          default width. */}
      {(view === "chat" || isExpanded) && (
        <ChatView
          workspaceSlug={workspaceSlug ?? ""}
          projectId={scopeProjectId}
          joinedProjectIds={joinedProjectIds}
          getProjectById={getProjectById}
          onScopeChange={handleScopeChange}
          sessionId={displayedActiveId}
          agent={activeAgent}
          sessions={sessions}
          pageId={effectivePageId}
          activeDocTitle={activeDocTitle}
          onDismissDocContext={handleDismissDocContext}
          activePageEditorRef={activePageEditorRef}
          onClose={onClose}
          onCollapse={onCollapse}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          onPickSession={(id) => {
            setActiveId(id);
            setView("chat");
          }}
          onDeleteSession={handleDeleteSession}
          dismissible={dismissible}
          onOpenHistory={() => setView("history")}
          onStartSession={handleStartSession}
          onClearSession={handleClearSession}
          onSentRefreshSessions={() => void refetchSessions()}
        />
      )}
      {view === "history" && !isExpanded && (
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
          onCollapse={onCollapse}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
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
  workspaceName: string;
  joinedProjectIds: string[];
  getProjectById: (projectId: string | undefined | null) => TProject | undefined;
  onChange: (projectId: string | undefined) => void;
}) {
  const { projectId, workspaceName, joinedProjectIds, getProjectById, onChange } = props;
  const current = projectId ? getProjectById(projectId) : undefined;
  const label = current?.name ?? workspaceName;
  return (
    <div className="flex min-w-0 items-center">
      <CustomMenu
        placement="top-start"
        closeOnSelect
        customButtonClassName="outline-none"
        customButton={
          <span className="flex h-6 items-center gap-1 rounded-md px-2 text-13 font-medium text-secondary transition-colors hover:bg-layer-1">
            <span className="max-w-[120px] truncate">{label}</span>
          </span>
        }
      >
        <CustomMenu.MenuItem className="text-13" onClick={() => onChange(undefined)}>
          {workspaceName}
        </CustomMenu.MenuItem>
        {joinedProjectIds.map((id) => {
          const project = getProjectById(id);
          if (!project) return null;
          return (
            <CustomMenu.MenuItem key={id} className="text-13" onClick={() => onChange(id)}>
              <span className="block max-w-[200px] truncate">{project.name}</span>
            </CustomMenu.MenuItem>
          );
        })}
      </CustomMenu>
    </div>
  );
}

function AtlasContextRequestCard({
  question,
  projects,
  onSelectProject,
  onSubmitCustom,
}: {
  question: string;
  projects: TProject[];
  onSelectProject: (project: TProject) => void;
  onSubmitCustom: (answer: string) => void;
}) {
  const [customAnswer, setCustomAnswer] = useState("");

  return (
    <li className="rounded-xl border border-subtle bg-layer-1/70 p-3">
      <div className="flex items-start gap-2.5">
        <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-1 text-accent-primary">
          <Folder className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-13 font-medium text-primary">Atlas needs a little more context</p>
          <p className="mt-0.5 text-12 leading-snug text-secondary">{question}</p>
        </div>
      </div>

      {projects.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelectProject(project)}
              className="t-press inline-flex max-w-full items-center rounded-full border border-subtle bg-surface-1 px-2.5 py-1 text-12 font-medium text-secondary transition-colors hover:border-strong hover:bg-surface-1 hover:text-primary"
            >
              <span className="truncate">Use {project.name}</span>
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          const answer = customAnswer.trim();
          if (!answer) return;
          onSubmitCustom(answer);
          setCustomAnswer("");
        }}
      >
        <input
          value={customAnswer}
          onChange={(event) => setCustomAnswer(event.target.value)}
          placeholder="Or tell Atlas what to use…"
          className="h-8 min-w-0 flex-1 rounded-lg border border-subtle bg-surface-1 px-2.5 text-12 text-primary outline-none placeholder:text-placeholder focus:border-strong"
          aria-label="Tell Atlas which context to use"
        />
        <button
          type="submit"
          disabled={customAnswer.trim().length === 0}
          className="t-press h-8 shrink-0 rounded-lg bg-accent-primary px-2.5 text-12 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>
      <p className="mt-2 text-11 text-tertiary">You can choose a suggestion or answer in your own words.</p>
    </li>
  );
}

function ChatView(props: {
  workspaceSlug: string;
  projectId: string | undefined;
  joinedProjectIds: string[];
  getProjectById: (projectId: string | undefined | null) => TProject | undefined;
  onScopeChange: (projectId: string | undefined) => void;
  pageId: string | undefined;
  activeDocTitle: string | undefined;
  onDismissDocContext: () => void;
  sessionId: string | null;
  agent: TAgent | undefined;
  sessions: TAgentChatSession[];
  activePageEditorRef: EditorRefApi | null;
  onClose: () => void;
  onCollapse?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onPickSession: (id: string) => void;
  onDeleteSession: (id: string) => Promise<void>;
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
    activeDocTitle,
    onDismissDocContext,
    sessionId,
    agent,
    sessions,
    activePageEditorRef,
    onClose,
    onCollapse,
    isExpanded,
    onToggleExpand,
    onPickSession,
    onDeleteSession,
    dismissible,
    onOpenHistory,
    onStartSession,
    onClearSession,
    onSentRefreshSessions,
  } = props;

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
          the right. Sits at min-h-14 to share the page-header baseline (tab
          band, pages topbar, sidebar switcher all center on the same line). */}
      <header className="relative flex min-h-14 flex-shrink-0 items-center gap-2 px-page-x">
        {/* Scroll fade for the thread. In full mode it starts after the
            sessions sidebar so it doesn't wash over the sidebar's header. */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-full right-0 z-10 h-6 bg-gradient-to-b from-surface-1 to-transparent",
            isExpanded ? "left-[260px]" : "left-0"
          )}
        />
        <span className="text-13 font-semibold text-secondary">Atlas</span>
        <span className="min-w-0 flex-1" />
        <div className="flex items-center gap-0.5">
          {/* Full mode has the persistent sessions sidebar — the history
              view-swap would be redundant there. */}
          {!isExpanded && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="t-press flex h-7 items-center gap-1 rounded-md px-2 text-13 font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
              aria-label="Chats"
            >
              <Dialog className="size-3.5" />
              Chats
            </button>
          )}
          <button
            type="button"
            onClick={() => void onStartSession()}
            className="t-press grid size-7 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
            aria-label="New chat"
            title="New chat"
          >
            <Plus className="size-4" />
          </button>
          {sessionId && (
            <>
              <span aria-hidden="true" className="bg-subtle mx-0.5 h-4 w-px" />
              <CustomMenu
                placement="bottom-end"
                customButtonClassName="outline-none"
                customButton={
                  <span
                    className="t-press grid size-7 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                    aria-label="More"
                    title="More"
                  >
                    <MoreHorizontal className="size-4" weight="Bold" />
                  </span>
                }
              >
                <CustomMenu.MenuItem className="text-13" onClick={openClearConfirm}>
                  <span className="flex items-center gap-2">
                    <Eraser className="size-3.5" />
                    Clear conversation
                  </span>
                </CustomMenu.MenuItem>
              </CustomMenu>
            </>
          )}
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="t-press grid size-7 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
              aria-label={isExpanded ? "Shrink chat" : "Expand chat"}
              title={isExpanded ? "Shrink chat" : "Expand chat"}
            >
              {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="t-press grid size-7 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
              aria-label="Collapse Atlas"
              title="Collapse Atlas"
            >
              <PanelRight className="size-4" />
            </button>
          )}
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              className="t-press grid size-7 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
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

      {/* Full mode is the Claude shape: persistent sessions sidebar on the
          left, conversation in a centered reading-width column. At the default
          drawer width the sidebar is absent and the max-width cap is inert
          (350 < cap), so this is the same single column as before. */}
      <div className="flex min-h-0 flex-1">
        {isExpanded && (
          <SessionsSidebar
            sessions={sessions}
            activeId={sessionId}
            onPickSession={onPickSession}
            onStartSession={onStartSession}
            onDeleteSession={onDeleteSession}
          />
        )}
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          {sessionId && (
            <ChatThread
              key={sessionId}
              workspaceSlug={workspaceSlug}
              sessionId={sessionId}
              projectId={projectId}
              pageId={pageId}
              activeDocTitle={activeDocTitle}
              onDismissDocContext={onDismissDocContext}
              agent={agent}
              activePageEditorRef={activePageEditorRef}
              joinedProjectIds={joinedProjectIds}
              getProjectById={getProjectById}
              onScopeChange={onScopeChange}
              onSentRefreshSessions={onSentRefreshSessions}
            />
          )}
        </div>
      </div>
    </>
  );
}

// Full-mode chats sidebar — the HistoryView list as persistent navigation
// (Claude/ChatGPT shape): new chat up top, sessions below, delete on hover.
function SessionsSidebar(props: {
  sessions: TAgentChatSession[];
  activeId: string | null;
  onPickSession: (id: string) => void;
  onStartSession: () => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
}) {
  const { sessions, activeId, onPickSession, onStartSession, onDeleteSession } = props;
  // Most recent first.
  const sortedSessions = orderBy(sessions, "last_activity_at", "desc");

  return (
    <div className="flex w-[260px] flex-shrink-0 flex-col border-r border-subtle">
      <div className="px-3 pb-2">
        <Button
          variant="neutral-primary"
          size="sm"
          onClick={() => void onStartSession()}
          className="w-full justify-center"
          prependIcon={<Plus />}
        >
          New chat
        </Button>
      </div>
      <ul className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto px-1.5 pb-2">
        {sortedSessions.length === 0 && (
          <li className="px-3 py-6 text-center text-12 text-tertiary">No past chats yet.</li>
        )}
        {sortedSessions.map((s) => (
          <li
            key={s.id}
            className={cn(
              "group flex items-center gap-2 rounded-md px-2 py-1.5",
              activeId === s.id ? "bg-layer-1" : "hover:bg-layer-1"
            )}
          >
            <button type="button" onClick={() => onPickSession(s.id)} className="min-w-0 flex-1 py-0.5 text-left">
              <div className="truncate text-13 text-primary">{s.display_title || s.title || "New chat"}</div>
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
  onCollapse?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  dismissible: boolean;
  onBack: (() => void) | undefined;
}) {
  const {
    sessions,
    activeId,
    onPickSession,
    onStartSession,
    onDeleteSession,
    onClose,
    onCollapse,
    isExpanded,
    onToggleExpand,
    onBack,
    dismissible,
  } = props;
  // Most recent first.
  const sortedSessions = orderBy(sessions, "last_activity_at", "desc");

  return (
    <>
      <header className="flex min-h-14 flex-shrink-0 items-center gap-2 px-page-x">
        <div className="flex flex-1 items-center gap-2">
          <div className="text-13 font-medium text-primary">Chats</div>
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
        {onToggleExpand && (
          <IconButton
            variant="tertiary"
            size="sm"
            icon={isExpanded ? Minimize2 : Maximize2}
            onClick={onToggleExpand}
            aria-label={isExpanded ? "Shrink chat" : "Expand chat"}
          />
        )}
        {onCollapse && (
          <IconButton variant="tertiary" size="sm" icon={PanelRight} onClick={onCollapse} aria-label="Collapse Atlas" />
        )}
        {dismissible && <IconButton variant="tertiary" size="sm" icon={X} onClick={onClose} aria-label="Close" />}
      </header>

      <div className="border-b border-subtle px-3 py-2">
        <Button
          variant="neutral-primary"
          size="sm"
          onClick={() => void onStartSession()}
          className="w-full justify-center"
          prependIcon={<Plus />}
        >
          New chat
        </Button>
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
            <button type="button" onClick={() => onPickSession(s.id)} className="min-w-0 flex-1 py-0.5 text-left">
              <div className="truncate text-13 text-primary">{s.display_title || s.title || "New chat"}</div>
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

// Connectors-style menu: lists the agent's connected integrations with on/off
// toggles (flips `enabled` and preserves the stored token), plus a link to
// Settings → Integrations to connect new ones.
function IntegrationsMenu({ workspaceSlug, agent }: { workspaceSlug: string; agent: TAgent | undefined }) {
  const servers = agent?.mcp_servers ?? [];
  const [busy, setBusy] = useState(false);
  const labelFor = (name: string) => INTEGRATIONS.find((i) => i.key === name)?.name ?? name;

  const toggle = async (target: TMcpServerSummary) => {
    if (!agent || !workspaceSlug || busy) return;
    setBusy(true);
    try {
      await agentService.update(workspaceSlug, agent.id, {
        mcp_servers_set: servers.map((s) => ({
          name: s.name,
          url: s.url,
          enabled: s.name === target.name ? !s.enabled : s.enabled,
        })),
      });
      await globalMutate(`agents/${workspaceSlug}`);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't update integration" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <CustomMenu
      placement="top-start"
      closeOnSelect={false}
      customButtonClassName="outline-none"
      customButton={
        <span
          className="t-press grid size-6 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
          aria-label="Integrations"
          title="Integrations"
        >
          <LayoutGrid className="size-3.5" />
        </span>
      }
    >
      <div className="min-w-[224px] p-1">
        <div className="px-2 py-1 text-11 font-medium text-tertiary">Integrations</div>
        {servers.length === 0 ? (
          <div className="px-2 py-2 text-12 text-tertiary">No integrations connected yet.</div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {servers.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-13 text-secondary"
              >
                <span className="truncate">{labelFor(s.name)}</span>
                <ToggleSwitch value={s.enabled} onChange={() => void toggle(s)} size="sm" disabled={busy} />
              </div>
            ))}
          </div>
        )}
        <div className="my-1 border-t border-subtle" />
        <Link
          href={`/${workspaceSlug}/settings/integrations`}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-13 text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
        >
          <Plus className="size-3.5" />
          Manage integrations
        </Link>
      </div>
    </CustomMenu>
  );
}

// Composer modes, shown as chips on doc surfaces. "Quick ask" is plain chat;
// the others bias Atlas toward writing into the open document.
type TAtlasAiMode = "quick-ask" | "create" | "plan" | "summarize";

const AI_MODES: { id: TAtlasAiMode; label: string }[] = [
  { id: "quick-ask", label: "Ask" },
  { id: "create", label: "Create" },
  { id: "plan", label: "Plan" },
  { id: "summarize", label: "Summarize" },
];

const ATLAS_LOADING_MESSAGES = [
  "Reading your request…",
  "Thinking through the best approach…",
  "Checking the relevant context…",
  "Writing a response…",
  "Polishing the details…",
];

type TAtlasContextRequest = {
  question: string;
  originalRequest: string;
};

function getAtlasContextQuestion(content: string, errorMessage = ""): string | null {
  const text = `${content}\n${errorMessage}`.toLowerCase();
  if (text.includes("no project is currently open")) {
    return "Which project should Atlas use for this?";
  }
  if (text.includes("no active project matching")) {
    return "I couldn't find that project. Which project should Atlas use instead?";
  }
  return null;
}

function getOrderedListContinuation(
  value: string,
  selectionStart: number,
  selectionEnd: number
): { value: string; cursor: number } | null {
  if (selectionStart !== selectionEnd) return null;

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEndIndex = value.indexOf("\n", selectionStart);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  if (selectionStart !== lineEnd) return null;

  const line = value.slice(lineStart, lineEnd);
  const emptyItem = /^(\s*)(\d+)\.\s*$/.exec(line);
  if (emptyItem) {
    const suffix = value.slice(lineEnd);
    const nextValue = `${value.slice(0, lineStart)}${suffix.startsWith("\n") ? "" : "\n"}${suffix}`;
    return { value: nextValue, cursor: lineStart + (suffix.startsWith("\n") ? 1 : 0) };
  }

  const item = /^(\s*)(\d+)\.\s+/.exec(line);
  if (!item) return null;
  const nextNumber = Number(item[2]) + 1;
  const continuation = `\n${item[1]}${nextNumber}. `;
  return {
    value: `${value.slice(0, selectionStart)}${continuation}${value.slice(selectionStart)}`,
    cursor: selectionStart + continuation.length,
  };
}

// Best-effort intent detection so the mode pill follows what the user types:
// "summarize…" → Summarize, "plan/outline…" → Plan, "write/create…" → Create,
// and anything else → Ask. Always resolves to a mode so the pill tracks the
// request both ways (a question after a "write…" draft flips back to Ask).
function inferAiMode(text: string): TAtlasAiMode {
  const t = text.toLowerCase();
  if (/\b(summari[sz]e|summary|tl;?dr|recap|condense|resum\w*)\b/.test(t)) return "summarize";
  if (
    /\b(plan|outline|roadmap|checklist|step[-\s]?by[-\s]?step|agenda|break\s+(?:this|it)?\s*down|organi[sz]e)\b/.test(t)
  )
    return "plan";
  if (
    /\b(write|draft|compose|re-?write|rewrite|edit|revise|expand|continue|create|generate|make|build|prepare|produce|put\s+together|crea\w*|escrib\w*|red[aá]ct\w*|genera\w*|haz\w*|prepar\w*)\b/.test(
      t
    )
  )
    return "create";
  return "quick-ask";
}

function ChatThread(props: {
  workspaceSlug: string;
  sessionId: string;
  projectId: string | undefined;
  pageId: string | undefined;
  activeDocTitle: string | undefined;
  onDismissDocContext: () => void;
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
    activeDocTitle,
    onDismissDocContext,
    agent,
    activePageEditorRef,
    joinedProjectIds,
    getProjectById,
    onScopeChange,
    onSentRefreshSessions,
  } = props;
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceName = getWorkspaceBySlug(workspaceSlug)?.name ?? "Whole workspace";
  const { data, mutate } = useSWR(
    `agent-chat/${workspaceSlug}/${sessionId}`,
    () => chatService.getSession(workspaceSlug, sessionId),
    { revalidateOnFocus: false }
  );
  const messages = data?.messages ?? [];

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [aiMode, setAiMode] = useState<TAtlasAiMode>("quick-ask");
  // @-mention: search docs / issues / bookmarks and pin them as context.
  const [docMentionMatch, setDocMentionMatch] = useState<TAtlasMentionMatch | null>(null);
  const [docMentionResults, setDocMentionResults] = useState<TAtlasMentionedReference[]>([]);
  const [docMentionIndex, setDocMentionIndex] = useState(0);
  const [isSearchingDocs, setIsSearchingDocs] = useState(false);
  const [docMentionError, setDocMentionError] = useState<string | null>(null);
  const [mentionedDocs, setMentionedDocs] = useState<TAtlasMentionedReference[]>([]);
  // Passage the user highlighted in the doc and chose to "Ask Atlas" about.
  // Seeded from the shared bridge on mount (the drawer opens *after* the pick,
  // so a window listener here would miss it), then kept live via subscribe.
  const [replyContext, setReplyContext] = useState<PendingReplyContext | null>(() => consumePendingReplyContext());
  // Wrap pending files with a stable id so list keys don't rely on
  // array index (two files with the same name would otherwise share a
  // key). The id is local to this component — never sent to the server.
  const [pendingFiles, setPendingFiles] = useState<{ id: string; file: File }[]>([]);
  const [contextRequest, setContextRequest] = useState<TAtlasContextRequest | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptHighlightRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contextProjects = useMemo(() => {
    const projects = joinedProjectIds
      .map((id) => getProjectById(id))
      .filter((project): project is TProject => Boolean(project));
    return orderBy(projects, "name", "asc").slice(0, 6);
  }, [getProjectById, joinedProjectIds]);

  const loadingMessages = useMemo(
    () =>
      aiMode === "create" || aiMode === "plan"
        ? ["Reading your request…", "Planning the next steps…", "Writing the draft…", "Polishing the details…"]
        : ATLAS_LOADING_MESSAGES,
    [aiMode]
  );

  useEffect(() => {
    if (!sending) return;
    const timer = window.setInterval(() => {
      setLoadingMessageIndex((index) => (index + 1) % loadingMessages.length);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [loadingMessages.length, sending]);

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
    const caretAtEnd = document.activeElement === el && el.selectionStart === el.value.length;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    if (caretAtEnd) el.scrollTop = el.scrollHeight;
    if (promptHighlightRef.current) promptHighlightRef.current.scrollTop = el.scrollTop;
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

  // Focus the composer if Atlas was just opened. WorkspaceContentWrapper
  // detects the visibility transition and focuses directly when it can; on a
  // first-ever open this thread mounts only after the sessions fetch, so it
  // consumes the pending flag here instead of racing the wrapper's attempt.
  // Synchronous on purpose: the textarea is committed and visible by effect
  // time, and consuming the one-shot flag inside a deferred callback would
  // interact badly with StrictMode's double-invoke.
  useEffect(() => {
    if (consumeAtlasComposerFocus()) textareaRef.current?.focus();
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

  // Drag-and-drop file attach. dragDepth counts enter/leave across nested
  // children so the overlay doesn't flicker as the cursor moves over them.
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragDepthRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
      handleAttach(e.dataTransfer.files);
    },
    [handleAttach]
  );

  // Atlas doc-write review. We snapshot the document HTML before the first
  // proposal is written (see handleSend) so "Discard Atlas changes" can revert
  // the doc in place. The live proposal count is mirrored from the editor —
  // per-proposal Accept/Reject happen in the document margin, so the bar must
  // react to the editor's state, not just the drawer's. When the review
  // resolves (count returns to 0 via the margin controls), the snapshot is
  // dropped so the Discard affordance disappears.
  const [atlasReviewSnapshot, setAtlasReviewSnapshot] = useState<string | null>(null);
  const [activeProposalCount, setActiveProposalCount] = useState(0);
  const prevProposalCountRef = useRef(0);

  useEffect(() => {
    if (!activePageEditorRef) {
      setActiveProposalCount(0);
      return;
    }
    const sync = () => {
      const count = activePageEditorRef.getActiveAtlasProposalCount();
      setActiveProposalCount(count);
      if (prevProposalCountRef.current > 0 && count === 0) {
        // Review was resolved through the in-margin controls — drop the
        // pre-session snapshot so the Discard bar hides itself.
        setAtlasReviewSnapshot(null);
      }
      prevProposalCountRef.current = count;
    };
    sync();
    return activePageEditorRef.onStateChange(sync);
  }, [activePageEditorRef]);

  const handleAcceptAllProposals = useCallback(() => {
    setAtlasReviewSnapshot(null);
    activePageEditorRef?.acceptAllAtlasProposals();
  }, [activePageEditorRef]);

  const handleRejectAllProposals = useCallback(() => {
    setAtlasReviewSnapshot(null);
    activePageEditorRef?.rejectAllAtlasProposals();
  }, [activePageEditorRef]);

  const handleDiscardAtlasChanges = useCallback(() => {
    if (!activePageEditorRef || atlasReviewSnapshot === null) return;
    if (
      !window.confirm(
        "Discard Atlas’s changes and revert the document to before this session? This also discards any manual edits you made since."
      )
    )
      return;
    const snapshot = atlasReviewSnapshot;
    setAtlasReviewSnapshot(null);
    activePageEditorRef.rejectAllAtlasProposals();
    activePageEditorRef.replaceProviderDocumentFromHTML(snapshot);
  }, [activePageEditorRef, atlasReviewSnapshot]);

  const searchMentionReferences = useCallback(
    async (query: string): Promise<TAtlasMentionedReference[]> => {
      if (!workspaceSlug) return [];
      let hadError = false;
      // Use the global workspace search (workspace_search: true) so @-mentions
      // reach docs/tasks in ANY project — the entity-search endpoint only
      // returns results when scoped to a single project_id. Bookmarks are
      // project-scoped, so only fold them in when a project scope is active.
      const [entity, bookmarkResponse] = await Promise.all([
        workspaceService.searchWorkspace(workspaceSlug, { search: query, workspace_search: true }).catch(() => {
          hadError = true;
          return null;
        }),
        projectId
          ? bookmarkService.listProjectBookmarks(workspaceSlug, projectId, { query }).catch(() => {
              hadError = true;
              return { results: [] } as Awaited<ReturnType<typeof bookmarkService.listProjectBookmarks>>;
            })
          : Promise.resolve({ results: [] } as Awaited<ReturnType<typeof bookmarkService.listProjectBookmarks>>),
      ]);

      const references: TAtlasMentionedReference[] = [];
      for (const issue of entity?.results.issue ?? []) {
        const identifier = [issue.project__identifier, issue.sequence_id].filter(Boolean).join("-");
        const title = issue.name?.trim() || identifier || "Untitled task";
        references.push({
          id: issue.id,
          insertText: getAtlasMentionToken(title, "task"),
          projectId: issue.project_id || undefined,
          title,
          type: "task",
        });
      }
      for (const page of entity?.results.page ?? []) {
        const title = page.name?.trim() || "Untitled doc";
        references.push({
          id: page.id,
          insertText: getAtlasMentionToken(title, "doc"),
          projectId: page.project_ids?.[0],
          title,
          type: "doc",
        });
      }
      for (const bookmark of (bookmarkResponse.results ?? []).slice(0, 8)) {
        const ref = bookmarkToMentionedReference(bookmark);
        if (ref) references.push(ref);
      }

      const unique = references.filter(
        (r, i, list) => list.findIndex((e) => referenceIdentity(e) === referenceIdentity(r)) === i
      );
      if (hadError && unique.length === 0) throw new Error("Could not search references.");
      return unique.slice(0, 12);
    },
    [projectId, workspaceSlug]
  );

  // @-mentions only carry a title/id from the picker. Before sending, pull each
  // referenced entity's actual body so Atlas grounds on the real doc/task
  // instead of guessing from the name (and answering "I couldn't find X").
  // Fetches run in parallel and fail soft: a reference we can't read still ships
  // its title/id so the model at least knows it was mentioned.
  const buildMentionedReferencesContext = useCallback(
    async (references: TAtlasMentionedReference[]): Promise<string> => {
      if (!workspaceSlug || references.length === 0) return "";
      const sources = await Promise.all(
        references.map(async (reference): Promise<TAtlasReferenceContextSource> => {
          try {
            if ((reference.type === "doc" || reference.type === "whiteboard") && reference.projectId) {
              const page = await projectPageService.fetchById(workspaceSlug, reference.projectId, reference.id, false);
              const content =
                reference.type === "whiteboard"
                  ? whiteboardJsonToPlainText(page.description_json)
                  : htmlToPlainText(page.description_html);
              return { ...reference, content };
            }
            if (reference.type === "task" && reference.projectId) {
              const issue = await issueService.retrieve(workspaceSlug, reference.projectId, reference.id);
              return { ...reference, content: issueToReferenceContextContent(issue) };
            }
            // Bookmarks carry their url/title on the reference itself, which
            // buildAtlasReferencesContext already emits — no body to fetch.
          } catch {
            // fall through to a content-less source
          }
          return { ...reference, content: "" };
        })
      );
      return buildAtlasReferencesContext(sources);
    },
    [workspaceSlug]
  );

  useEffect(() => {
    if (!workspaceSlug || !docMentionMatch) {
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
      const fallback = query.replace(/[-_]+/g, " ").trim();
      try {
        let refs = await searchMentionReferences(query);
        if (refs.length === 0 && fallback && fallback !== query) refs = await searchMentionReferences(fallback);
        if (!isActive) return;
        setDocMentionResults(refs);
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

  // Drop pinned references whose token the user has since deleted.
  useEffect(() => {
    setMentionedDocs((current) => current.filter((doc) => draft.includes(doc.insertText)));
  }, [draft]);

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

  const selectDocMention = useCallback(
    (doc: TAtlasMentionedReference | undefined) => {
      if (!docMentionMatch || !doc) return;
      const insertText = `${doc.insertText} `;
      const nextDraft = `${draft.slice(0, docMentionMatch.from)}${insertText}${draft
        .slice(docMentionMatch.to)
        .replace(/^\s+/, "")}`;
      const nextCursor = docMentionMatch.from + insertText.length;
      setDraft(nextDraft);
      setMentionedDocs((current) =>
        current.some((e) => referenceIdentity(e) === referenceIdentity(doc)) ? current : [...current, doc]
      );
      setDocMentionMatch(null);
      setDocMentionResults([]);
      setDocMentionError(null);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [docMentionMatch, draft]
  );

  const selectedDocMention = docMentionResults[docMentionIndex] ?? docMentionResults[0];
  const isDocMentionPickerOpen = Boolean(
    docMentionMatch &&
    (isSearchingDocs || docMentionResults.length > 0 || docMentionError || docMentionMatch.query.trim())
  );

  const handleSend = useCallback(
    async (override?: { content?: string; projectId?: string }) => {
      const trimmed = (override?.content ?? draft).trim();
      const hasFiles = pendingFiles.length > 0;
      // Snapshot the pinned passage now — by the time the request resolves the
      // user may have cleared it or picked another. Intent decides what we do
      // with it: an edit-like ask routes into the doc-write flow scoped to the
      // selection; anything else rides along as private grounding context.
      const reply = replyContext;
      // Allow attachments-only messages — common for "what's in this
      // CSV?" without any typed text.
      if ((!trimmed && !hasFiles) || sending) return;
      setContextRequest(null);
      setLoadingMessageIndex(0);
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
      const isWriteMode = aiMode === "create" || aiMode === "plan" || aiMode === "summarize";
      const shouldWriteIntoEditor = Boolean(
        activePageEditorRef &&
        !hasFiles &&
        (isWriteMode || isEditorWritingRequest(trimmed) || Boolean(replyContext && isSelectionEditRequest(trimmed)))
      );

      if (shouldWriteIntoEditor && activePageEditorRef && pageId) {
        const document = activePageEditorRef.getDocument();
        // Snapshot the doc BEFORE any proposal is written so "Discard Atlas
        // changes" can revert in place.
        setAtlasReviewSnapshot(document.html);
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
              project_id: override?.projectId ?? projectId,
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
                    current
                      ? { session: current.session, messages: [...current.messages, event.user_message] }
                      : current,
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
                // No proposals landed (empty/no-op result) — drop the snapshot so
                // the review bar doesn't linger over an unchanged document.
                if (activePageEditorRef.getActiveAtlasProposalCount() === 0) setAtlasReviewSnapshot(null);
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
          if (activePageEditorRef.getActiveAtlasProposalCount() === 0) setAtlasReviewSnapshot(null);
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
      setMentionedDocs([]);
      setDocMentionMatch(null);
      // Private grounding context: a pinned passage (so Atlas can resolve
      // "this/that") plus any @-mentioned docs/issues the user referenced. For
      // mentions we pull the referenced entity's actual body — not just its title
      // — so Atlas answers from the real content instead of searching by name.
      // The backend caps context_note at 12k chars.
      const mentionedRefs = mentionedDocs.filter((doc) => trimmed.includes(doc.insertText));
      const mentionNote = await buildMentionedReferencesContext(mentionedRefs);
      const replyNote = reply
        ? `The user highlighted this passage in the current document and is asking a follow-up about it:\n\n"""\n${reply.text}\n"""`
        : "";
      const contextNote = [replyNote, mentionNote].filter(Boolean).join("\n\n") || undefined;
      // Stream the reply token-by-token into an optimistic assistant bubble.
      // `local-assistant-` ids mark the placeholder so the "Thinking…" loader
      // steps aside once text starts, and the final `mutate()` swaps it for the
      // persisted server rows.
      const assistantLocalId = `local-assistant-${Date.now()}`;
      let streamed = "";
      let assistantAdded = false;
      try {
        await chatService.streamMessage(
          workspaceSlug,
          sessionId,
          trimmed,
          attachments,
          {
            project_id: override?.projectId ?? projectId,
            tool_mode: shouldWriteIntoEditor ? "none" : "auto",
            context_note: contextNote,
            fact_check: true,
          },
          {
            onDelta: (text) => {
              streamed += text;
              if (!assistantAdded) {
                assistantAdded = true;
                const placeholder: TAgentChatMessage = {
                  id: assistantLocalId,
                  session: sessionId,
                  user: null,
                  user_display_name: "",
                  user_avatar_url: "",
                  role: "assistant",
                  content: streamed,
                  attachments: [],
                  prompt_tokens: 0,
                  completion_tokens: 0,
                  total_tokens: 0,
                  cost_usd: 0,
                  error_message: "",
                  created_at: new Date().toISOString(),
                };
                void mutate(
                  (current) =>
                    current ? { session: current.session, messages: [...current.messages, placeholder] } : current,
                  { revalidate: false }
                );
              } else {
                void mutate(
                  (current) =>
                    current
                      ? {
                          session: current.session,
                          messages: current.messages.map((m) =>
                            m.id === assistantLocalId ? { ...m, content: streamed } : m
                          ),
                        }
                      : current,
                  { revalidate: false }
                );
              }
            },
            onDone: (res) => {
              const contextQuestion = getAtlasContextQuestion(
                res.assistant_message.content,
                res.assistant_message.error_message
              );
              if (contextQuestion) {
                setContextRequest({ question: contextQuestion, originalRequest: trimmed });
              }
              const generatedContent = res.assistant_message.content?.trim();
              if (shouldWriteIntoEditor && generatedContent && !res.assistant_message.error_message) {
                activePageEditorRef?.setEditorValueAtCursorPosition(markdownToEditorHtml(generatedContent));
                activePageEditorRef?.scrollToNodeViaDOMCoordinates({ behavior: "smooth" });
                setToast({
                  type: TOAST_TYPE.CURSOR_BUDDY_SUCCESS,
                  title: "Added to page",
                  message: `${agent?.name ?? "Atlas"} wrote it into the editor.`,
                });
              }
            },
            onError: (message) => {
              const contextQuestion = getAtlasContextQuestion("", message);
              if (contextQuestion) setContextRequest({ question: contextQuestion, originalRequest: trimmed });
              else setToast({ type: TOAST_TYPE.ERROR, title: "Send failed", message });
            },
          }
        );
        await mutate();
        onSentRefreshSessions();
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : ((err as { error?: string } | undefined)?.error ?? "Couldn't send message.");
        const contextQuestion = getAtlasContextQuestion("", msg);
        if (contextQuestion) setContextRequest({ question: contextQuestion, originalRequest: trimmed });
        else setToast({ type: TOAST_TYPE.ERROR, title: "Send failed", message: msg });
        await mutate();
      } finally {
        setSending(false);
      }
    },
    [
      activePageEditorRef,
      agent?.name,
      aiMode,
      draft,
      mentionedDocs,
      buildMentionedReferencesContext,
      pendingFiles,
      replyContext,
      sending,
      sessionId,
      workspaceSlug,
      projectId,
      pageId,
      mutate,
      onSentRefreshSessions,
    ]
  );

  const isEmpty = messages.length === 0;

  // Starter shortcuts for the empty state — scoped to what the user is
  // looking at: an open doc beats project, project beats workspace. The
  // label doubles as the prompt; clicking prefills the composer so the
  // user can tweak before sending.
  const emptyStateSuggestions = useMemo(() => {
    if (pageId)
      return [
        { icon: Sparkles, label: "Summarize this page" },
        { icon: Pencil, label: "Improve the writing on this page" },
        { icon: ListChecks, label: "Turn this page into action items" },
        { icon: Lightbulb, label: "Brainstorm what's missing here" },
      ];
    if (projectId)
      return [
        { icon: Search, label: "Catch me up on this project" },
        { icon: ListChecks, label: "Create tasks from my notes" },
        { icon: FileText, label: "Draft a project brief" },
        { icon: Lightbulb, label: "Brainstorm ideas for this project" },
      ];
    return [
      { icon: Search, label: "What's happening in my workspace?" },
      { icon: ListChecks, label: "Help me plan my week" },
      { icon: FileText, label: "Draft a doc for me" },
      { icon: Lightbulb, label: "Brainstorm ideas" },
    ];
  }, [pageId, projectId]);

  return (
    // Charts rendered deep inside message markdown offer "insert into doc" —
    // the context carries the open doc's editor ref down without threading it
    // through every message component.
    <ChatActiveEditorContext.Provider value={activePageEditorRef}>
      <div ref={scrollRef} className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto px-4 py-5">
        {isEmpty && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <img src="/atlas-dragon.svg" alt="Atlas" className="h-12 w-auto shrink-0 dark:invert" />
            <div className="space-y-1">
              <div className="text-14 font-medium text-primary">How can Atlas help?</div>
              <div className="max-w-xs text-12 text-tertiary">
                Ask a question, brainstorm, or paste in something you want rewritten. Tasks and pages are not
                auto-attached.
              </div>
            </div>
            <div className="mt-1 flex w-full max-w-xs flex-col">
              {emptyStateSuggestions.map((suggestion) => (
                <button
                  key={suggestion.label}
                  type="button"
                  className="t-press flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-13 text-secondary hover:bg-layer-1 hover:text-primary"
                  onClick={() => {
                    setDraft(suggestion.label);
                    textareaRef.current?.focus();
                  }}
                >
                  <suggestion.icon className="size-4 shrink-0 text-tertiary" />
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {!isEmpty && (
          <ul className="flex flex-col gap-4">
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
            {contextRequest && !sending && (
              <AtlasContextRequestCard
                question={contextRequest.question}
                projects={contextProjects}
                onSelectProject={(project) => {
                  setContextRequest(null);
                  onScopeChange(project.id);
                  void handleSend({ content: contextRequest.originalRequest, projectId: project.id });
                }}
                onSubmitCustom={(answer) => void handleSend({ content: answer })}
              />
            )}
            {/* Keep the loader up until the first streamed token arrives — once
                the assistant bubble starts filling it takes over. */}
            {sending && !messages.some((m) => m.id.startsWith("local-assistant-")) && (
              <li className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-12 text-tertiary" aria-live="polite">
                  <MorphingInfinity className="size-5" />
                  {loadingMessages[loadingMessageIndex % loadingMessages.length]}
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
        className="relative flex-shrink-0 bg-surface-1 px-3 pt-2 pb-2.5"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
        {isDraggingFiles && (
          <div className="border-accent-primary pointer-events-none absolute inset-1 z-20 flex items-center justify-center gap-2 rounded-xl border border-dashed bg-surface-1/90 text-13 font-medium text-accent-primary backdrop-blur-sm">
            <Paperclip className="size-4" />
            Drop files to attach
          </div>
        )}
        {(activeProposalCount > 0 || atlasReviewSnapshot !== null) && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-subtle bg-layer-1 px-2.5 py-1.5">
            <span className="mr-auto text-[11px] font-medium text-secondary">
              {activeProposalCount > 0
                ? `${activeProposalCount} Atlas ${activeProposalCount === 1 ? "edit" : "edits"} to review`
                : "Atlas edits applied"}
            </span>
            {activeProposalCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleAcceptAllProposals}
                  className="t-press inline-flex h-6 shrink-0 items-center rounded-full bg-accent-primary px-2.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  Accept all
                </button>
                <button
                  type="button"
                  onClick={handleRejectAllProposals}
                  className="t-press inline-flex h-6 shrink-0 items-center rounded-full border border-subtle px-2.5 text-[11px] font-medium text-secondary transition-colors hover:bg-layer-2 hover:text-primary"
                >
                  Reject all
                </button>
              </>
            )}
            {atlasReviewSnapshot !== null && (
              <button
                type="button"
                onClick={handleDiscardAtlasChanges}
                className="t-press inline-flex h-6 shrink-0 items-center rounded-full border border-subtle px-2.5 text-[11px] font-medium text-secondary transition-colors hover:bg-layer-2 hover:text-primary"
              >
                Discard Atlas changes
              </button>
            )}
          </div>
        )}
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
            "flex flex-col gap-1.5 rounded-xl border-[0.5px] border-subtle bg-surface-1 px-3 py-2 transition-colors focus-within:border-strong"
          )}
        >
          {pendingFiles.length > 0 && (
            <div className="-mx-3 -mt-2 overflow-hidden rounded-t-xl border-b border-subtle bg-layer-1">
              <ul aria-label="Attached files" className="divide-y divide-subtle">
                {pendingFiles.map((entry) => (
                  <PendingAttachmentContextRow
                    key={entry.id}
                    file={entry.file}
                    onRemove={() => handleRemovePending(entry.id)}
                  />
                ))}
              </ul>
            </div>
          )}
          {activeDocTitle !== undefined && (
            <div className="flex">
              {/* Current-doc context pill — shows which doc Atlas is grounded
                  in right now. The ✕ (revealed on hover) detaches the doc for
                  this visit; opening another doc re-attaches automatically. */}
              <span
                className="group/doc-pill flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full border border-subtle bg-layer-1 pr-1.5 pl-2 text-[11px] font-medium text-secondary"
                title={`Atlas is using "${activeDocTitle}" as context`}
              >
                <FileText className="size-3 shrink-0 text-tertiary" />
                <span className="truncate">{activeDocTitle}</span>
                <button
                  type="button"
                  onClick={onDismissDocContext}
                  className="grid size-4 shrink-0 place-items-center rounded-full text-tertiary opacity-0 transition-opacity group-hover/doc-pill:opacity-100 hover:bg-layer-2 hover:text-primary focus-visible:opacity-100"
                  aria-label={`Remove "${activeDocTitle}" from context`}
                >
                  <X className="size-3" />
                </button>
              </span>
            </div>
          )}
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
          <div className="relative flex items-center gap-2">
            {isDocMentionPickerOpen && (
              <div className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-full overflow-y-auto rounded-xl border border-subtle bg-surface-1 p-1.5 shadow-raised-200">
                {isSearchingDocs ? (
                  <div className="px-2 py-2 text-12 text-tertiary">Searching…</div>
                ) : docMentionResults.length > 0 ? (
                  <div className="space-y-0.5">
                    {docMentionResults.map((doc, index) => (
                      <button
                        key={referenceIdentity(doc)}
                        type="button"
                        onMouseEnter={() => setDocMentionIndex(index)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectDocMention(doc)}
                        className={cn(
                          "flex w-full flex-col rounded-lg px-2 py-1.5 text-left transition-colors",
                          index === docMentionIndex
                            ? "bg-layer-1 text-primary"
                            : "text-secondary hover:bg-layer-1 hover:text-primary"
                        )}
                      >
                        <span className="truncate text-12">{doc.title}</span>
                        <span className="truncate text-[10px] text-tertiary">
                          {getProjectById(doc.projectId)?.name ?? doc.subtitle ?? getAtlasReferenceTypeLabel(doc.type)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-2 text-12 text-tertiary">{docMentionError ?? "No results"}</div>
                )}
              </div>
            )}
            <div className="relative flex-1">
              {/* Highlight overlay: renders the draft with @mentions in pink
                  behind a transparent textarea (native textareas can't color a
                  substring). Must mirror the textarea's font/wrap exactly. */}
              <div
                ref={promptHighlightRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 max-h-40 overflow-hidden text-13 leading-snug break-words whitespace-pre-wrap"
              >
                {getAtlasPromptHighlightParts(draft).map((part) =>
                  part.isMention ? (
                    <span key={part.key} className="text-[#e548a5]">
                      {part.text}
                    </span>
                  ) : (
                    <span key={part.key} className="text-primary">
                      {part.text}
                    </span>
                  )
                )}
              </div>
              <textarea
                ref={textareaRef}
                // Stable hook for WorkspaceContentWrapper's open-Atlas
                // autofocus (it lives outside this tree).
                data-atlas-composer="true"
                value={draft}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft(value);
                  setAiMode(inferAiMode(value));
                  syncDocMentionMatch(value, e.target.selectionStart);
                }}
                onKeyDown={(e) => {
                  if (!docMentionMatch && e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    const continuation = getOrderedListContinuation(
                      e.currentTarget.value,
                      e.currentTarget.selectionStart,
                      e.currentTarget.selectionEnd
                    );
                    if (continuation) {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraft(continuation.value);
                      setAiMode(inferAiMode(continuation.value));
                      syncDocMentionMatch(continuation.value, continuation.cursor);
                      requestAnimationFrame(() => {
                        textareaRef.current?.focus();
                        textareaRef.current?.setSelectionRange(continuation.cursor, continuation.cursor);
                      });
                      return;
                    }
                  }
                  if (!docMentionMatch) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setDocMentionIndex((i) => (docMentionResults.length ? (i + 1) % docMentionResults.length : 0));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setDocMentionIndex((i) =>
                      docMentionResults.length ? (i - 1 + docMentionResults.length) % docMentionResults.length : 0
                    );
                  } else if ((e.key === "Enter" || e.key === "Tab") && selectedDocMention) {
                    e.preventDefault();
                    e.stopPropagation();
                    selectDocMention(selectedDocMention);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setDocMentionMatch(null);
                  }
                }}
                onKeyUp={(e) => syncDocMentionMatch(e.currentTarget.value, e.currentTarget.selectionStart)}
                onClick={(e) => syncDocMentionMatch(e.currentTarget.value, e.currentTarget.selectionStart)}
                onScroll={(e) => {
                  if (promptHighlightRef.current) promptHighlightRef.current.scrollTop = e.currentTarget.scrollTop;
                }}
                rows={1}
                placeholder="Message Atlas…  type @ to add a doc or task"
                className={cn(
                  "relative z-[1] block max-h-40 w-full resize-none overflow-y-auto bg-transparent p-0 text-13 leading-snug placeholder:text-placeholder focus:outline-none",
                  draft ? "text-transparent caret-[#e548a5]" : "text-primary"
                )}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || (draft.trim().length === 0 && pendingFiles.length === 0)}
              className="t-press flex shrink-0 items-center text-secondary transition-colors hover:text-primary disabled:opacity-40"
              aria-label="Send message"
            >
              {sending ? (
                <Spinner height="14px" width="14px" className="fill-current text-current/30" />
              ) : (
                <UndoLeft className="size-4 rotate-180" />
              )}
            </button>
          </div>
        </div>
        <div className="mt-0.5 flex items-center gap-1 px-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="t-press grid size-6 shrink-0 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
            aria-label="Attach file"
            title="Attach image, CSV, or PDF"
          >
            <Paperclip className="size-3.5" />
          </button>
          <IntegrationsMenu workspaceSlug={workspaceSlug} agent={agent} />
          <CustomMenu
            placement="top-start"
            closeOnSelect
            customButtonClassName="outline-none"
            customButton={
              <span className="flex h-6 items-center rounded-md px-2 text-13 font-medium text-secondary transition-colors hover:bg-layer-1">
                {AI_MODES.find((m) => m.id === aiMode)?.label ?? "Ask"}
              </span>
            }
          >
            {AI_MODES.map((m) => (
              <CustomMenu.MenuItem key={m.id} className="text-13" onClick={() => setAiMode(m.id)}>
                {m.label}
              </CustomMenu.MenuItem>
            ))}
          </CustomMenu>
          <AgentChatScopeBar
            projectId={projectId}
            workspaceName={workspaceName}
            joinedProjectIds={joinedProjectIds}
            getProjectById={getProjectById}
            onChange={onScopeChange}
          />
        </div>
      </div>
    </ChatActiveEditorContext.Provider>
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
    case "code": {
      // ```chart fences become chart blocks in the doc; other fences stay code.
      if (block.lang === "chart") {
        const spec = parseChartSpec(block.content);
        if (spec) return chartComponentHtml(spec);
      }
      return `<pre><code>${escapeHtml(block.content)}</code></pre>`;
    }
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

function PendingAttachmentContextRow({ file, onRemove }: { file: File; onRemove: () => void }) {
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

  const sizeLabel = formatAgentChatFileSize(file.size);
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toUpperCase() : undefined;
  const typeLabel = extension || (isImage ? "Image" : "File");

  return (
    <li className="flex w-full min-w-0 items-center gap-2 px-3 py-2 transition-colors hover:bg-layer-2">
      {/* type icon / image thumbnail */}
      <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-layer-2">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="size-7 object-cover" />
        ) : (
          <FileText className="size-3.5 text-secondary" />
        )}
      </div>
      {/* name + type · size */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-12 leading-tight font-medium text-primary" title={file.name}>
          {file.name}
        </p>
        <p className="text-11 leading-tight text-tertiary">
          {typeLabel} · {sizeLabel}
        </p>
      </div>
      {/* always-visible remove */}
      <button
        type="button"
        onClick={onRemove}
        className="t-press grid size-6 shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-1 hover:text-primary"
        aria-label={`Remove ${file.name}`}
        title={`Remove ${file.name}`}
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

const MessageRow = memo(function MessageRow({ message }: { message: TAgentChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    const visibleContent = stripCopilotContextForDisplay(message.content ?? "");
    const attachments = message.attachments ?? [];
    // User turns are right-aligned soft pills — no avatar needed,
    // the position alone signals authorship. Attachments render above
    // (image thumbnails or filename chips) inside the same bubble.
    return (
      <li className="flex justify-end">
        <div className="flex max-w-[85%] min-w-0 flex-col items-end gap-1.5">
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
            <div className="rounded-2xl rounded-br-md bg-layer-1 px-3.5 py-2 text-13 [overflow-wrap:anywhere] whitespace-pre-wrap text-primary">
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
          // Provider errors arrive as a raw JSON blob (litellm wrapping a
          // Gemini/OpenAI error). Render it as an error-tinted code snippet —
          // monospace on a soft danger surface — so it reads as machine output
          // and clearly as a failure. Lines wrap (whitespace-pre-wrap +
          // break-words) rather than scroll, so a long URL or quota id can't
          // push the drawer sideways. bg-danger-subtle + text-danger-primary
          // is the codebase's standard soft-error pairing.
          <pre className="font-mono my-0.5 max-w-full rounded bg-danger-subtle p-2 text-12 break-words whitespace-pre-wrap text-danger-primary">
            {message.error_message}
          </pre>
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
  | { kind: "code"; content: string; lang: string; closed: boolean }
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
      // `closed` distinguishes a finished fence from one still streaming in —
      // chart blocks render a placeholder until their fence closes.
      const closed = i < lines.length;
      if (closed) i++; // skip closing fence
      blocks.push({ kind: "code", content: collected.join("\n"), lang, closed });
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

// Strip inline markdown down to the plain text the user actually sees —
// what lands on the clipboard when copying an option from a reply.
function inlineMarkdownToPlainText(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*/g, "$1$2")
    .replace(/(^|[^_])_(?!\s)(.+?)(?<!\s)_/g, "$1$2")
    .replace(/\[\^[A-Za-z0-9_-]+\]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

/**
 * Hover actions on a text block (paragraph / list item / quote) in an
 * assistant reply — the copywriting loop: Atlas offers options, the user
 * copies one or swaps it straight over the text selected in the open doc.
 * Copy is always available; Replace only renders when a doc is attached
 * and targets the editor's current selection (ProseMirror keeps it while
 * focus sits in the chat), via `insertText`'s delete-range + insert.
 */
function BlockActions({ text }: { text: string }) {
  const activeEditorRef = useContext(ChatActiveEditorContext);
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
    },
    []
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inlineMarkdownToPlainText(text));
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't copy" });
      return;
    }
    setCopied(true);
    if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  const handleReplace = () => {
    if (!activeEditorRef) return;
    if (!activeEditorRef.getSelectedText()) {
      setToast({
        type: TOAST_TYPE.INFO,
        title: "Nothing selected",
        message: "Highlight the text in the doc you want to replace, then try again.",
      });
      return;
    }
    // Footnote refs would ride through as literal "[^1]" — drop them.
    activeEditorRef.insertText(inlineMarkdownToHtml(text.replace(/\[\^[A-Za-z0-9_-]+\]/g, "")));
    setToast({ type: TOAST_TYPE.SUCCESS, title: "Replaced in doc" });
  };

  return (
    // Span (not div) so it stays valid phrasing content inside a <p>.
    // pointer-events gate with the opacity so the invisible bar can't
    // swallow clicks on the text it floats over; focus-within keeps the
    // buttons reachable by keyboard.
    <span className="pointer-events-none absolute -top-2.5 right-0 z-10 flex items-center gap-0.5 rounded-md border-[0.5px] border-subtle bg-surface-1 p-0.5 not-italic opacity-0 shadow-raised-100 transition-opacity group-hover/opt:pointer-events-auto group-hover/opt:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="t-press grid size-5 place-items-center rounded text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
        aria-label="Copy text"
        title="Copy text"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
      {activeEditorRef && (
        <button
          type="button"
          onClick={handleReplace}
          className="t-press grid size-5 place-items-center rounded text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
          aria-label="Replace selected text in doc"
          title="Replace selected text in doc"
        >
          <ArrowRightLeft className="size-3" />
        </button>
      )}
    </span>
  );
}

function renderBlock(block: Block, key: number, footnotes: Footnote[]): React.ReactNode {
  switch (block.kind) {
    case "p":
      return (
        <p key={key} className="group/opt relative my-1.5 leading-snug first:mt-0 last:mb-0">
          {renderInline(block.text, footnotes)}
          <BlockActions text={block.text} />
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
        <ul key={key} className="my-1.5 ml-4 list-disc space-y-1.5 first:mt-0 last:mb-0">
          {block.items.map((item) => (
            // Block parent + item content form the key. If two items in
            // one list have identical text, React falls back to order —
            // the whole tree re-mounts when `source` changes anyway
            // (useMemo rebuilds the blocks array), so this is safe.
            <li key={`${key}-${item}`} className="group/opt relative leading-snug">
              {renderInline(item, footnotes)}
              <BlockActions text={item} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="my-1.5 ml-4 list-decimal space-y-1.5 first:mt-0 last:mb-0">
          {block.items.map((item) => (
            <li key={`${key}-${item}`} className="group/opt relative leading-snug">
              {renderInline(item, footnotes)}
              <BlockActions text={item} />
            </li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote key={key} className="group/opt relative my-1.5 border-l-2 border-subtle pl-2 text-secondary italic">
          {renderInline(block.text, footnotes)}
          <BlockActions text={block.text} />
        </blockquote>
      );
    case "code":
      // ```chart fences carry a JSON chart spec (see @/components/chart/spec)
      // that renders as an inline chart instead of code.
      if (block.lang === "chart") return <ChatChartBlock key={key} content={block.content} closed={block.closed} />;
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
// Lazy so recharts stays out of the drawer's chunk until a chart appears.
const LazyChartSpecView = lazy(() =>
  import("@/components/chart/spec-view").then((module) => ({ default: module.ChartSpecView }))
);

function ChartStreamingSkeleton() {
  return (
    <div className="my-2 flex h-40 w-full animate-pulse flex-col items-center justify-center gap-1.5 rounded-lg border border-subtle bg-layer-1">
      <ChartNoAxesColumn className="size-5 text-tertiary" />
      <span className="text-12 text-tertiary">Building chart…</span>
    </div>
  );
}

/**
 * The open doc's editor ref, provided by ChatView so charts inside message
 * markdown can offer one-click insertion. Null when no doc is open.
 */
const ChatActiveEditorContext = createContext<EditorRefApi | null>(null);

/**
 * A ```chart fence in an assistant reply. While the fence is still open the
 * JSON is mid-stream, so parse failures show a skeleton; once the fence is
 * closed, unparseable content is real model error — surface it as code so
 * it's debuggable instead of a placeholder that never resolves.
 */
function ChatChartBlock({ content, closed }: { content: string; closed: boolean }) {
  const activeEditorRef = useContext(ChatActiveEditorContext);
  const spec = useMemo(() => parseChartSpec(content), [content]);
  if (!spec) {
    if (closed) return <CodeBlock content={content} lang="json" />;
    return <ChartStreamingSkeleton />;
  }
  const insertIntoDoc = () => {
    if (!activeEditorRef) return;
    activeEditorRef.setEditorValueAtCursorPosition(chartComponentHtml(spec));
    setToast({ type: TOAST_TYPE.SUCCESS, title: "Chart added", message: "Inserted the chart into the open doc." });
  };
  return (
    <div className="group/chart relative my-2 w-full">
      {activeEditorRef && (
        <button
          type="button"
          className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border border-subtle bg-surface-1 px-1.5 py-0.5 text-11 text-secondary opacity-0 shadow-raised-100 transition-opacity group-hover/chart:opacity-100 hover:text-primary"
          onClick={insertIntoDoc}
        >
          <FileText className="size-3" />
          Insert into doc
        </button>
      )}
      <Suspense fallback={<ChartStreamingSkeleton />}>
        <LazyChartSpecView spec={spec} height={224} />
      </Suspense>
    </div>
  );
}

/** Serialize a chart spec as the editor's `<chart-component>` block HTML. */
function chartComponentHtml(spec: unknown): string {
  return `<chart-component chart="${escapeHtml(JSON.stringify(spec))}"></chart-component>`;
}

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

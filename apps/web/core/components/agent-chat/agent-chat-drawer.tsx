/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Avatar, CustomMenu } from "@plane/ui";
import { calculateTimeAgo, cn, getFileURL } from "@plane/utils";
// components
import {
  ChevronDown,
  FileText,
  History,
  Image as ImageIconBase,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "@/components/icons/lucide-shim";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
// services
import { AgentChatService } from "@/services/agent-chat.service";
import type {
  TAgentChatAttachment,
  TAgentChatAttachmentPayload,
  TAgentChatMessage,
  TAgentChatSession,
} from "@/services/agent-chat.service";
import { AgentService } from "@/services/agent.service";
import type { TAgent } from "@/services/agent.service";

const chatService = new AgentChatService();
const agentService = new AgentService();

type View = "chat" | "history";

/**
 * Topbar "Talk to AI" drawer.
 *
 * Single-column, chat-app feel. Two views:
 *   - `chat`     — the active conversation. Header carries the agent's
 *                  identity, a history button, and close. Composer at the
 *                  bottom with an embedded send button. Empty state shows
 *                  the agent's avatar large + a prompt.
 *   - `history`  — past sessions list. From here you can resume, delete,
 *                  or start a new chat (agent picker built into the
 *                  "New chat" affordance, not always-on-screen).
 *
 * The single-column shape mirrors the in-app chat UX in Linear / Cursor
 * / ChatGPT — past sessions are an *occasional* navigation, not an
 * always-visible sidebar that eats half the drawer width.
 */
export const AgentChatDrawer = observer(function AgentChatDrawer() {
  const { workspaceSlug: rawSlug } = useParams();
  const workspaceSlug = rawSlug?.toString();
  const { toggleAgentChat } = useAppTheme();
  const onClose = () => toggleAgentChat(false);

  // Agents in this workspace, used for the new-chat picker and to look
  // up the active session's agent metadata (avatar, model).
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

  const handleStartSession = useCallback(
    async (agentId: string) => {
      if (!workspaceSlug || !agentId) return;
      try {
        const session = await chatService.createSession(workspaceSlug, { agent_id: agentId });
        await refetchSessions();
        setActiveId(session.id);
        setView("chat");
      } catch (err) {
        // Surface so the user doesn't see the "Start chat" button click
        // and nothing happen — common failures are: agent disabled,
        // workspace permission, or a stale agent_id (record deleted).
        const message = (err as { error?: string } | undefined)?.error ?? "Couldn't start the chat. Try again.";
        setToast({ type: TOAST_TYPE.ERROR, title: "Chat error", message });
        // eslint-disable-next-line no-console
        console.error("[agent-chat] createSession failed", err);
      }
    },
    [workspaceSlug, refetchSessions]
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!workspaceSlug) return;
      await chatService.deleteSession(workspaceSlug, sessionId);
      if (activeId === sessionId) setActiveId(null);
      await refetchSessions();
    },
    [workspaceSlug, activeId, refetchSessions]
  );

  const activeSession = sessions.find((s) => s.id === activeId);
  const activeAgent = useMemo(
    () => (activeSession ? (agents ?? []).find((a) => a.id === activeSession.agent) : undefined),
    [agents, activeSession]
  );

  return (
    // In-flow column. The parent (WorkspaceContentWrapper) already
    // wraps us in a `pr-2 pb-2` gap-on-the-frame container, so we
    // just paint our own rounded surface here at the matching size.
    // Match the main workspace panel so the AI drawer reads as the same
    // surface family inside the app frame.
    <aside
      className={cn(
        "t-panel-slide flex h-full w-[420px] max-w-[95vw] flex-col overflow-hidden rounded-md border-[0.5px] border-subtle bg-surface-1"
      )}
      data-open="true"
    >
      {view === "chat" && (
        <ChatView
          workspaceSlug={workspaceSlug ?? ""}
          sessionId={activeId}
          agent={activeAgent}
          agents={agents ?? []}
          sessions={sessions}
          onClose={onClose}
          onOpenHistory={() => setView("history")}
          onStartSession={handleStartSession}
          onSentRefreshSessions={() => void refetchSessions()}
        />
      )}
      {view === "history" && (
        <HistoryView
          sessions={sessions}
          agents={agents ?? []}
          activeId={activeId}
          onPickSession={(id) => {
            setActiveId(id);
            setView("chat");
          }}
          onStartSession={handleStartSession}
          onDeleteSession={handleDeleteSession}
          onClose={onClose}
          onBack={activeId ? () => setView("chat") : undefined}
        />
      )}
    </aside>
  );
});

// ---------------------------------------------------------------- //
// Chat view                                                          //
// ---------------------------------------------------------------- //

function ChatView(props: {
  workspaceSlug: string;
  sessionId: string | null;
  agent: TAgent | undefined;
  agents: TAgent[];
  sessions: TAgentChatSession[];
  onClose: () => void;
  onOpenHistory: () => void;
  onStartSession: (agentId: string) => Promise<void>;
  onSentRefreshSessions: () => void;
}) {
  const { workspaceSlug, sessionId, agent, agents, onClose, onOpenHistory, onStartSession, onSentRefreshSessions } =
    props;

  return (
    <>
      {/* Header — agent identity on the left, history + close on the
          right. Sits at h-11 to match the page-level header strip. */}
      <header className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-subtle px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar size="md" name={agent?.name ?? "AI"} src={getFileURL(agent?.avatar_url ?? "")} className="shrink-0" />
          <div className="flex min-w-0 flex-col">
            <div className="truncate text-13 font-medium text-primary">{agent?.name ?? "Talk to AI"}</div>
            <div className="truncate text-11 text-tertiary">
              {agent?.provider_model || "Pick an agent to start chatting"}
            </div>
          </div>
        </div>
        <IconButton variant="tertiary" size="sm" icon={History} onClick={onOpenHistory} aria-label="Chat history" />
        <IconButton variant="tertiary" size="sm" icon={X} onClick={onClose} aria-label="Close" />
      </header>

      {sessionId ? (
        <ChatThread
          key={sessionId}
          workspaceSlug={workspaceSlug}
          sessionId={sessionId}
          agent={agent}
          onSentRefreshSessions={onSentRefreshSessions}
        />
      ) : (
        <NewChatLanding agents={agents} onStartSession={onStartSession} />
      )}
    </>
  );
}

function NewChatLanding(props: { agents: TAgent[]; onStartSession: (agentId: string) => Promise<void> }) {
  const { agents, onStartSession } = props;
  // Prefer an enabled agent as the default pick; fall back to the
  // first one in the list so the picker isn't empty even when
  // everything's disabled.
  const candidate = useMemo(() => agents.find((a) => a.is_enabled) ?? agents[0], [agents]);
  const [pickedId, setPickedId] = useState<string>("");
  // Sync the default selection once `agents` arrives from SWR. Without
  // this, mounting with an empty `agents` array (the SWR-loading state)
  // leaves `pickedId = ""` permanently, which disables the Start
  // button and looks broken when the user picks from the dropdown. We
  // only set when the user hasn't picked yet to avoid stomping a
  // manual selection.
  useEffect(() => {
    if (!pickedId && candidate?.id) setPickedId(candidate.id);
  }, [candidate?.id, pickedId]);

  const pickedAgent = agents.find((a) => a.id === pickedId);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-layer-1">
        <Sparkles className="size-5 text-accent-primary" />
      </div>
      <div className="space-y-1">
        <div className="text-14 font-medium text-primary">Chat with any agent</div>
        <div className="text-12 text-tertiary">
          Pick an agent and start a conversation — like ChatGPT, but in your workspace.
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="text-12 text-tertiary">No agents yet. Add one in Settings → Agents to start chatting.</div>
      ) : (
        <div className="flex w-full max-w-sm flex-col gap-2">
          {/* customButton is a <div> — CustomMenu wraps whatever you
              pass in its own <button>, so passing another <button>
              produces invalid nested-button HTML that Chrome renders
              but with broken click semantics. The div keeps the
              visual + lets CustomMenu own the interactivity. */}
          <CustomMenu
            customButton={
              <div className="flex w-full items-center justify-between rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary hover:bg-layer-2">
                <span className="truncate">{pickedAgent?.name ?? "Pick an agent"}</span>
                <ChevronDown className="size-3.5 text-tertiary" />
              </div>
            }
            placement="bottom-start"
            menuItemsClassName="w-72"
          >
            {agents.map((a) => (
              <CustomMenu.MenuItem
                key={a.id}
                onClick={() => setPickedId(a.id)}
                disabled={!a.is_enabled}
                className="flex items-center gap-2"
              >
                <Avatar size="sm" name={a.name} src={getFileURL(a.avatar_url ?? "")} className="shrink-0" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-13 text-primary">{a.name}</span>
                  <span className="truncate text-11 text-tertiary">
                    {a.is_enabled ? a.provider_model || "no model" : "Disabled"}
                  </span>
                </div>
              </CustomMenu.MenuItem>
            ))}
          </CustomMenu>
          <button
            type="button"
            onClick={() => {
              if (!pickedId) return;
              void onStartSession(pickedId);
            }}
            disabled={!pickedId}
            className="rounded-md bg-[#e548a5] px-3 py-2 text-13 font-medium text-white hover:bg-[#d93d9a] disabled:opacity-60"
          >
            Start chat
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- //
// History view                                                       //
// ---------------------------------------------------------------- //

function HistoryView(props: {
  sessions: TAgentChatSession[];
  agents: TAgent[];
  activeId: string | null;
  onPickSession: (id: string) => void;
  onStartSession: (agentId: string) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onClose: () => void;
  onBack: (() => void) | undefined;
}) {
  const { sessions, agents, activeId, onPickSession, onStartSession, onDeleteSession, onClose, onBack } = props;
  const enabled = agents.filter((a) => a.is_enabled);

  return (
    <>
      <header className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-subtle px-3">
        <div className="flex flex-1 items-center gap-2">
          <Sparkles className="size-4 text-accent-primary" />
          <div className="text-13 font-medium text-primary">Chat history</div>
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
        <IconButton variant="tertiary" size="sm" icon={X} onClick={onClose} aria-label="Close" />
      </header>

      {/* New chat launcher — picks an agent from a dropdown and
          starts a session in one click. customButton is a <div> so
          we don't end up with invalid nested <button> markup (the
          outer CustomMenu already supplies the real <button>). */}
      {agents.length > 0 && (
        <div className="border-b border-subtle px-3 py-2">
          <CustomMenu
            customButton={
              <div className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border-accent-strong bg-[#e548a5] px-3 py-2 text-13 font-medium text-white hover:bg-[#d93d9a]">
                <Plus className="size-3.5" />
                New chat
              </div>
            }
            placement="bottom-start"
            menuItemsClassName="w-72"
          >
            {agents.map((a) => (
              <CustomMenu.MenuItem
                key={a.id}
                disabled={!a.is_enabled}
                onClick={() => void onStartSession(a.id)}
                className="flex items-center gap-2"
              >
                <Avatar size="sm" name={a.name} src={getFileURL(a.avatar_url ?? "")} className="shrink-0" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-13 text-primary">{a.name}</span>
                  <span className="truncate text-11 text-tertiary">
                    {a.is_enabled ? a.provider_model || "no model" : "Disabled"}
                  </span>
                </div>
              </CustomMenu.MenuItem>
            ))}
            {enabled.length === 0 && (
              <CustomMenu.MenuItem onClick={() => {}} disabled className="text-12 text-tertiary">
                No enabled agents
              </CustomMenu.MenuItem>
            )}
          </CustomMenu>
        </div>
      )}

      <ul className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto">
        {sessions.length === 0 && <li className="px-3 py-6 text-center text-12 text-tertiary">No past chats yet.</li>}
        {sessions.map((s) => (
          <li
            key={s.id}
            className={cn(
              "group flex items-center gap-2 border-b border-subtle px-3 py-2 last:border-b-0",
              activeId === s.id ? "bg-layer-1" : "hover:bg-layer-1"
            )}
          >
            <Avatar size="sm" name={s.agent_name} src={getFileURL(s.agent_avatar_url ?? "")} className="shrink-0" />
            <button type="button" onClick={() => onPickSession(s.id)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-13 text-primary">{s.title || "New chat"}</div>
              <div className="flex items-center gap-1 truncate text-11 text-tertiary">
                <span className="truncate">{s.agent_name}</span>
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

function ChatThread(props: {
  workspaceSlug: string;
  sessionId: string;
  agent: TAgent | undefined;
  onSentRefreshSessions: () => void;
}) {
  const { workspaceSlug, sessionId, agent, onSentRefreshSessions } = props;
  const { data, mutate } = useSWR(
    `agent-chat/${workspaceSlug}/${sessionId}`,
    () => chatService.getSession(workspaceSlug, sessionId),
    { revalidateOnFocus: false }
  );
  const messages = data?.messages ?? [];

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
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

  // Keep this in sync with the server's `_MAX_IMAGE_BYTES`. JSON
  // payload ceilings are tight (Django: 5MB) and base64 inflates by
  // ~33%, so cap the *raw* image at 2.5MB on this side and let the
  // server enforce again as a belt-and-braces measure.
  const MAX_FILE_BYTES = 2_500_000;
  const MAX_FILES = 6;

  const handleAttach = useCallback(
    (filesList: FileList | null) => {
      if (!filesList || filesList.length === 0) return;
      const incoming = Array.from(filesList);
      // Reject anything bigger than the cap, and stop adding once we
      // hit the per-message file count. Surface a single toast per
      // batch so spamming attach doesn't fire 20 toasts.
      const accepted: { id: string; file: File }[] = [];
      let rejectedSize = 0;
      for (const f of incoming) {
        if (pendingFiles.length + accepted.length >= MAX_FILES) break;
        if (f.size > MAX_FILE_BYTES) {
          rejectedSize += 1;
          continue;
        }
        accepted.push({
          // Date.now() + random is enough — these ids live for one
          // composer session and only need uniqueness within the
          // pending list.
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
        });
      }
      if (rejectedSize > 0) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "File too large",
          message: `Files over ${Math.round(MAX_FILE_BYTES / 1_000_000)} MB were skipped.`,
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
      attachments = await Promise.all(pendingFiles.map((entry) => fileToAttachmentPayload(entry.file)));
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't read attachment" });
      setSending(false);
      return;
    }

    const optimistic: TAgentChatMessage = {
      id: `local-${Date.now()}`,
      session: sessionId,
      role: "user",
      content: trimmed,
      // Hydrate optimistic attachments so the bubble renders thumbnails
      // immediately instead of flashing in once the server echoes them.
      attachments: pendingFiles.map(({ file: f }, i) => ({
        name: f.name,
        mime_type: f.type || "application/octet-stream",
        size: f.size,
        kind: classifyFileKind(f.type || ""),
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
    try {
      await chatService.sendMessage(workspaceSlug, sessionId, trimmed, attachments);
      await mutate();
      onSentRefreshSessions();
    } catch (err) {
      const msg = (err as { error?: string } | undefined)?.error ?? "Couldn't send message.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Send failed", message: msg });
      await mutate();
    } finally {
      setSending(false);
    }
  }, [draft, pendingFiles, sending, sessionId, workspaceSlug, mutate, onSentRefreshSessions]);

  const isEmpty = messages.length === 0;

  return (
    <>
      <div ref={scrollRef} className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto px-4 py-5">
        {isEmpty && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Avatar
              size="lg"
              name={agent?.name ?? "AI"}
              src={getFileURL(agent?.avatar_url ?? "")}
              className="shrink-0"
            />
            <div className="space-y-1">
              <div className="text-14 font-medium text-primary">How can {agent?.name ?? "the agent"} help?</div>
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
              <MessageRow key={m.id} message={m} agent={agent} />
            ))}
            {sending && (
              <li className="flex items-center gap-2">
                <Avatar
                  size="sm"
                  name={agent?.name ?? "AI"}
                  src={getFileURL(agent?.avatar_url ?? "")}
                  className="shrink-0"
                />
                <span className="flex items-center gap-1 text-12 text-tertiary">
                  <Loader2 className="size-3 animate-spin" />
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
        className="flex-shrink-0 border-t border-subtle bg-surface-1 px-3 py-3"
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
        <input
          ref={fileInputRef}
          type="file"
          // Mirror the server-side accepted MIME types. The picker uses
          // both extension hints and mime types so the file dialog
          // filters sensibly on every OS.
          accept="image/png,image/jpeg,image/gif,image/webp,text/csv,application/pdf,.csv,.pdf"
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
            "flex flex-col gap-2 rounded-2xl border-[0.5px] border-subtle bg-layer-1 px-3 py-2 transition-colors focus-within:border-strong"
          )}
        >
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
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              placeholder={`Message ${agent?.name ?? "the agent"}…`}
              className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-13 leading-[1.4] text-primary placeholder:text-placeholder focus:outline-none"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="grid size-7 shrink-0 place-items-center rounded-full text-tertiary transition-colors hover:bg-layer-2 hover:text-primary"
              aria-label="Attach file"
              title="Attach image, CSV, or PDF"
            >
              <Paperclip className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || (draft.trim().length === 0 && pendingFiles.length === 0)}
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full transition-colors",
                (draft.trim().length === 0 && pendingFiles.length === 0) || sending
                  ? "bg-layer-2 text-tertiary"
                  : "bg-[#e548a5] text-white hover:bg-[#d93d9a]"
              )}
              aria-label="Send message"
            >
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            </button>
          </div>
        </div>
        <div className="mt-1.5 px-1 text-11 text-tertiary">
          <span className="font-medium">Enter</span> to send · <span className="font-medium">Shift+Enter</span> for
          newline · attach images, CSV, PDF
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ //
// Attachment helpers                                                   //
// ------------------------------------------------------------------ //

function classifyFileKind(mime: string): TAgentChatAttachment["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/csv" || mime === "application/csv" || mime.startsWith("text/")) return "text";
  return "other";
}

async function fileToAttachmentPayload(file: File): Promise<TAgentChatAttachmentPayload> {
  // FileReader → base64 in two steps: read as data URL, then strip the
  // `data:<mime>;base64,` prefix. ArrayBuffer + Uint8Array.toBase64
  // isn't widely supported yet (Safari).
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
  const kb = (file.size / 1024).toFixed(file.size > 1024 * 1024 ? 0 : 1);
  const sizeLabel = file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${kb} KB`;

  return (
    <li className="group relative inline-flex items-center gap-1.5 rounded-md border-[0.5px] border-subtle bg-surface-1 py-1 pr-1 pl-1.5">
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

function MessageRow({ message, agent }: { message: TAgentChatMessage; agent: TAgent | undefined }) {
  const isUser = message.role === "user";

  if (isUser) {
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
          {message.content && (
            <div className="rounded-2xl rounded-br-md bg-layer-2 px-3.5 py-2 text-13 whitespace-pre-wrap text-primary">
              {message.content}
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <li className="flex gap-2">
      <Avatar
        size="sm"
        name={agent?.name ?? "AI"}
        src={getFileURL(agent?.avatar_url ?? "")}
        className="mt-0.5 shrink-0"
      />
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
        {message.total_tokens > 0 && (
          <div className="text-11 text-tertiary">{message.total_tokens.toLocaleString()} tokens</div>
        )}
      </div>
    </li>
  );
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
    <li className="inline-flex items-center gap-1.5 rounded-md border-[0.5px] border-subtle bg-surface-1 py-1 pr-2 pl-1.5">
      <Icon className="size-3.5 text-tertiary" />
      <span className="max-w-[160px] truncate text-11 text-primary">{attachment.name}</span>
      <span className="text-11 text-tertiary">{sizeLabel}</span>
    </li>
  );
}

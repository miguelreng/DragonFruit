/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import useSWR from "swr";
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
        const message =
          (err as { error?: string } | undefined)?.error ?? "Couldn't start the chat. Try again.";
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
    // `bg-surface-2` is a hair darker than the brown main content so
    // the two read as distinct surfaces side-by-side instead of one
    // continuous strip.
    <aside
      className={cn(
        "border-subtle bg-surface-2 flex h-full w-[420px] max-w-[95vw] flex-col overflow-hidden rounded-md border-[0.5px]"
      )}
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
  const {
    workspaceSlug,
    sessionId,
    agent,
    agents,
    onClose,
    onOpenHistory,
    onStartSession,
    onSentRefreshSessions,
  } = props;

  return (
    <>
      {/* Header — agent identity on the left, history + close on the
          right. Sits at h-11 to match the page-level header strip. */}
      <header className="border-subtle flex h-11 flex-shrink-0 items-center gap-2 border-b px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar
            size="md"
            name={agent?.name ?? "AI"}
            src={getFileURL(agent?.avatar_url ?? "")}
            className="shrink-0"
          />
          <div className="flex min-w-0 flex-col">
            <div className="text-13 truncate font-medium text-primary">
              {agent?.name ?? "Talk to AI"}
            </div>
            <div className="text-11 truncate text-tertiary">
              {agent?.provider_model || "Pick an agent to start chatting"}
            </div>
          </div>
        </div>
        <IconButton
          variant="tertiary"
          size="sm"
          icon={History}
          onClick={onOpenHistory}
          aria-label="Chat history"
        />
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
  const candidate = useMemo(
    () => agents.find((a) => a.is_enabled) ?? agents[0],
    [agents]
  );
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
      <div className="bg-layer-1 grid size-12 place-items-center rounded-full">
        <Sparkles className="size-5 text-accent-primary" />
      </div>
      <div className="space-y-1">
        <div className="text-14 font-medium text-primary">Chat with any agent</div>
        <div className="text-12 text-tertiary">
          Pick an agent and start a conversation — like ChatGPT, but in your workspace.
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="text-12 text-tertiary">
          No agents yet. Add one in Settings → Agents to start chatting.
        </div>
      ) : (
        <div className="flex w-full max-w-sm flex-col gap-2">
          {/* customButton is a <div> — CustomMenu wraps whatever you
              pass in its own <button>, so passing another <button>
              produces invalid nested-button HTML that Chrome renders
              but with broken click semantics. The div keeps the
              visual + lets CustomMenu own the interactivity. */}
          <CustomMenu
            customButton={
              <div className="border-subtle bg-layer-1 text-13 hover:bg-layer-2 flex w-full items-center justify-between rounded-md border-[0.5px] px-3 py-2 text-primary">
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
                  <span className="text-13 truncate text-primary">{a.name}</span>
                  <span className="text-11 truncate text-tertiary">
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
            className="text-13 text-on-accent-primary rounded-md bg-accent-primary px-3 py-2 font-medium disabled:opacity-60"
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
      <header className="border-subtle flex h-11 flex-shrink-0 items-center gap-2 border-b px-3">
        <div className="flex flex-1 items-center gap-2">
          <Sparkles className="size-4 text-accent-primary" />
          <div className="text-13 font-medium text-primary">Chat history</div>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-12 hover:bg-layer-2 rounded px-2 py-1 text-secondary hover:text-primary"
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
        <div className="border-subtle border-b px-3 py-2">
          <CustomMenu
            customButton={
              <div className="border-accent-strong text-13 text-on-accent-primary hover:bg-accent-primary/90 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-accent-primary px-3 py-2 font-medium">
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
                  <span className="text-13 truncate text-primary">{a.name}</span>
                  <span className="text-11 truncate text-tertiary">
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
        {sessions.length === 0 && (
          <li className="text-12 px-3 py-6 text-center text-tertiary">
            No past chats yet.
          </li>
        )}
        {sessions.map((s) => (
          <li
            key={s.id}
            className={cn(
              "border-subtle group flex items-center gap-2 border-b px-3 py-2 last:border-b-0",
              activeId === s.id ? "bg-layer-1" : "hover:bg-layer-1"
            )}
          >
            <Avatar
              size="sm"
              name={s.agent_name}
              src={getFileURL(s.agent_avatar_url ?? "")}
              className="shrink-0"
            />
            <button
              type="button"
              onClick={() => onPickSession(s.id)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="text-13 truncate text-primary">{s.title || "New chat"}</div>
              <div className="text-11 flex items-center gap-1 truncate text-tertiary">
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
      (current) =>
        current
          ? { session: current.session, messages: [...current.messages, optimistic] }
          : current,
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
              <div className="text-14 font-medium text-primary">
                How can {agent?.name ?? "the agent"} help?
              </div>
              <div className="text-12 max-w-xs text-tertiary">
                Ask a question, brainstorm, or paste in something you want
                rewritten. Tasks and pages are not auto-attached.
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
                <span className="text-12 flex items-center gap-1 text-tertiary">
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
        className="border-subtle flex-shrink-0 border-t bg-surface-1 px-3 py-3"
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
            "border-subtle bg-layer-1 focus-within:border-strong flex flex-col gap-2 rounded-2xl border-[0.5px] px-3 py-2 transition-colors"
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
              className="text-13 placeholder:text-placeholder max-h-40 min-h-[24px] flex-1 resize-none bg-transparent leading-[1.4] text-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="hover:bg-layer-2 text-tertiary hover:text-primary grid size-7 shrink-0 place-items-center rounded-full transition-colors"
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
                  : "bg-accent-primary text-on-accent-primary hover:bg-accent-primary/90"
              )}
              aria-label="Send message"
            >
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            </button>
          </div>
        </div>
        <div className="text-11 mt-1.5 px-1 text-tertiary">
          <span className="font-medium">Enter</span> to send · <span className="font-medium">Shift+Enter</span> for newline · attach images, CSV, PDF
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
    <li className="border-subtle bg-surface-1 group relative inline-flex items-center gap-1.5 rounded-md border-[0.5px] py-1 pr-1 pl-1.5">
      {previewUrl ? (
        <img src={previewUrl} alt="" className="size-6 rounded object-cover" />
      ) : (
        <Icon className="size-3.5 text-tertiary" />
      )}
      <span className="text-11 max-w-[120px] truncate text-primary">{file.name}</span>
      <span className="text-11 text-tertiary">{sizeLabel}</span>
      <button
        type="button"
        onClick={onRemove}
        className="hover:bg-layer-2 ml-0.5 grid size-4 place-items-center rounded text-tertiary hover:text-primary"
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
            <div className="text-13 bg-layer-2 text-primary rounded-2xl rounded-br-md px-3.5 py-2 whitespace-pre-wrap">
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
          <div className="text-13 max-w-full text-error">{message.error_message}</div>
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
function AssistantMarkdown({ source }: { source: string }) {
  // `source` (not `children`) to avoid every component override below
  // shadowing the outer scope's `children` prop — keeps lint clean and
  // the intent obvious (this is the markdown source string).
  return (
    <div className="text-13 text-primary [&_pre]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-layer-2 [&_pre]:p-2 [&_pre]:text-12">
      <ReactMarkdown
        components={{
          // Paragraphs: tighter than the default browser stylesheet
          // so consecutive paragraphs hug each other inside the
          // bubble. Last-of-type kills the trailing margin.
          p: ({ children }) => <p className="my-1.5 leading-snug first:mt-0 last:mb-0">{children}</p>,
          // Lists: smaller indent than `ml-8` (the doc-context
          // default) so the bullet column doesn't push the text into
          // a narrow rail on a 420px drawer.
          ul: ({ children }) => <ul className="my-1.5 ml-4 list-disc space-y-0.5 first:mt-0 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 ml-4 list-decimal space-y-0.5 first:mt-0 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="leading-snug">{children}</li>,
          // Headings: assistant rarely emits H1; we map h1-h3 to
          // graduated weights inside the bubble.
          h1: ({ children }) => <h3 className="text-14 mt-2 mb-1 font-semibold first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="text-14 mt-2 mb-1 font-semibold first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="text-13 mt-2 mb-1 font-semibold first:mt-0">{children}</h4>,
          // Inline emphasis. `<strong>` shows up everywhere in
          // bullet-list outputs ("**Style:** …") — render with the
          // bubble's primary color so it pops without colour shift.
          strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          // Code: inline gets a soft pill; block (`<pre>` parent) is
          // styled at the wrapper via the arbitrary `[&_pre]` selectors
          // above, so the inner <code> just inherits.
          code: ({ children, className }) => {
            const isBlock = (className || "").includes("language-");
            if (isBlock) return <code className={className}>{children}</code>;
            return (
              <code className="font-mono text-[11px] rounded bg-layer-2 px-1 py-px">{children}</code>
            );
          },
          // Links open in a new tab — saves the user from blowing
          // away their chat by accident.
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-primary underline decoration-tertiary underline-offset-2 hover:decoration-accent-primary"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-subtle my-1.5 border-l-2 pl-2 text-secondary italic">{children}</blockquote>
          ),
          hr: () => <hr className="border-subtle my-2" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

// Renders one attachment inside a sent user bubble. Images get a small
// thumbnail (data_url comes back from the server, so no extra fetch);
// CSV/PDF/other render as a filename chip with a type icon.
function SentAttachmentChip({ attachment }: { attachment: TAgentChatAttachment }) {
  const isImage = attachment.kind === "image";
  if (isImage && attachment.data_url) {
    return (
      <li className="border-subtle bg-surface-1 overflow-hidden rounded-lg border-[0.5px]">
        <img
          src={attachment.data_url}
          alt={attachment.name}
          className="block max-h-48 max-w-[12rem] object-cover"
        />
      </li>
    );
  }
  const Icon = isImage ? ImageIconBase : FileText;
  const sizeLabel =
    attachment.size > 1024 * 1024
      ? `${(attachment.size / 1024 / 1024).toFixed(1)} MB`
      : `${(attachment.size / 1024).toFixed(attachment.size > 1024 * 1024 ? 0 : 1)} KB`;
  return (
    <li className="border-subtle bg-surface-1 inline-flex items-center gap-1.5 rounded-md border-[0.5px] py-1 pr-2 pl-1.5">
      <Icon className="size-3.5 text-tertiary" />
      <span className="text-11 max-w-[160px] truncate text-primary">{attachment.name}</span>
      <span className="text-11 text-tertiary">{sizeLabel}</span>
    </li>
  );
}

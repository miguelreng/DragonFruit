/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import useSWR from "swr";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// services
import { AgentService, type TAgentDraftKind, type TAgentRun, type TAgentToolCall } from "@/services/agent.service";

interface IAgentRunsPanelProps {
  workspaceSlug: string;
  agentId: string;
}

const agentService = new AgentService();
const EXECUTION_PHASES = ["plan", "act", "verify", "report"] as const;
type TExecutionPhase = (typeof EXECUTION_PHASES)[number];

const STATUS_STYLES: Record<TAgentRun["status"], string> = {
  pending: "bg-layer-3 text-tertiary",
  running: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  cancelled: "bg-layer-3 text-tertiary",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatTokens(n: number): string {
  if (!n) return "—";
  if (n < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}

function formatCost(usd: number): string {
  if (!usd) return "";
  if (usd < 0.01) return "<$0.01";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Parse the structured "(id=<uuid>)" suffix out of a tool-result string.
 * The post_comment and post_page_comment handlers always include the
 * created comment's id this way; we use it to surface approve/discard
 * buttons for draft posts without adding a separate API.
 *
 * Returns null when the tool call wasn't a draft-comment post.
 */
function extractDraftPointer(tc: TAgentToolCall): { id: string; kind: TAgentDraftKind } | null {
  const result = String(tc.result ?? "");
  if (!result.includes("draft")) return null;
  const match = result.match(/id=([0-9a-f-]{36})/i);
  if (!match) return null;
  const kind: TAgentDraftKind = tc.name === "post_page_comment" ? "page" : "issue";
  return { id: match[1], kind };
}

function getPhaseCoverage(toolCalls: TAgentToolCall[]): Set<TExecutionPhase> {
  const phases = new Set<TExecutionPhase>();
  for (const tc of toolCalls) {
    if (tc.name !== "record_step") continue;
    const argPhase = String(tc.arguments?.phase ?? "").toLowerCase();
    if (EXECUTION_PHASES.includes(argPhase as TExecutionPhase)) {
      phases.add(argPhase as TExecutionPhase);
      continue;
    }
    try {
      const parsed = JSON.parse(String(tc.result ?? "{}")) as { phase?: string };
      const parsedPhase = String(parsed.phase ?? "").toLowerCase();
      if (EXECUTION_PHASES.includes(parsedPhase as TExecutionPhase)) {
        phases.add(parsedPhase as TExecutionPhase);
      }
    } catch {
      // ignore parse errors from non-JSON tool results
    }
  }
  return phases;
}

export function AgentRunsPanel({ workspaceSlug, agentId }: IAgentRunsPanelProps) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // Track which drafts the user has already approved/discarded in this
  // session — the UI hides them optimistically before the next poll
  // refresh actually drops them from the tool_calls log. (They never
  // will drop, but once approved/discarded they're no longer actionable.)
  const [resolvedDrafts, setResolvedDrafts] = useState<Set<string>>(new Set());

  const {
    data: runs,
    isLoading,
    mutate,
  } = useSWR<TAgentRun[]>(
    workspaceSlug && agentId ? `AGENT_RUNS_${workspaceSlug}_${agentId}` : null,
    workspaceSlug && agentId ? () => agentService.runs(workspaceSlug, agentId) : null,
    { refreshInterval: 3000 }
  );

  const handleCancel = async (runId: string) => {
    if (cancellingId) return;
    setCancellingId(runId);
    try {
      await agentService.cancelRun(workspaceSlug, agentId, runId);
      await mutate();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Cancel requested" });
    } catch (err) {
      const message = (err as { error?: string } | undefined)?.error ?? "Could not cancel run";
      setToast({ type: TOAST_TYPE.ERROR, title: message });
    } finally {
      setCancellingId(null);
    }
  };

  const handleApprove = async (kind: TAgentDraftKind, commentId: string) => {
    try {
      await agentService.approveDraft(workspaceSlug, kind, commentId);
      setResolvedDrafts((s) => new Set(s).add(commentId));
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Comment approved" });
    } catch (err) {
      const message = (err as { error?: string } | undefined)?.error ?? "Could not approve";
      setToast({ type: TOAST_TYPE.ERROR, title: message });
    }
  };

  const handleDiscard = async (kind: TAgentDraftKind, commentId: string) => {
    if (!window.confirm("Discard this draft? The comment will be deleted.")) return;
    try {
      await agentService.discardDraft(workspaceSlug, kind, commentId);
      setResolvedDrafts((s) => new Set(s).add(commentId));
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Draft discarded" });
    } catch (err) {
      const message = (err as { error?: string } | undefined)?.error ?? "Could not discard";
      setToast({ type: TOAST_TYPE.ERROR, title: message });
    }
  };

  if (isLoading && !runs) {
    return <div className="px-4 py-3 text-caption-md-regular text-tertiary">Loading runs…</div>;
  }

  if (!runs || runs.length === 0) {
    return (
      <div className="px-4 py-3 text-caption-md-regular text-tertiary">
        No runs yet. Assign this agent to a task or @mention it to trigger one.
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-subtle">
      {runs.map((run) => {
        const isInFlight = run.status === "pending" || run.status === "running";
        const toolCalls = run.tool_calls ?? [];
        const toolNames = toolCalls.map((tc) => tc.name).filter((n): n is string => !!n);
        const toolSummary = toolNames.length === 0 ? null : Array.from(new Set(toolNames)).join(", ");
        const phaseCoverage = getPhaseCoverage(toolCalls);
        const drafts = toolCalls
          .map(extractDraftPointer)
          .filter((d): d is { id: string; kind: TAgentDraftKind } => !!d);
        const pendingDrafts = drafts.filter((d) => !resolvedDrafts.has(d.id));

        return (
          <li key={run.id} className="flex flex-col gap-2 px-4 py-2.5">
            <div className="flex items-start gap-3">
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-caption-sm-medium", STATUS_STYLES[run.status])}>
                {run.status}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body-xs-regular text-secondary">
                  <span className="font-medium">{run.trigger_event}</span>
                  <span className="text-tertiary">·</span>
                  <span className="text-tertiary">{formatRelative(run.created_at)}</span>
                  {run.total_tokens > 0 && (
                    <>
                      <span className="text-tertiary">·</span>
                      <span className="text-tertiary">{formatTokens(run.total_tokens)} tokens</span>
                    </>
                  )}
                  {run.iterations > 0 && (
                    <>
                      <span className="text-tertiary">·</span>
                      <span className="text-tertiary">
                        {run.iterations} turn{run.iterations === 1 ? "" : "s"}
                      </span>
                    </>
                  )}
                  {run.cost_usd > 0 && (
                    <>
                      <span className="text-tertiary">·</span>
                      <span className="text-tertiary">{formatCost(run.cost_usd)}</span>
                    </>
                  )}
                </div>
                {toolSummary && (
                  <div className="mt-0.5 truncate text-caption-sm-regular text-tertiary">called: {toolSummary}</div>
                )}
                {toolNames.includes("record_step") && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="text-caption-sm-regular text-tertiary">loop:</span>
                    {EXECUTION_PHASES.map((phase) => {
                      const done = phaseCoverage.has(phase);
                      return (
                        <span
                          key={`${run.id}-${phase}`}
                          className={cn(
                            "rounded px-1.5 py-0.5 text-caption-sm-medium",
                            done
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                              : "bg-layer-2 text-tertiary"
                          )}
                        >
                          {phase}
                        </span>
                      );
                    })}
                  </div>
                )}
                {run.error && (
                  <div className="text-danger-strong mt-0.5 truncate text-caption-sm-regular">{run.error}</div>
                )}
              </div>
              {isInFlight && (
                <button
                  type="button"
                  onClick={() => handleCancel(run.id)}
                  disabled={cancellingId === run.id || run.cancel_requested}
                  className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 shrink-0 rounded px-2 py-1 text-caption-sm-medium transition-colors disabled:opacity-50"
                >
                  {run.cancel_requested ? "stopping…" : "cancel"}
                </button>
              )}
            </div>
            {pendingDrafts.length > 0 && (
              <div className="border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20 ml-12 flex flex-wrap items-center gap-2 rounded border px-2 py-1.5">
                <span className="text-yellow-900 dark:text-yellow-200 text-caption-sm-medium">
                  {pendingDrafts.length === 1
                    ? "Draft comment awaiting approval"
                    : `${pendingDrafts.length} draft comments awaiting approval`}
                </span>
                {pendingDrafts.map((d) => (
                  <span key={d.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleApprove(d.kind, d.id)}
                      className="text-green-700 hover:bg-green-100 dark:text-green-300 dark:hover:bg-green-900/30 rounded px-2 py-0.5 text-caption-sm-medium"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDiscard(d.kind, d.id)}
                      className="text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/30 rounded px-2 py-0.5 text-caption-sm-medium"
                    >
                      Discard
                    </button>
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

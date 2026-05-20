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
import { AgentService, type TAgentRun } from "@/services/agent.service";

interface IAgentRunsPanelProps {
  workspaceSlug: string;
  agentId: string;
}

const agentService = new AgentService();

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

export function AgentRunsPanel({ workspaceSlug, agentId }: IAgentRunsPanelProps) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Poll every 3s while expanded so in-flight runs update without a refresh.
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

  if (isLoading && !runs) {
    return <div className="text-caption-md px-4 py-3 text-tertiary">Loading runs…</div>;
  }

  if (!runs || runs.length === 0) {
    return (
      <div className="text-caption-md px-4 py-3 text-tertiary">
        No runs yet. Assign this agent to a task or @mention it to trigger one.
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-subtle">
      {runs.map((run) => {
        const isInFlight = run.status === "pending" || run.status === "running";
        const toolNames = (run.tool_calls ?? []).map((tc) => tc.name);
        const toolSummary = toolNames.length === 0 ? null : Array.from(new Set(toolNames)).join(", ");

        return (
          <li key={run.id} className="flex items-start gap-3 px-4 py-2.5">
            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-caption-sm-medium", STATUS_STYLES[run.status])}>
              {run.status}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-body-xs flex items-center gap-2 text-secondary">
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
              </div>
              {toolSummary && (
                <div className="text-caption-sm mt-0.5 truncate text-tertiary">called: {toolSummary}</div>
              )}
              {run.error && (
                <div className="text-caption-sm text-red-600 dark:text-red-400 mt-0.5 truncate">{run.error}</div>
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
          </li>
        );
      })}
    </ul>
  );
}

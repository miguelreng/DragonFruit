/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import useSWR from "swr";
import { cn } from "@plane/utils";
import { WorkflowService, type TWorkflowNodeRun, type TWorkflowRun } from "@/services/workflow.service";
import type { TWorkflowNode } from "@/services/workflow.service";
import { ChevronDown, ChevronRight } from "@/components/icons/lucide-shim";
import { nodeDisplay, nodeKindLabel } from "./builder-helpers";

const workflowService = new WorkflowService();

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-layer-3 text-tertiary",
  running: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  completed: "bg-green-500/15 text-green-700 dark:text-green-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  cancelled: "bg-layer-3 text-tertiary",
  needs_input: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
};

function relative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

/** One-line human summary of a step's recorded output. */
function stepSummary(nr: TWorkflowNodeRun): string {
  const o = (nr.output ?? {}) as Record<string, unknown>;
  if (typeof o.matched === "boolean") return o.matched ? "Conditions matched" : "Conditions didn’t match — stopped";
  if (o.agent_status) return `Atlas run ${String(o.agent_status)}`;
  if (o.comment_id) return "Comment posted";
  if (o.state) return o.unchanged ? `Already in ${String(o.state)}` : `Moved to ${String(o.state)}`;
  if (Array.isArray(o.added)) return o.added.length ? `Added ${o.added.join(", ")}` : "No labels applied";
  if (o.status_code) return `Webhook responded ${String(o.status_code)}`;
  if (o.skipped) return String(o.reason ?? "Skipped");
  return "";
}

type Props = {
  workspaceSlug: string;
  workflowId: string | null;
  nodes: TWorkflowNode[];
  agentName: string;
};

export function WorkflowActivity({ workspaceSlug, workflowId, nodes, agentName }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { data: runs, isLoading } = useSWR<TWorkflowRun[]>(
    workspaceSlug && workflowId ? `WORKFLOW_RUNS_${workspaceSlug}_${workflowId}` : null,
    workspaceSlug && workflowId ? () => workflowService.runs(workspaceSlug, workflowId) : null,
    { refreshInterval: 4000 }
  );

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stepLabel = (nr: TWorkflowNodeRun): string => {
    const node = nodes.find((n) => n.id === nr.node);
    if (!node) return "Deleted step";
    const d = nodeDisplay(node, agentName);
    return `${nodeKindLabel(node.kind)} · ${d.title}`;
  };

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <div className="mb-3">
          <h3 className="text-15 font-medium text-primary">Activity</h3>
          <p className="text-12 text-tertiary">Runs of this workflow. Click a run to see each step. Updates live.</p>
        </div>
        {!workflowId ? (
          <p className="text-13 text-tertiary">Save the workflow to start recording runs.</p>
        ) : isLoading && !runs ? (
          <p className="text-13 text-tertiary">Loading runs…</p>
        ) : !runs || runs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-subtle p-8 text-center">
            <p className="text-15 font-medium text-secondary">No runs yet</p>
            <p className="mt-1 text-12 text-tertiary">Runs appear when the trigger fires, or use Test.</p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-subtle overflow-hidden rounded-lg border border-subtle bg-layer-1">
            {runs.map((run) => {
              const isOpen = expanded.has(run.id);
              const Chevron = isOpen ? ChevronDown : ChevronRight;
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => toggle(run.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-layer-2"
                    aria-expanded={isOpen}
                  >
                    <Chevron className="size-3.5 shrink-0 text-tertiary" />
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-11 font-medium",
                        STATUS_STYLES[run.status] ?? "bg-layer-3 text-tertiary"
                      )}
                    >
                      {run.status}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-12 text-secondary">
                        <span className="font-medium">{run.trigger_event}</span>
                        <span className="text-tertiary">·</span>
                        <span className="text-tertiary">{relative(run.created_at)}</span>
                        <span className="text-tertiary">·</span>
                        <span className="text-tertiary">
                          {run.node_runs.length} step{run.node_runs.length === 1 ? "" : "s"}
                        </span>
                        {run.total_tokens > 0 && (
                          <>
                            <span className="text-tertiary">·</span>
                            <span className="text-tertiary">{run.total_tokens} tokens</span>
                          </>
                        )}
                      </div>
                      {run.error && (
                        <p className="mt-0.5 truncate text-11 text-red-600 dark:text-red-400">{run.error}</p>
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <ol className="flex flex-col gap-1.5 border-t border-subtle bg-layer-2 px-4 py-3 pl-11">
                      {run.node_runs.length === 0 ? (
                        <li className="text-12 text-tertiary">No steps recorded.</li>
                      ) : (
                        run.node_runs.map((nr, idx) => (
                          <li key={nr.id} className="flex items-start gap-2.5">
                            <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-layer-3 text-10 font-medium text-tertiary">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2">
                                <span className="text-12 font-medium text-primary">{stepLabel(nr)}</span>
                                <span
                                  className={cn(
                                    "rounded px-1 py-px text-10 font-medium",
                                    STATUS_STYLES[nr.status] ?? "bg-layer-3 text-tertiary"
                                  )}
                                >
                                  {nr.status}
                                </span>
                              </div>
                              {stepSummary(nr) && <p className="text-11 text-tertiary">{stepSummary(nr)}</p>}
                              {nr.error && <p className="text-11 text-red-600 dark:text-red-400">{nr.error}</p>}
                            </div>
                          </li>
                        ))
                      )}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

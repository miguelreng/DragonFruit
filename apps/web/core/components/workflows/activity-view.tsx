/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import { cn } from "@plane/utils";
import { WorkflowService, type TWorkflowRun } from "@/services/workflow.service";

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

type Props = { workspaceSlug: string; workflowId: string | null };

export function WorkflowActivity({ workspaceSlug, workflowId }: Props) {
  const { data: runs, isLoading } = useSWR<TWorkflowRun[]>(
    workspaceSlug && workflowId ? `WORKFLOW_RUNS_${workspaceSlug}_${workflowId}` : null,
    workspaceSlug && workflowId ? () => workflowService.runs(workspaceSlug, workflowId) : null,
    { refreshInterval: 4000 }
  );

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <div className="mb-3">
          <h3 className="text-15 font-medium text-primary">Activity</h3>
          <p className="text-12 text-tertiary">Runs of this workflow. Updates live.</p>
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
            {runs.map((run) => (
              <li key={run.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-11 font-medium", STATUS_STYLES[run.status] ?? "bg-layer-3 text-tertiary")}>
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
                  {run.error && <p className="mt-0.5 truncate text-11 text-red-600 dark:text-red-400">{run.error}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

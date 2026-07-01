/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import type { IIssueLabel } from "@plane/types";
import { cn } from "@plane/utils";
import { ATLAS_IDENTITY } from "@/constants/atlas";
import type { TMcpServerSummary } from "@/services/agent.service";
import type { TWorkflowNode } from "@/services/workflow.service";
import type { TPartialProject } from "@/plane-web/types";
import { Bolt } from "@solar-icons/react/ssr";
import { ArrowRight, ListFilter, Sparkles, Trash, X } from "@/components/icons/lucide-shim";
import { ACTION_TYPES, TRIGGER_EVENTS, getFilters, nodeDisplay, type TConditionFilters } from "./builder-helpers";

const PRIORITY_OPTIONS = ["urgent", "high", "medium", "low", "none"] as const;
const SELECT_MULTI = "min-h-[112px] rounded-lg border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary";
const SELECT_ONE = "rounded-lg border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary";
const INPUT = "rounded-lg border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary placeholder:text-placeholder";

const KIND_PILL: Record<string, string> = {
  trigger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  condition: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  action: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

type Props = {
  open: boolean;
  onClose: () => void;
  node: TWorkflowNode | null;
  agentName: string;
  connectedApps: TMcpServerSummary[];
  projects: TPartialProject[];
  labels: IIssueLabel[];
  workspaceSlug: string;
  onChangeConfig: (config: Record<string, unknown>) => void;
  onDelete: () => void;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-subtle px-4 py-4 first:border-t-0">
      <h4 className="text-12 font-semibold text-tertiary">{title}</h4>
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-11 font-medium text-tertiary">{children}</span>;
}

export function WorkflowInspector({
  open,
  onClose,
  node,
  agentName,
  connectedApps,
  projects,
  labels,
  workspaceSlug,
  onChangeConfig,
  onDelete,
}: Props) {
  const sortedProjects = useMemo(
    // oxlint-disable-next-line no-array-sort
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );
  const sortedLabels = useMemo(
    // oxlint-disable-next-line no-array-sort
    () => [...labels].sort((a, b) => a.name.localeCompare(b.name)),
    [labels]
  );

  const kind = node?.kind ?? "trigger";
  const config = node?.config ?? {};
  const display = node ? nodeDisplay(node, agentName) : { title: "", subtitle: "" };
  const icon =
    kind === "trigger" ? (
      <Bolt weight="Bold" className="size-3.5" />
    ) : kind === "condition" ? (
      <ListFilter className="size-3.5" />
    ) : (
      <Sparkles className="size-3.5" />
    );

  const readMulti = (e: React.ChangeEvent<HTMLSelectElement>) =>
    Array.from(e.target.selectedOptions).map((o) => o.value);
  const filters = node ? getFilters(node) : {};
  const setFilters = (patch: Partial<TConditionFilters>) =>
    onChangeConfig({ ...config, filters: { ...filters, ...patch } });

  const actionType = String(config.type ?? "ask_atlas");
  const actionMeta = ACTION_TYPES.find((a) => a.value === actionType);

  return (
    <div
      className={cn(
        "absolute bottom-0 right-0 top-0 z-30 flex w-[360px] flex-col border-l border-subtle bg-layer-1 shadow-xl",
        "transition-transform duration-200 ease-out",
        open && node ? "translate-x-0" : "pointer-events-none translate-x-full"
      )}
      aria-hidden={!open || !node}
    >
      <div className="flex items-start justify-between gap-2 border-b border-subtle px-4 py-3">
        <div className="flex flex-col gap-2">
          <span className={cn("flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-12 font-semibold", KIND_PILL[kind])}>
            <span className="grid size-3.5 place-items-center">{icon}</span>
            {kind === "trigger" ? "Trigger" : kind === "condition" ? "Condition" : "Action"}
          </span>
          <div>
            <h3 className="text-15 font-semibold text-primary">{display.title}</h3>
            <p className="text-12 text-tertiary">{display.subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-tertiary t-press hover:bg-layer-2"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {kind === "trigger" && (
          <Section title="Trigger">
            <div className="flex flex-col gap-1">
              <Label>Event</Label>
              <select
                value={String(config.event ?? "issue_created")}
                onChange={(e) => onChangeConfig({ ...config, event: e.target.value, object: "issue" })}
                className={SELECT_ONE}
              >
                {TRIGGER_EVENTS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {String(config.event ?? "issue_created") !== "issue_created" && (
                <span className="text-11 text-amber-600 dark:text-amber-500">
                  Only “Task created” runs today; other triggers are coming soon.
                </span>
              )}
            </div>
          </Section>
        )}

        {kind === "condition" && (
          <Section title="Match conditions">
            <p className="text-12 text-tertiary">Continue only for tasks matching every filter. Leave empty to match all.</p>
            <div className="flex flex-col gap-1">
              <Label>Projects</Label>
              <select multiple value={filters.project_ids ?? []} onChange={(e) => setFilters({ project_ids: readMulti(e) })} className={SELECT_MULTI}>
                {sortedProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Priorities</Label>
              <select multiple value={filters.priorities ?? []} onChange={(e) => setFilters({ priorities: readMulti(e) })} className={SELECT_MULTI}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Labels</Label>
              <select multiple value={filters.label_ids ?? []} onChange={(e) => setFilters({ label_ids: readMulti(e) })} className={SELECT_MULTI}>
                {sortedLabels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Issue type IDs</Label>
              <input
                value={(filters.issue_type_ids ?? []).join(", ")}
                onChange={(e) =>
                  setFilters({ issue_type_ids: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })
                }
                placeholder="comma-separated IDs"
                className={INPUT}
              />
            </div>
          </Section>
        )}

        {kind === "action" && (
          <>
            <Section title="Action">
              <div className="flex flex-col gap-1">
                <Label>Type</Label>
                <select
                  value={actionType}
                  onChange={(e) => onChangeConfig({ ...config, type: e.target.value, params: config.params ?? {} })}
                  className={SELECT_ONE}
                >
                  {ACTION_TYPES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                      {a.live ? "" : " (soon)"}
                    </option>
                  ))}
                </select>
                {actionMeta && !actionMeta.live && (
                  <span className="text-11 text-amber-600 dark:text-amber-500">
                    This action isn’t executed yet — only “Ask {ATLAS_IDENTITY.name}” runs today.
                  </span>
                )}
              </div>
              {actionType === "ask_atlas" && (
                <div className="flex items-center gap-2 rounded-lg border-[0.5px] border-subtle bg-layer-2 px-3 py-2">
                  <span className="grid size-5 place-items-center text-blue-600 dark:text-blue-400">
                    <Sparkles className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-13 font-medium text-primary">Ask {agentName}</p>
                    <p className="truncate text-11 text-tertiary">Triage the task and post next steps.</p>
                  </div>
                </div>
              )}
            </Section>
            {actionType === "ask_atlas" && (
              <Section title="Apps Atlas can use">
                {connectedApps.length === 0 ? (
                  <p className="text-12 text-tertiary">No apps connected yet.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-subtle overflow-hidden rounded-lg border border-subtle">
                    {connectedApps.map((app) => (
                      <li key={app.name} className="flex items-center gap-2 px-3 py-2">
                        <ListFilter className="size-3.5 text-tertiary" />
                        <span className="truncate text-13 text-primary">{app.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href={`/${workspaceSlug}/settings/integrations`}
                  className="flex w-fit items-center gap-1 text-12 font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Manage in Integrations
                  <ArrowRight className="size-3.5" />
                </Link>
              </Section>
            )}
          </>
        )}

        {node && kind !== "trigger" && (
          <Section title="Danger zone">
            <button
              type="button"
              onClick={onDelete}
              className="flex w-fit items-center gap-1.5 rounded-lg border border-subtle px-2.5 py-1.5 text-12 font-medium text-red-600 t-press hover:bg-red-500/10"
            >
              <Trash className="size-3.5" />
              Delete this step
            </button>
          </Section>
        )}
      </div>
    </div>
  );
}

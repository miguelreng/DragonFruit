/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import type { IIssueLabel } from "@plane/types";
import { cn } from "@plane/utils";
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

function FilterMultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; name: string }>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {value.length > 0 && <span className="text-11 text-tertiary">{value.length} selected</span>}
      </div>
      <select
        multiple
        value={value}
        onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}
        className="min-h-[84px] rounded-lg border-[0.5px] border-subtle bg-layer-1 px-2 py-1.5 text-13 text-primary"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
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
  const params = (config.params as Record<string, unknown>) ?? {};
  const setParams = (patch: Record<string, unknown>) =>
    onChangeConfig({ ...config, params: { ...params, ...patch } });

  return (
    <div
      className={cn(
        "absolute bottom-4 right-4 top-4 z-30 flex w-[340px] flex-col overflow-hidden rounded-xl border border-subtle bg-layer-1 shadow-2xl",
        "transition-all duration-200 ease-out",
        open && node ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[calc(100%+1.5rem)] opacity-0"
      )}
      aria-hidden={!open || !node}
    >
      <div className="flex flex-col gap-2 border-b border-subtle px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-12 font-semibold", KIND_PILL[kind])}>
            <span className="grid size-3.5 place-items-center">{icon}</span>
            {kind === "trigger" ? "Trigger" : kind === "condition" ? "Condition" : "Action"}
          </span>
          <div className="flex items-center gap-1">
            {node && kind !== "trigger" && (
              <button
                type="button"
                onClick={onDelete}
                aria-label="Delete step"
                title="Delete step"
                className="grid size-7 place-items-center rounded-lg text-tertiary t-press hover:bg-red-500/10 hover:text-red-600"
              >
                <Trash className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="grid size-7 place-items-center rounded-lg text-tertiary t-press hover:bg-layer-2"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div>
          <h3 className="text-15 font-semibold text-primary">{display.title}</h3>
          <p className="text-12 text-tertiary">{display.subtitle}</p>
        </div>
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
                    {t.live ? "" : " (soon)"}
                  </option>
                ))}
              </select>
              {TRIGGER_EVENTS.find((t) => t.value === String(config.event ?? "issue_created"))?.live === false && (
                <span className="text-11 text-amber-600 dark:text-amber-500">
                  This trigger isn’t wired yet — coming soon.
                </span>
              )}
            </div>
          </Section>
        )}

        {kind === "condition" && (
          <Section title="Conditions">
            <p className="text-12 text-tertiary">
              Continue only for tasks that match all of these. Leave empty to match every task.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRIORITY_OPTIONS.map((p) => {
                  const on = (filters.priorities ?? []).includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setFilters({
                          priorities: on
                            ? (filters.priorities ?? []).filter((x) => x !== p)
                            : [...(filters.priorities ?? []), p],
                        })
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-12 capitalize t-press",
                        on
                          ? "border-transparent bg-custom-primary-100 text-white"
                          : "border-subtle text-secondary hover:bg-layer-2"
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
            <FilterMultiSelect
              label="Projects"
              options={sortedProjects.map((p) => ({ id: p.id, name: p.name }))}
              value={filters.project_ids ?? []}
              onChange={(v) => setFilters({ project_ids: v })}
            />
            <FilterMultiSelect
              label="Labels"
              options={sortedLabels.map((l) => ({ id: l.id, name: l.name }))}
              value={filters.label_ids ?? []}
              onChange={(v) => setFilters({ label_ids: v })}
            />
            <details>
              <summary className="cursor-pointer list-none text-11 font-medium text-tertiary hover:text-secondary">
                Advanced · issue type IDs
              </summary>
              <input
                value={(filters.issue_type_ids ?? []).join(", ")}
                onChange={(e) =>
                  setFilters({ issue_type_ids: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })
                }
                placeholder="comma-separated IDs"
                className={cn(INPUT, "mt-1.5 w-full")}
              />
            </details>
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
                    This action isn’t executed yet — coming soon.
                  </span>
                )}
              </div>
              {actionType === "post_comment" && (
                <div className="flex flex-col gap-1">
                  <Label>Comment</Label>
                  <textarea
                    value={String(params.text ?? "")}
                    onChange={(e) => setParams({ text: e.target.value })}
                    rows={4}
                    placeholder="The comment to post on the task…"
                    className={cn(INPUT, "resize-y")}
                  />
                </div>
              )}
              {actionType === "change_state" && (
                <div className="flex flex-col gap-1">
                  <Label>Target state</Label>
                  <input
                    value={String(params.state_name ?? "")}
                    onChange={(e) => setParams({ state_name: e.target.value })}
                    placeholder="e.g. In Progress"
                    className={INPUT}
                  />
                  <span className="text-11 text-tertiary">Matched by name within the triggered task’s project.</span>
                </div>
              )}
              {actionType === "add_label" && (
                <div className="flex flex-col gap-1">
                  <Label>Labels</Label>
                  <select
                    multiple
                    value={(params.label_ids as string[]) ?? []}
                    onChange={(e) => setParams({ label_ids: readMulti(e) })}
                    className={SELECT_MULTI}
                  >
                    {sortedLabels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-11 text-tertiary">Only labels in the task’s project are applied.</span>
                </div>
              )}
              {actionType === "webhook" && (
                <div className="flex flex-col gap-1">
                  <Label>URL</Label>
                  <input
                    value={String(params.url ?? "")}
                    onChange={(e) => setParams({ url: e.target.value })}
                    placeholder="https://example.com/hook"
                    className={INPUT}
                  />
                  <span className="text-11 text-tertiary">Receives a POST with the task payload.</span>
                </div>
              )}
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

      </div>
    </div>
  );
}

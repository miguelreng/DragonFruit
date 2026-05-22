/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { IIssueLabel } from "@plane/types";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TPartialProject } from "@/plane-web/types";
import {
  AgentService,
  type TAgent,
  type TAgentAutomation,
  type TAgentAutomationConditions,
} from "@/services/agent.service";
import { IssueLabelService } from "@/services/issue/issue_label.service";
import { ProjectService } from "@/services/project/project.service";

type Props = {
  workspaceSlug: string;
  agents: TAgent[];
  isOpen: boolean;
  onClose: () => void;
};

const agentService = new AgentService();
const projectService = new ProjectService();
const issueLabelService = new IssueLabelService();
const PRIORITY_OPTIONS = ["urgent", "high", "medium", "low", "none"] as const;

type TTab = "browse" | "manage";

const getConditionsSummary = (conditions: TAgentAutomationConditions): string => {
  const parts: string[] = [];
  if (conditions.project_ids?.length)
    parts.push(`${conditions.project_ids.length} project${conditions.project_ids.length > 1 ? "s" : ""}`);
  if (conditions.priorities?.length) parts.push(`priority: ${conditions.priorities.join(", ")}`);
  if (conditions.label_ids?.length)
    parts.push(`${conditions.label_ids.length} label${conditions.label_ids.length > 1 ? "s" : ""}`);
  if (conditions.issue_type_ids?.length) {
    parts.push(`${conditions.issue_type_ids.length} issue type ID${conditions.issue_type_ids.length > 1 ? "s" : ""}`);
  }
  return parts.length ? parts.join(" | ") : "All new tasks";
};

export function AgentAutomationsModal({ workspaceSlug, agents, isOpen, onClose }: Props) {
  const [tab, setTab] = useState<TTab>("browse");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id ?? "");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [issueTypeIdsInput, setIssueTypeIdsInput] = useState("");

  const {
    data: automations,
    mutate,
    isLoading,
  } = useSWR<TAgentAutomation[]>(
    isOpen && workspaceSlug ? `AGENT_AUTOMATIONS_${workspaceSlug}` : null,
    isOpen && workspaceSlug ? () => agentService.listAutomations(workspaceSlug) : null
  );
  const { data: projects } = useSWR<TPartialProject[]>(
    isOpen && workspaceSlug ? `AUTOMATION_PROJECTS_${workspaceSlug}` : null,
    isOpen && workspaceSlug ? () => projectService.getProjectsLite(workspaceSlug) : null
  );
  const { data: labels } = useSWR<IIssueLabel[]>(
    isOpen && workspaceSlug ? `AUTOMATION_LABELS_${workspaceSlug}` : null,
    isOpen && workspaceSlug ? () => issueLabelService.getWorkspaceIssueLabels(workspaceSlug) : null
  );

  // eslint-disable-next-line unicorn/no-array-sort
  const sortedAgents = useMemo(
    () => [...agents].sort((a: TAgent, b: TAgent) => a.name.localeCompare(b.name)),
    [agents]
  );
  const selectedAgent = sortedAgents.find((a) => a.id === selectedAgentId);
  const sortedProjects = useMemo(
    // eslint-disable-next-line unicorn/no-array-sort
    () => [...(projects ?? [])].sort((a: TPartialProject, b: TPartialProject) => a.name.localeCompare(b.name)),
    [projects]
  );
  const sortedLabels = useMemo(
    // eslint-disable-next-line unicorn/no-array-sort
    () => [...(labels ?? [])].sort((a: IIssueLabel, b: IIssueLabel) => a.name.localeCompare(b.name)),
    [labels]
  );

  const parsedIssueTypeIds = useMemo(
    () =>
      issueTypeIdsInput
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [issueTypeIdsInput]
  );

  const buildConditions = (): TAgentAutomationConditions => {
    const conditions: TAgentAutomationConditions = {};
    if (selectedProjectIds.length > 0) conditions.project_ids = selectedProjectIds;
    if (selectedPriorities.length > 0) {
      conditions.priorities = selectedPriorities as TAgentAutomationConditions["priorities"];
    }
    if (selectedLabelIds.length > 0) conditions.label_ids = selectedLabelIds;
    if (parsedIssueTypeIds.length > 0) conditions.issue_type_ids = parsedIssueTypeIds;
    return conditions;
  };

  const handleCreateIssueTriageAutomation = async () => {
    if (!workspaceSlug || !selectedAgentId) return;
    setIsCreating(true);
    try {
      const name = `Triage new task with ${selectedAgent?.name ?? "agent"}`;
      await agentService.createAutomation(workspaceSlug, {
        name,
        agent: selectedAgentId,
        trigger_event: "issue_created",
        is_enabled: true,
        conditions: buildConditions(),
      });
      await mutate();
      setTab("manage");
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Automation created" });
    } catch (err) {
      const message = (err as { error?: string } | undefined)?.error ?? "Could not create automation";
      setToast({ type: TOAST_TYPE.ERROR, title: message });
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleAutomation = async (automation: TAgentAutomation, next: boolean) => {
    try {
      await agentService.updateAutomation(workspaceSlug, automation.id, { is_enabled: next });
      await mutate();
    } catch (err) {
      const message = (err as { error?: string } | undefined)?.error ?? "Could not update automation";
      setToast({ type: TOAST_TYPE.ERROR, title: message });
    }
  };

  const handleDeleteAutomation = async (automation: TAgentAutomation) => {
    if (!window.confirm(`Delete automation "${automation.name}"?`)) return;
    try {
      await agentService.deleteAutomation(workspaceSlug, automation.id);
      await mutate();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Automation deleted" });
    } catch (err) {
      const message = (err as { error?: string } | undefined)?.error ?? "Could not delete automation";
      setToast({ type: TOAST_TYPE.ERROR, title: message });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXXXL}>
      <div className="bg-custom-background-100 flex h-[72vh] min-h-[560px] flex-col overflow-hidden rounded-lg">
        <div className="border-custom-border-200 flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="text-lg text-custom-text-100 font-semibold">Automations</h3>
            <p className="text-sm text-custom-text-300">Build ClickUp-style agent workflows from inside DragonFruit.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("browse")}
              className={cn(
                "text-sm rounded-md px-3 py-1.5 font-medium",
                tab === "browse"
                  ? "bg-custom-primary-100 text-white"
                  : "text-custom-text-300 hover:bg-custom-background-90"
              )}
            >
              Browse
            </button>
            <button
              type="button"
              onClick={() => setTab("manage")}
              className={cn(
                "text-sm rounded-md px-3 py-1.5 font-medium",
                tab === "manage"
                  ? "bg-custom-primary-100 text-white"
                  : "text-custom-text-300 hover:bg-custom-background-90"
              )}
            >
              Manage
            </button>
          </div>
        </div>

        {tab === "browse" && (
          <div className="flex-1 overflow-auto px-5 py-4">
            <div className="border-custom-border-200 bg-custom-background-90 mb-4 rounded-lg border p-4">
              <h4 className="text-sm text-custom-text-100 font-semibold">Suggested</h4>
              <p className="text-sm text-custom-text-300 mt-1">
                Triage every newly created task with an agent and post first next steps automatically.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="border-custom-border-300 bg-custom-background-100 text-sm text-custom-text-100 min-w-[240px] rounded-md border px-3 py-2"
                >
                  {sortedAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="primary"
                  size="base"
                  disabled={!selectedAgentId || isCreating}
                  onClick={handleCreateIssueTriageAutomation}
                >
                  {isCreating ? "Creating..." : "Create Automation"}
                </Button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-custom-text-300 font-medium uppercase">Projects</span>
                  <select
                    multiple
                    value={selectedProjectIds}
                    onChange={(e) => {
                      const values = Array.from(e.target.selectedOptions).map((option) => option.value);
                      setSelectedProjectIds(values);
                    }}
                    className="border-custom-border-300 bg-custom-background-100 text-sm text-custom-text-100 min-h-[96px] rounded-md border px-3 py-2"
                  >
                    {sortedProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-custom-text-300 font-medium uppercase">Priorities</span>
                  <select
                    multiple
                    value={selectedPriorities}
                    onChange={(e) => {
                      const values = Array.from(e.target.selectedOptions).map((option) => option.value);
                      setSelectedPriorities(values);
                    }}
                    className="border-custom-border-300 bg-custom-background-100 text-sm text-custom-text-100 min-h-[96px] rounded-md border px-3 py-2"
                  >
                    {PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-custom-text-300 font-medium uppercase">Labels</span>
                  <select
                    multiple
                    value={selectedLabelIds}
                    onChange={(e) => {
                      const values = Array.from(e.target.selectedOptions).map((option) => option.value);
                      setSelectedLabelIds(values);
                    }}
                    className="border-custom-border-300 bg-custom-background-100 text-sm text-custom-text-100 min-h-[96px] rounded-md border px-3 py-2"
                  >
                    {sortedLabels.map((label) => (
                      <option key={label.id} value={label.id}>
                        {label.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-custom-text-300 font-medium uppercase">Issue Type IDs</span>
                  <input
                    value={issueTypeIdsInput}
                    onChange={(e) => setIssueTypeIdsInput(e.target.value)}
                    placeholder="comma-separated IDs"
                    className="border-custom-border-300 bg-custom-background-100 text-sm text-custom-text-100 rounded-md border px-3 py-2"
                  />
                  <span className="text-xs text-custom-text-300">Use IDs until type picker is added.</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {tab === "manage" && (
          <div className="flex-1 overflow-auto px-5 py-4">
            {isLoading ? (
              <p className="text-sm text-custom-text-300">Loading automations…</p>
            ) : !automations || automations.length === 0 ? (
              <div className="border-custom-border-300 rounded-lg border border-dashed p-8 text-center">
                <p className="text-base text-custom-text-200 font-medium">No automations yet</p>
                <p className="text-sm text-custom-text-300 mt-1">Create one from the Browse tab.</p>
              </div>
            ) : (
              <div className="border-custom-border-200 overflow-hidden rounded-lg border">
                <table className="text-sm w-full text-left">
                  <thead className="bg-custom-background-90 text-custom-text-300">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Trigger</th>
                      <th className="px-3 py-2 font-medium">Agent</th>
                      <th className="px-3 py-2 font-medium">Conditions</th>
                      <th className="px-3 py-2 font-medium">Active</th>
                      <th className="px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {automations.map((automation) => (
                      <tr key={automation.id} className="border-custom-border-200 border-t">
                        <td className="text-custom-text-100 px-3 py-2">{automation.name}</td>
                        <td className="text-custom-text-200 px-3 py-2">{automation.trigger_event}</td>
                        <td className="text-custom-text-200 px-3 py-2">{automation.agent_name}</td>
                        <td className="text-custom-text-200 px-3 py-2">
                          {getConditionsSummary((automation.conditions ?? {}) as TAgentAutomationConditions)}
                        </td>
                        <td className="px-3 py-2">
                          <ToggleSwitch
                            value={automation.is_enabled}
                            onChange={() => handleToggleAutomation(automation, !automation.is_enabled)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteAutomation(automation)}
                            className="text-red-600 hover:bg-red-50 rounded px-2 py-1"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalCore>
  );
}

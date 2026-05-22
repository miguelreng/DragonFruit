/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { AgentService, type TAgent, type TAgentAutomation } from "@/services/agent.service";

type Props = {
  workspaceSlug: string;
  agents: TAgent[];
  isOpen: boolean;
  onClose: () => void;
};

const agentService = new AgentService();

type TTab = "browse" | "manage";

export function AgentAutomationsModal({ workspaceSlug, agents, isOpen, onClose }: Props) {
  const [tab, setTab] = useState<TTab>("browse");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id ?? "");

  const {
    data: automations,
    mutate,
    isLoading,
  } = useSWR<TAgentAutomation[]>(
    isOpen && workspaceSlug ? `AGENT_AUTOMATIONS_${workspaceSlug}` : null,
    isOpen && workspaceSlug ? () => agentService.listAutomations(workspaceSlug) : null
  );

  const sortedAgents = useMemo(() => agents.toSorted((a, b) => a.name.localeCompare(b.name)), [agents]);
  const selectedAgent = sortedAgents.find((a) => a.id === selectedAgentId);

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
        conditions: {},
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

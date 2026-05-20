/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { AgentsList, CreateAgentModal } from "@/components/agents";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { PageLoader } from "@/components/pages/loaders/page-loader";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import { AgentService, type TAgent, type TAgentCreatePayload } from "@/services/agent.service";
// local
import type { Route } from "./+types/page";
import { AgentsWorkspaceSettingsHeader } from "./header";

const agentService = new AgentService();

function AgentsSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const canAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const {
    data: agents,
    isLoading,
    mutate,
  } = useSWR<TAgent[]>(
    canAdmin && workspaceSlug ? `AGENTS_LIST_${workspaceSlug}` : null,
    canAdmin && workspaceSlug ? () => agentService.list(workspaceSlug) : null
  );

  const handleCreate = async (payload: TAgentCreatePayload) => {
    if (!workspaceSlug) throw new Error("missing workspace");
    const created = await agentService.create(workspaceSlug, payload);
    await mutate();
    return created;
  };

  const handleToggle = async (id: string, next: boolean) => {
    if (!workspaceSlug) return;
    try {
      await agentService.update(workspaceSlug, id, { is_enabled: next });
      await mutate();
    } catch (err) {
      const message = (err as { error?: string } | undefined)?.error ?? "Could not update agent";
      setToast({ type: TOAST_TYPE.ERROR, title: message });
    }
  };

  const handleDelete = async (id: string) => {
    if (!workspaceSlug) return;
    try {
      await agentService.destroy(workspaceSlug, id);
      await mutate();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Agent deleted" });
    } catch (err) {
      const message = (err as { error?: string } | undefined)?.error ?? "Could not delete agent";
      setToast({ type: TOAST_TYPE.ERROR, title: message });
    }
  };

  if (workspaceUserInfo && !canAdmin) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  if (isLoading || !agents) return <PageLoader />;

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Agents` : undefined;

  return (
    <SettingsContentWrapper header={<AgentsWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <CreateAgentModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />
        <SettingsHeading
          title="Agents"
          description="Bot members of this workspace that can be assigned to tasks. Each agent uses your own LLM key (BYOK)."
          control={
            <Button variant="primary" size="lg" onClick={() => setShowCreateModal(true)}>
              Add agent
            </Button>
          }
        />
        {agents.length > 0 ? (
          <div className="mt-4">
            <AgentsList agents={agents} onToggle={handleToggle} onDelete={handleDelete} />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col">
            <div className="flex h-full w-full items-center justify-center">
              <EmptyStateCompact
                assetKey="webhook"
                title="No agents yet"
                description="Create an agent and it’ll appear in the assignee picker. Assign it to a task to see it work."
                actions={[
                  {
                    label: "Add agent",
                    onClick: () => setShowCreateModal(true),
                  },
                ]}
                align="start"
                rootClassName="py-20"
              />
            </div>
          </div>
        )}
      </div>
    </SettingsContentWrapper>
  );
}

export default AgentsSettingsPage;

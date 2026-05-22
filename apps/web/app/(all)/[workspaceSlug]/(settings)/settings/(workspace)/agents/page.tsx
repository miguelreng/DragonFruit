/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { AgentAutomationsModal, AgentFormModal, AgentsList } from "@/components/agents";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { PageLoader } from "@/components/pages/loaders/page-loader";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import {
  AgentService,
  type TAgent,
  type TAgentCreatePayload,
  type TAgentUpdatePayload,
} from "@/services/agent.service";
// local
import type { Route } from "./+types/page";
import { AgentsWorkspaceSettingsHeader } from "./header";

const agentService = new AgentService();

function AgentsSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAutomationsModal, setShowAutomationsModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<TAgent | null>(null);
  const { t } = useTranslation();
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

  const handleUpdate = async (id: string, payload: TAgentUpdatePayload) => {
    if (!workspaceSlug) throw new Error("missing workspace");
    const updated = await agentService.update(workspaceSlug, id, payload);
    await mutate();
    return updated;
  };

  // Toggle semantics:
  //  - ON  → simple PATCH is_enabled=true; just resumes future dispatches.
  //  - OFF → call the dedicated `stop` endpoint, which both flips
  //    is_enabled to false AND sets cancel_requested on every pending/
  //    running AgentRun. The Celery loop polls that flag between turns
  //    and bails. We surface the cancelled-runs count in the toast so
  //    the admin knows in-flight work was actually killed (vs allowed
  //    to finish naturally).
  const handleToggle = async (id: string, next: boolean) => {
    if (!workspaceSlug) return;
    try {
      if (next) {
        await agentService.update(workspaceSlug, id, { is_enabled: true });
        await mutate();
        return;
      }
      const stopped = await agentService.stop(workspaceSlug, id);
      await mutate();
      const cancelled = stopped.cancelled_runs ?? 0;
      if (cancelled > 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("workspace_settings.settings.agents.stopped.title"),
          message: t("workspace_settings.settings.agents.stopped.cancelled", { count: cancelled }),
        });
      }
    } catch (err) {
      const message =
        (err as { error?: string } | undefined)?.error ?? t("workspace_settings.settings.agents.update_error");
      setToast({ type: TOAST_TYPE.ERROR, title: message });
    }
  };

  const handleDelete = async (id: string) => {
    if (!workspaceSlug) return;
    try {
      await agentService.destroy(workspaceSlug, id);
      await mutate();
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("workspace_settings.settings.agents.delete_success") });
    } catch (err) {
      const message =
        (err as { error?: string } | undefined)?.error ?? t("workspace_settings.settings.agents.delete_error");
      setToast({ type: TOAST_TYPE.ERROR, title: message });
    }
  };

  const handleUpdateTrigger = async (id: string, key: keyof TAgent["triggers"], next: boolean) => {
    if (!workspaceSlug) return;
    try {
      // PATCH accepts a partial `triggers` map and merges it server-side,
      // so we only send the one we're changing.
      await agentService.update(workspaceSlug, id, { triggers: { [key]: next } });
      await mutate();
    } catch (err) {
      const message =
        (err as { error?: string } | undefined)?.error ?? t("workspace_settings.settings.agents.update_error");
      setToast({ type: TOAST_TYPE.ERROR, title: message });
    }
  };

  if (workspaceUserInfo && !canAdmin) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  if (isLoading || !agents) return <PageLoader />;

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.agents.title")}`
    : undefined;

  return (
    <SettingsContentWrapper header={<AgentsWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <AgentFormModal
          mode="create"
          workspaceSlug={workspaceSlug}
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
        />
        {editingAgent && (
          <AgentFormModal
            mode="edit"
            workspaceSlug={workspaceSlug}
            isOpen={!!editingAgent}
            agent={editingAgent}
            onClose={() => setEditingAgent(null)}
            onSubmit={handleUpdate}
          />
        )}
        <AgentAutomationsModal
          workspaceSlug={workspaceSlug}
          agents={agents}
          isOpen={showAutomationsModal}
          onClose={() => setShowAutomationsModal(false)}
        />
        <SettingsHeading
          title={t("workspace_settings.settings.agents.heading")}
          description={t("workspace_settings.settings.agents.description")}
          control={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="lg" onClick={() => setShowAutomationsModal(true)}>
                Automations
              </Button>
              <Button variant="primary" size="lg" onClick={() => setShowCreateModal(true)}>
                {t("workspace_settings.settings.agents.add_agent")}
              </Button>
            </div>
          }
        />
        {agents.length > 0 ? (
          <div className="mt-4">
            <AgentsList
              agents={agents}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onEdit={setEditingAgent}
              onUpdateTrigger={handleUpdateTrigger}
            />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col">
            <div className="flex h-full w-full items-center justify-center">
              <EmptyStateCompact
                assetKey="webhook"
                title={t("workspace_settings.settings.agents.empty.title")}
                description={t("workspace_settings.settings.agents.empty.description")}
                actions={[
                  {
                    label: t("workspace_settings.settings.agents.add_agent"),
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

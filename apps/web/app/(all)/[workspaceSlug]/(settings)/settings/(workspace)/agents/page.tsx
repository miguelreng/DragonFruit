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
const ATLAS_DEFAULTS = {
  name: "Atlas",
  description: "The workspace companion for docs, chat, tasks, and automations.",
  system_prompt: "You are Atlas, a helpful workspace companion for DragonFruit.",
};

const normalizeAtlasProfile = (agent: TAgent): TAgent => ({ ...agent, name: ATLAS_DEFAULTS.name });

const getAtlasProfile = (agents: TAgent[]) => {
  // `toSorted` (ES2023) is not available in this app's TS lib config.
  // oxlint-disable-next-line no-array-sort
  const agent = [...agents].sort((a, b) => {
    if (a.is_enabled !== b.is_enabled) return a.is_enabled ? -1 : 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })[0];
  return agent ? normalizeAtlasProfile(agent) : undefined;
};

function AgentsSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
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
  const atlasAgent = getAtlasProfile(agents);
  const visibleAgents = atlasAgent ? [atlasAgent] : [];

  const handleInitializeAtlas = async () => {
    try {
      const created = await handleCreate(ATLAS_DEFAULTS);
      setEditingAgent(normalizeAtlasProfile(created));
    } catch (err) {
      const message =
        (err as { error?: string } | undefined)?.error ?? t("workspace_settings.settings.agents.update_error");
      setToast({ type: TOAST_TYPE.ERROR, title: message });
    }
  };

  return (
    <SettingsContentWrapper header={<AgentsWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className="w-full">
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
          agents={visibleAgents}
          isOpen={showAutomationsModal}
          onClose={() => setShowAutomationsModal(false)}
        />
        <SettingsHeading
          title={t("workspace_settings.settings.agents.heading")}
          description={t("workspace_settings.settings.agents.description")}
          control={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setShowAutomationsModal(true)}
                disabled={!atlasAgent}
              >
                Automations
              </Button>
              {atlasAgent ? (
                <Button variant="primary" size="lg" onClick={() => setEditingAgent(atlasAgent)}>
                  Configure Atlas
                </Button>
              ) : (
                <Button variant="primary" size="lg" onClick={handleInitializeAtlas}>
                  Initialize Atlas
                </Button>
              )}
            </div>
          }
        />
        {atlasAgent ? (
          <div className="mt-4">
            <AgentsList
              agents={visibleAgents}
              onToggle={handleToggle}
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
                    label: "Initialize Atlas",
                    onClick: handleInitializeAtlas,
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

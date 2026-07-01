/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Sparkles } from "@/components/icons/lucide-shim";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// components
import { AgentsList } from "@/components/agents";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// constants
import { ATLAS_IDENTITY } from "@/constants/atlas";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { AIService } from "@/services/ai.service";
import type { TWorkspaceLLMConfig, TWorkspaceLLMProvider } from "@/services/ai.service";
import { AgentService, type TAgent } from "@/services/agent.service";
// local
import { AIWorkspaceSettingsHeader } from "./header";

const aiService = new AIService();
const agentService = new AgentService();

type FormState = {
  provider: string;
  model: string;
  apiKey: string;
};

const SELECT_CLASSNAME =
  "rounded-lg border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary min-w-[220px]";
const INPUT_CLASSNAME =
  "rounded-lg border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary placeholder:text-placeholder min-w-[220px]";

const agentErrorTitle = (err: unknown, t: (key: string) => string) =>
  (err as { error?: string } | undefined)?.error ?? t("workspace_settings.settings.agents.update_error");

// Atlas is the single workspace companion. Older workspaces can carry more
// than one historical Agent row, so we resolve to the oldest enabled one.
const getAtlasProfile = (agents: TAgent[]): TAgent | undefined => {
  // `toSorted` (ES2023) is not available in this app's TS lib config.
  // oxlint-disable-next-line no-array-sort
  return [...agents].sort((a, b) => {
    if (a.is_enabled !== b.is_enabled) return a.is_enabled ? -1 : 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })[0];
};

function AISettingsLoader() {
  return (
    <div className="flex flex-col gap-4">
      <div className="animate-pulse rounded-lg border border-subtle bg-layer-2 p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 border-b border-subtle pb-4">
            <span className="h-4 w-28 rounded-full bg-layer-1" />
            <span className="h-9 w-32 rounded-lg bg-layer-1" />
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-subtle pb-4">
            <div className="flex flex-col gap-2">
              <span className="h-4 w-20 rounded-full bg-layer-1" />
              <span className="h-3 w-48 rounded-full bg-layer-1" />
            </div>
            <span className="h-10 w-56 rounded-lg bg-layer-1" />
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-subtle pb-4">
            <div className="flex flex-col gap-2">
              <span className="h-4 w-16 rounded-full bg-layer-1" />
              <span className="h-3 w-36 rounded-full bg-layer-1" />
            </div>
            <span className="h-10 w-56 rounded-lg bg-layer-1" />
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="h-4 w-28 rounded-full bg-layer-1" />
            <div className="flex items-center gap-2">
              <span className="h-9 w-20 rounded-lg bg-layer-1" />
              <span className="h-9 w-24 rounded-lg bg-layer-1" />
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only">Loading Atlas settings</span>
    </div>
  );
}

function AISettingsPage() {
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();
  const params = useParams();
  const workspaceSlug = String(params?.workspaceSlug ?? "");

  const canEdit = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const [config, setConfig] = useState<TWorkspaceLLMConfig | null>(null);
  const [form, setForm] = useState<FormState>({ provider: "", model: "", apiKey: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // ---- Atlas profile (enable / triggers / automations) ----------------- //
  const { data: agents, mutate: mutateAgents } = useSWR<TAgent[]>(
    canEdit && workspaceSlug ? `AGENTS_LIST_${workspaceSlug}` : null,
    canEdit && workspaceSlug ? () => agentService.list(workspaceSlug) : null
  );
  const atlasAgent = agents ? getAtlasProfile(agents) : undefined;
  const visibleAgents = atlasAgent ? [atlasAgent] : [];

  // ON → resume future dispatches. OFF → the `stop` endpoint also cancels
  // every in-flight run (the Celery loop polls cancel_requested and bails).
  const handleToggle = useCallback(
    async (id: string, next: boolean) => {
      if (!workspaceSlug) return;
      try {
        if (next) {
          await agentService.update(workspaceSlug, id, { is_enabled: true });
        } else {
          const stopped = await agentService.stop(workspaceSlug, id);
          const cancelled = stopped.cancelled_runs ?? 0;
          if (cancelled > 0) {
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: t("workspace_settings.settings.agents.stopped.title"),
              message: t("workspace_settings.settings.agents.stopped.cancelled", { count: cancelled }),
            });
          }
        }
        await mutateAgents();
      } catch (err) {
        setToast({ type: TOAST_TYPE.ERROR, title: agentErrorTitle(err, t) });
      }
    },
    [workspaceSlug, mutateAgents, t]
  );

  const handleUpdateTrigger = useCallback(
    async (id: string, key: keyof TAgent["triggers"], next: boolean) => {
      if (!workspaceSlug) return;
      try {
        // PATCH shallow-merges `triggers` server-side, so we send only the one we change.
        await agentService.update(workspaceSlug, id, { triggers: { [key]: next } });
        await mutateAgents();
      } catch (err) {
        setToast({ type: TOAST_TYPE.ERROR, title: agentErrorTitle(err, t) });
      }
    },
    [workspaceSlug, mutateAgents, t]
  );

  // Atlas's name, personality, and avatar are fixed in code (ATLAS_IDENTITY
  // + the server-side prompts), so initialization just mints the bot — there's
  // nothing to configure.
  const handleInitializeAtlas = useCallback(async () => {
    if (!workspaceSlug) return;
    try {
      await agentService.create(workspaceSlug, { name: ATLAS_IDENTITY.name });
      await mutateAgents();
    } catch (err) {
      setToast({ type: TOAST_TYPE.ERROR, title: agentErrorTitle(err, t) });
    }
  }, [workspaceSlug, mutateAgents, t]);

  const loadConfig = useCallback(async () => {
    if (!workspaceSlug) return;
    setLoading(true);
    try {
      const res = await aiService.getWorkspaceLLMConfig(workspaceSlug);
      setConfig(res);
      setForm({
        provider: res.llm_provider || "",
        model: res.llm_model || "",
        apiKey: "",
      });
    } catch {
      setError("Couldn't load Atlas settings.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const providers = config?.providers ?? {};
  const selectedProvider: TWorkspaceLLMProvider | undefined = form.provider ? providers[form.provider] : undefined;

  const availableModels = useMemo(() => selectedProvider?.models ?? [], [selectedProvider]);

  const canSubmit = useMemo(
    () => Boolean(form.provider && form.model && (form.apiKey || config?.has_workspace_override) && !saving),
    [form, config, saving]
  );

  const handleSave = useCallback(async () => {
    if (!workspaceSlug) return;
    setSaving(true);
    setStatus("idle");
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        llm_provider: form.provider,
        llm_model: form.model,
      };
      // Only send the key if the user actually typed a new one.
      if (form.apiKey) payload.llm_api_key = form.apiKey;
      const res = await aiService.updateWorkspaceLLMConfig(workspaceSlug, payload as never);
      // PATCH response omits `providers`; preserve the list we loaded on mount.
      setConfig((prev) => ({ ...res, providers: prev?.providers ?? res.providers }));
      setForm((prev) => ({ ...prev, apiKey: "" }));
      setStatus("saved");
    } catch (err) {
      const message =
        err && typeof err === "object" && "error" in err && typeof (err as { error: unknown }).error === "string"
          ? (err as { error: string }).error
          : t("workspace_settings.settings.ai.save_error");
      setError(message);
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }, [workspaceSlug, form, t]);

  const handleClear = useCallback(async () => {
    if (!workspaceSlug) return;
    setSaving(true);
    setStatus("idle");
    setError(null);
    try {
      await aiService.updateWorkspaceLLMConfig(workspaceSlug, { clear: true });
      await loadConfig();
      setStatus("saved");
    } catch {
      setError(t("workspace_settings.settings.ai.save_error"));
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }, [workspaceSlug, loadConfig, t]);

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.ai.title")}`
    : undefined;

  if (workspaceUserInfo && !canEdit) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<AIWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className={cn("flex w-full flex-col gap-y-7", { "opacity-60": !canEdit })}>
        {/* Atlas — the one workspace companion. Identity & personality are
            fixed in code; only on/off and triggers are tunable here. Automations
            now live on the top-level Workflows page. The model + BYOK key it runs
            on are configured below. */}
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-15 font-medium text-primary">{ATLAS_IDENTITY.name}</h3>
              <p className="text-12 text-tertiary">{ATLAS_IDENTITY.description}</p>
            </div>
          </div>
          {atlasAgent ? (
            <AgentsList agents={visibleAgents} onToggle={handleToggle} onUpdateTrigger={handleUpdateTrigger} />
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-layer-2 px-4 py-4">
              <p className="text-12 text-tertiary">
                Atlas isn’t set up in this workspace yet. Initialize it to assign tasks and @-mention it.
              </p>
              <Button
                variant="primary"
                size="lg"
                className="!h-8 px-3"
                disabled={!canEdit}
                onClick={() => void handleInitializeAtlas()}
              >
                Initialize Atlas
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <AISettingsLoader />
        ) : (
          <>
            {!config?.has_workspace_override && (
              <p className="text-12 text-tertiary">
                <Sparkles className="mr-1 inline-block size-3.5 text-accent-primary" />
                {t("workspace_settings.settings.ai.no_override")}
              </p>
            )}

            {/* Boxed group of config rows — same pattern as Imports / Exports
                (rounded outer border, rows stacked with internal dividers,
                primary CTA in its own action row at the bottom). */}
            <div className="overflow-hidden rounded-lg border border-subtle bg-layer-2">
              <SettingsBoxedControlItem
                className="rounded-none border-0 border-b border-subtle"
                title={t("workspace_settings.settings.ai.provider_label")}
                control={
                  <select
                    value={form.provider}
                    onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value, model: "" }))}
                    disabled={!canEdit || saving}
                    className={SELECT_CLASSNAME}
                  >
                    <option value="">—</option>
                    {Object.entries(providers).map(([key, provider]) => (
                      <option key={key} value={key}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                }
              />
              <SettingsBoxedControlItem
                className="rounded-none border-0 border-b border-subtle"
                title={t("workspace_settings.settings.ai.model_label")}
                control={
                  <select
                    value={form.model}
                    onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
                    disabled={!canEdit || !selectedProvider || saving}
                    className={SELECT_CLASSNAME}
                  >
                    <option value="">—</option>
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                        {selectedProvider?.default_model === m ? "  (default)" : ""}
                      </option>
                    ))}
                  </select>
                }
              />
              <SettingsBoxedControlItem
                className="rounded-none border-0 border-b border-subtle"
                title={t("workspace_settings.settings.ai.api_key_label")}
                description={
                  config?.llm_api_key_masked ? (
                    <span>
                      {t("workspace_settings.settings.ai.current_key")} {config.llm_api_key_masked}
                    </span>
                  ) : undefined
                }
                control={
                  <input
                    type="password"
                    autoComplete="off"
                    value={form.apiKey}
                    onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder={t("workspace_settings.settings.ai.api_key_placeholder")}
                    disabled={!canEdit || saving}
                    className={INPUT_CLASSNAME}
                  />
                }
              />
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex flex-col gap-1">
                  {error && <p className="text-12 text-danger-primary">{error}</p>}
                  {status === "saved" && (
                    <p className="text-12 text-success-primary">{t("workspace_settings.settings.ai.saved")}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {config?.has_workspace_override && (
                    <Button
                      variant="secondary"
                      size="lg"
                      className="!h-8 px-3"
                      disabled={!canEdit || saving}
                      onClick={() => void handleClear()}
                    >
                      {t("workspace_settings.settings.ai.clear")}
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="lg"
                    className="!h-8 px-4"
                    disabled={!canEdit || !canSubmit}
                    onClick={() => void handleSave()}
                  >
                    {saving ? "…" : t("workspace_settings.settings.ai.save")}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(AISettingsPage);

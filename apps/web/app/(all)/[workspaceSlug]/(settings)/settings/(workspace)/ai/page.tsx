/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "@/components/icons/lucide-shim";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { AIService } from "@/services/ai.service";
import type { TWorkspaceLLMConfig, TWorkspaceLLMProvider } from "@/services/ai.service";
// local
import { AIWorkspaceSettingsHeader } from "./header";

const aiService = new AIService();

type FormState = {
  provider: string;
  model: string;
  apiKey: string;
};

const SELECT_CLASSNAME =
  "rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary min-w-[220px]";
const INPUT_CLASSNAME =
  "rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary placeholder:text-placeholder min-w-[220px]";

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
      setError("Couldn't load AI settings.");
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
    <SettingsContentWrapper header={<AIWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className={cn("flex w-full flex-col gap-y-6", { "opacity-60": !canEdit })}>
        <SettingsHeading
          title={t("workspace_settings.settings.ai.heading")}
          description={t("workspace_settings.settings.ai.description")}
        />

        {loading ? (
          <div className="flex items-center gap-2 text-13 text-tertiary">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
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
                      size="xl"
                      className="!h-9 px-3"
                      disabled={!canEdit || saving}
                      onClick={() => void handleClear()}
                    >
                      {t("workspace_settings.settings.ai.clear")}
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="xl"
                    className="!h-9 px-4"
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

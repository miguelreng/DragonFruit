/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// constants
import { INTEGRATIONS, type TIntegration } from "@/constants/integrations";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { AIService } from "@/services/ai.service";
import type { TWorkspaceComposioConfig } from "@/services/ai.service";
import { AgentService, type TAgent, type TMcpServerWrite } from "@/services/agent.service";
// local
import { IntegrationsWorkspaceSettingsHeader } from "./header";

const agentService = new AgentService();
const aiService = new AIService();

type ComposioFormState = {
  apiKey: string;
  baseUrl: string;
  toolkits: string;
  allowWriteTools: boolean;
};

// Atlas is the single workspace companion; resolve to the oldest enabled row.
const getAtlasProfile = (agents: TAgent[]): TAgent | undefined => {
  // oxlint-disable-next-line no-array-sort
  return [...agents].sort((a, b) => {
    if (a.is_enabled !== b.is_enabled) return a.is_enabled ? -1 : 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })[0];
};

function IntegrationMark({ integration }: { integration: TIntegration }) {
  const Logo = integration.logo;
  if (Logo) {
    return (
      <div
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-subtle bg-layer-1 text-primary select-none"
        aria-hidden
      >
        <Logo className="size-5" />
      </div>
    );
  }
  return (
    <div
      className="text-15 grid size-9 shrink-0 place-items-center rounded-lg font-semibold text-white select-none"
      style={{ backgroundColor: integration.accent }}
      aria-hidden
    >
      {integration.name.charAt(0)}
    </div>
  );
}

function WorkspaceIntegrationsPage() {
  const { t } = useTranslation();
  const params = useParams();
  const workspaceSlug = String(params?.workspaceSlug ?? "");
  const { currentWorkspace } = useWorkspace();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const canEdit = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const { data: agents, mutate } = useSWR<TAgent[]>(
    canEdit && workspaceSlug ? `AGENTS_LIST_${workspaceSlug}` : null,
    canEdit && workspaceSlug ? () => agentService.list(workspaceSlug) : null
  );
  const atlas = agents ? getAtlasProfile(agents) : undefined;
  const servers = atlas?.mcp_servers ?? [];
  const connectedKeys = new Set(servers.filter((s) => s.enabled).map((s) => s.name));

  // Inline API-key entry: which tile is mid-connect, and the typed key.
  const [keyEntryFor, setKeyEntryFor] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [composioConfig, setComposioConfig] = useState<TWorkspaceComposioConfig | null>(null);
  const [composioForm, setComposioForm] = useState<ComposioFormState>({
    apiKey: "",
    baseUrl: "",
    toolkits: "",
    allowWriteTools: false,
  });
  const [loadingComposio, setLoadingComposio] = useState(true);
  const [savingComposio, setSavingComposio] = useState(false);
  const [testingComposio, setTestingComposio] = useState(false);
  const [editingComposio, setEditingComposio] = useState(false);
  const [composioStatus, setComposioStatus] = useState<"idle" | "saved" | "tested" | "error">("idle");
  const [composioError, setComposioError] = useState<string | null>(null);

  const loadComposioConfig = useCallback(async () => {
    if (!workspaceSlug) return;
    setLoadingComposio(true);
    try {
      const res = await aiService.getWorkspaceComposioConfig(workspaceSlug);
      setComposioConfig(res);
      setComposioForm({
        apiKey: "",
        baseUrl: res.composio_base_url || "",
        toolkits: res.composio_toolkits.join(", "),
        allowWriteTools: res.composio_allow_write_tools,
      });
    } catch {
      setComposioError("Couldn't load Composio settings.");
      setComposioStatus("error");
    } finally {
      setLoadingComposio(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void loadComposioConfig();
  }, [loadComposioConfig]);

  const canSubmitComposio = useMemo(
    () => Boolean((composioForm.apiKey || composioConfig?.has_workspace_override) && !savingComposio),
    [composioForm.apiKey, composioConfig?.has_workspace_override, savingComposio]
  );

  const handleSaveComposio = useCallback(async () => {
    if (!workspaceSlug) return;
    setSavingComposio(true);
    setComposioStatus("idle");
    setComposioError(null);
    try {
      const payload: Record<string, unknown> = {
        composio_base_url: composioForm.baseUrl.trim(),
        composio_toolkits: composioForm.toolkits
          .split(",")
          .map((toolkit) => toolkit.trim())
          .filter(Boolean),
        composio_allow_write_tools: composioForm.allowWriteTools,
      };
      if (composioForm.apiKey) payload.composio_api_key = composioForm.apiKey;
      const res = await aiService.updateWorkspaceComposioConfig(workspaceSlug, payload as never);
      setComposioConfig(res);
      setComposioForm((prev) => ({ ...prev, apiKey: "" }));
      setEditingComposio(false);
      setComposioStatus("saved");
    } catch (err) {
      const message =
        err && typeof err === "object" && "error" in err && typeof (err as { error: unknown }).error === "string"
          ? (err as { error: string }).error
          : "Couldn't save Composio settings.";
      setComposioError(message);
      setComposioStatus("error");
    } finally {
      setSavingComposio(false);
    }
  }, [workspaceSlug, composioForm]);

  const handleClearComposio = useCallback(async () => {
    if (!workspaceSlug) return;
    setSavingComposio(true);
    setComposioStatus("idle");
    setComposioError(null);
    try {
      const res = await aiService.updateWorkspaceComposioConfig(workspaceSlug, { clear: true });
      setComposioConfig(res);
      setComposioForm({ apiKey: "", baseUrl: "", toolkits: "", allowWriteTools: false });
      setEditingComposio(false);
      setComposioStatus("saved");
    } catch {
      setComposioError("Couldn't clear Composio settings.");
      setComposioStatus("error");
    } finally {
      setSavingComposio(false);
    }
  }, [workspaceSlug]);

  const handleTestComposio = useCallback(async () => {
    if (!workspaceSlug) return;
    setTestingComposio(true);
    setComposioStatus("idle");
    setComposioError(null);
    try {
      const res = await aiService.testWorkspaceComposioConfig(workspaceSlug);
      if (!res.ok) {
        setComposioError(res.error ?? "Composio test failed.");
        setComposioStatus("error");
        return;
      }
      setComposioStatus("tested");
    } catch (err) {
      const message =
        err && typeof err === "object" && "error" in err && typeof (err as { error: unknown }).error === "string"
          ? (err as { error: string }).error
          : "Composio test failed.";
      setComposioError(message);
      setComposioStatus("error");
    } finally {
      setTestingComposio(false);
    }
  }, [workspaceSlug]);

  // Re-send the full desired set. Existing entries are sent WITHOUT auth_header
  // so the server preserves their stored token (matched by name).
  const writeServers = async (next: TMcpServerWrite[]) => {
    if (!atlas) return;
    try {
      await agentService.update(workspaceSlug, atlas.id, { mcp_servers_set: next });
      await mutate();
    } catch (err) {
      const message =
        (err as { error?: string } | undefined)?.error ?? t("workspace_settings.settings.agents.update_error");
      setToast({ type: TOAST_TYPE.ERROR, title: message });
      throw err;
    }
  };

  const keep = (): TMcpServerWrite[] => servers.map((s) => ({ name: s.name, url: s.url, enabled: s.enabled }));

  const handleConnect = async (integration: TIntegration, apiKey?: string) => {
    setBusyKey(integration.key);
    try {
      const entry: TMcpServerWrite = { name: integration.key, url: integration.mcpUrl, enabled: true };
      if (apiKey) entry.auth_header = apiKey;
      await writeServers([...keep().filter((s) => s.name !== integration.key), entry]);
      setToast({ type: TOAST_TYPE.SUCCESS, title: `${integration.name} connected` });
      setKeyEntryFor(null);
      setKeyValue("");
    } catch {
      /* toast already shown in writeServers */
    } finally {
      setBusyKey(null);
    }
  };

  const handleDisconnect = async (integration: TIntegration) => {
    setBusyKey(integration.key);
    try {
      await writeServers(keep().filter((s) => s.name !== integration.key));
      setToast({ type: TOAST_TYPE.SUCCESS, title: `${integration.name} disconnected` });
    } catch {
      /* toast already shown in writeServers */
    } finally {
      setBusyKey(null);
    }
  };

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.integrations.title")}`
    : undefined;
  const composioConnected = Boolean(composioConfig?.configured);

  if (workspaceUserInfo && !canEdit) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<IntegrationsWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="flex w-full flex-col gap-y-7">
        {agents && !atlas && (
          <div className="rounded-lg border border-subtle bg-layer-2 px-4 py-4 text-13 text-tertiary">
            Atlas isn’t set up in this workspace yet. Initialize it on{" "}
            <a className="text-accent-primary hover:underline" href={`/${workspaceSlug}/settings/ai`}>
              Settings → Atlas
            </a>{" "}
            to connect integrations.
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-layer-2 p-4">
            <div className="flex items-start gap-3">
              <div
                className="text-15 grid size-9 shrink-0 place-items-center rounded-lg font-semibold text-white select-none"
                style={{ backgroundColor: "#111827" }}
                aria-hidden
              >
                C
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="truncate text-body-sm-medium text-primary">Composio</h4>
                  {composioConnected && (
                    <span className="rounded-full bg-layer-1 px-2 py-0.5 text-11 font-medium text-success-primary">
                      Connected
                    </span>
                  )}
                </div>
                <p className="text-caption-md-regular text-tertiary">
                  Connect Atlas to authenticated tools across external apps.
                </p>
              </div>
            </div>

            <ul className="flex flex-col gap-1">
              {[
                "Search and use 1,000+ app tools",
                "Start OAuth connection flows",
                "Restrict toolkits and write actions",
              ].map((cap) => (
                <li key={cap} className="flex items-start gap-1.5 text-caption-sm-regular text-secondary">
                  <span className="shrink-0 text-tertiary">•</span>
                  <span>{cap}</span>
                </li>
              ))}
            </ul>

            {loadingComposio ? (
              <div className="flex flex-col gap-2">
                <span className="h-9 w-full animate-pulse rounded-lg bg-layer-1" />
                <span className="h-8 w-28 animate-pulse self-end rounded-lg bg-layer-1" />
              </div>
            ) : editingComposio ? (
              <div className="flex flex-col gap-2">
                <Input
                  type="password"
                  autoComplete="off"
                  className="w-full"
                  value={composioForm.apiKey}
                  onChange={(e) => setComposioForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={composioConfig?.composio_api_key_masked || "Composio API key"}
                />
                <Input
                  type="text"
                  className="w-full"
                  value={composioForm.toolkits}
                  onChange={(e) => setComposioForm((prev) => ({ ...prev, toolkits: e.target.value }))}
                  placeholder="Toolkits: github, slack, gmail"
                />
                <Input
                  type="url"
                  className="w-full"
                  value={composioForm.baseUrl}
                  onChange={(e) => setComposioForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="Custom base URL"
                />
                <label className="flex items-center gap-2 text-caption-md-regular text-secondary">
                  <input
                    type="checkbox"
                    checked={composioForm.allowWriteTools}
                    onChange={(e) => setComposioForm((prev) => ({ ...prev, allowWriteTools: e.target.checked }))}
                    disabled={!canEdit || savingComposio}
                    className="size-4"
                  />
                  Allow write actions
                </label>
                {(composioError || composioStatus === "saved" || composioStatus === "tested") && (
                  <p
                    className={
                      composioError
                        ? "text-caption-sm-regular text-danger-primary"
                        : "text-caption-sm-regular text-success-primary"
                    }
                  >
                    {composioError || (composioStatus === "tested" ? "Composio connection works." : "Composio saved.")}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2">
                  {editingComposio && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={savingComposio}
                      onClick={() => {
                        setEditingComposio(false);
                        setComposioError(null);
                      }}
                    >
                      {t("cancel")}
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    loading={savingComposio}
                    disabled={!canEdit || !canSubmitComposio || testingComposio}
                    onClick={() => void handleSaveComposio()}
                  >
                    {composioConnected ? "Save" : "Connect"}
                  </Button>
                </div>
              </div>
            ) : composioConnected ? (
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canEdit || testingComposio}
                  onClick={() => void handleTestComposio()}
                >
                  {testingComposio ? "…" : "Test"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canEdit || savingComposio || testingComposio}
                  onClick={() => setEditingComposio(true)}
                >
                  Configure
                </Button>
                {composioConfig?.has_workspace_override && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canEdit || savingComposio || testingComposio}
                    onClick={() => void handleClearComposio()}
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!canEdit}
                  onClick={() => {
                    setEditingComposio(true);
                    setComposioError(null);
                  }}
                >
                  Connect
                </Button>
              </div>
            )}
          </div>

          {INTEGRATIONS.map((integration) => {
            const connected = connectedKeys.has(integration.key);
            const busy = busyKey === integration.key;
            const entering = keyEntryFor === integration.key;
            const disabled = !canEdit || !atlas || busy;

            return (
              <div key={integration.key} className="flex flex-col gap-3 rounded-lg border border-subtle bg-layer-2 p-4">
                <div className="flex items-start gap-3">
                  <IntegrationMark integration={integration} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-body-sm-medium text-primary">{integration.name}</h4>
                      {connected && (
                        <span className="rounded-full bg-layer-1 px-2 py-0.5 text-11 font-medium text-success-primary">
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-caption-md-regular text-tertiary">{integration.description}</p>
                  </div>
                </div>

                <ul className="flex flex-col gap-1">
                  {integration.capabilities.map((cap) => (
                    <li key={cap} className="flex items-start gap-1.5 text-caption-sm-regular text-secondary">
                      <span className="shrink-0 text-tertiary">•</span>
                      <span>{cap}</span>
                    </li>
                  ))}
                </ul>

                {entering ? (
                  <div className="flex flex-col gap-2">
                    <Input
                      type="password"
                      autoComplete="off"
                      className="w-full"
                      value={keyValue}
                      onChange={(e) => setKeyValue(e.target.value)}
                      placeholder={integration.keyLabel ?? "API key"}
                    />
                    <div className="flex items-center justify-between gap-2">
                      {integration.keyHelpUrl ? (
                        <a
                          href={integration.keyHelpUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-11 text-accent-primary hover:underline"
                        >
                          Where do I find this?
                        </a>
                      ) : (
                        <span />
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setKeyEntryFor(null);
                            setKeyValue("");
                          }}
                          disabled={busy}
                        >
                          {t("cancel")}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          loading={busy}
                          disabled={!keyValue.trim() || busy}
                          onClick={() => void handleConnect(integration, keyValue.trim())}
                        >
                          Connect
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-end">
                    {connected ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={disabled}
                        onClick={() => void handleDisconnect(integration)}
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={disabled}
                        loading={busy && integration.authType === "none"}
                        onClick={() => {
                          if (integration.authType === "api_key") {
                            setKeyEntryFor(integration.key);
                            setKeyValue("");
                          } else {
                            void handleConnect(integration);
                          }
                        }}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(WorkspaceIntegrationsPage);

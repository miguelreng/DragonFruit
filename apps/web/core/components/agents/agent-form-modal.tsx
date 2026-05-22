/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState, type FormEvent } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// services
import type { TAgent, TAgentCreatePayload, TAgentUpdatePayload } from "@/services/agent.service";
import { AIService, type TWorkspaceLLMProvider } from "@/services/ai.service";
// local
import { AgentAvatar } from "./agent-avatar";

// DiceBear's open-source HTTP service renders deterministic SVG avatars
// from a seed. We use the `bottts-neutral` style — friendly bot heads
// that feel right for AI agents and play well on both light and dark
// backgrounds. URL is the source of truth; we just generate one here.
const buildGeneratedAvatarUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(seed)}`;

const PROVIDER_OPTIONS = [
  {
    value: "anthropic",
    label: "Anthropic",
    models: ["claude-sonnet-4-5", "claude-3-7-sonnet", "claude-3-5-haiku"],
    defaultBaseUrl: "",
  },
  {
    value: "openai",
    label: "OpenAI",
    models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
    defaultBaseUrl: "",
  },
  {
    value: "google",
    label: "Google",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
    defaultBaseUrl: "",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    models: ["anthropic/claude-3.7-sonnet", "openai/gpt-4o", "google/gemini-2.0-flash-001"],
    defaultBaseUrl: "https://openrouter.ai/api/v1",
  },
] as const;

const PROVIDER_DEFAULT_BASE_URL: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
};

const AGENT_TEMPLATES = [
  {
    key: "pm",
    name: "PM Assistant",
    description: "Triages incoming tasks and asks clarifying questions.",
    prompt:
      "You are a project-management assistant for this workspace. Triage incoming issues and ask clarifying questions when scope is unclear.",
  },
  {
    key: "support",
    name: "Support Agent",
    description: "Drafts customer replies and escalates urgent bugs.",
    prompt:
      "You are a customer support assistant. Draft clear, friendly replies, summarize issue impact, and flag urgent incidents for escalation.",
  },
  {
    key: "qa",
    name: "QA Reviewer",
    description: "Finds gaps, edge-cases, and verification steps.",
    prompt: "You are a QA reviewer. Propose concise test plans, edge cases, and pass/fail criteria before release.",
  },
] as const;

const splitProviderModel = (providerModel: string) => {
  const [provider, ...rest] = providerModel.split("/");
  return {
    provider: provider ?? "",
    model: rest.join("/"),
  };
};

type AgentFormState = {
  name: string;
  description: string;
  avatar_url: string;
  system_prompt: string;
  provider_model: string;
  api_base_url: string;
  api_key: string;
};

const EMPTY_FORM: AgentFormState = {
  name: "",
  description: "",
  avatar_url: "",
  system_prompt: "",
  provider_model: "",
  api_base_url: "",
  api_key: "",
};

const formFromAgent = (agent: TAgent): AgentFormState => ({
  name: agent.name ?? "",
  description: agent.description ?? "",
  avatar_url: agent.avatar_url ?? "",
  system_prompt: agent.system_prompt ?? "",
  provider_model: agent.provider_model ?? "",
  api_base_url: agent.api_base_url ?? "",
  api_key: "",
});

type CommonProps = {
  workspaceSlug: string;
  isOpen: boolean;
  onClose: () => void;
};

type CreateProps = CommonProps & {
  mode: "create";
  agent?: undefined;
  onSubmit: (payload: TAgentCreatePayload) => Promise<TAgent>;
};

type EditProps = CommonProps & {
  mode: "edit";
  agent: TAgent;
  onSubmit: (id: string, payload: TAgentUpdatePayload) => Promise<TAgent>;
};

type IAgentFormModalProps = CreateProps | EditProps;
const aiService = new AIService();

type TProviderOption = {
  value: string;
  label: string;
  models: string[];
  defaultBaseUrl: string;
};

export function AgentFormModal(props: IAgentFormModalProps) {
  const { isOpen, onClose, mode, workspaceSlug } = props;
  const { t } = useTranslation();
  const initialForm = mode === "edit" ? formFromAgent(props.agent) : EMPTY_FORM;
  const [form, setForm] = useState<AgentFormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [providerOptions, setProviderOptions] = useState<TProviderOption[]>(
    PROVIDER_OPTIONS.map((provider) => ({
      value: provider.value,
      label: provider.label,
      models: [...provider.models],
      defaultBaseUrl: provider.defaultBaseUrl,
    }))
  );

  // Re-seed when the modal opens or the target agent changes (edit mode
  // reuses a single modal instance for every row).
  useEffect(() => {
    if (!isOpen) return;
    setForm(mode === "edit" ? formFromAgent(props.agent) : EMPTY_FORM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, mode === "edit" ? props.agent.id : null]);

  useEffect(() => {
    if (!isOpen || !workspaceSlug) return;
    let cancelled = false;
    const loadProviders = async () => {
      try {
        const config = await aiService.getWorkspaceLLMConfig(workspaceSlug);
        if (cancelled) return;
        const providers = config.providers ?? {};
        const options = Object.entries(providers).map(([value, provider]: [string, TWorkspaceLLMProvider]) => ({
          value,
          label: provider.name || value,
          models: provider.models || [],
          defaultBaseUrl: PROVIDER_DEFAULT_BASE_URL[value] ?? "",
        }));
        if (options.length > 0) setProviderOptions(options);
      } catch {
        // Keep local defaults on fetch failures.
      }
    };
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, [isOpen, workspaceSlug]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const name = form.name.trim();
    if (!name) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Name is required" });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        await props.onSubmit({
          name,
          description: form.description.trim() || undefined,
          avatar_url: form.avatar_url.trim() || undefined,
          system_prompt: form.system_prompt.trim() || undefined,
          provider_model: form.provider_model.trim() || undefined,
          api_base_url: form.api_base_url.trim() || undefined,
          api_key: form.api_key.trim() || undefined,
        });
        setToast({ type: TOAST_TYPE.SUCCESS, title: `Agent “${name}” created` });
      } else {
        // Edit mode: send every visible field so clearing one persists.
        // api_key is the exception — empty means "leave existing key".
        const payload: TAgentUpdatePayload = {
          name,
          description: form.description.trim(),
          avatar_url: form.avatar_url.trim(),
          system_prompt: form.system_prompt.trim(),
          provider_model: form.provider_model.trim(),
          api_base_url: form.api_base_url.trim(),
        };
        const keyInput = form.api_key.trim();
        if (keyInput) payload.api_key = keyInput;
        await props.onSubmit(props.agent.id, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: `Agent “${name}” updated` });
      }
      onClose();
    } catch (err) {
      const message =
        (err as { error?: string } | undefined)?.error ??
        (mode === "create"
          ? "Failed to create the agent. Check the API server logs."
          : "Failed to update the agent. Check the API server logs.");
      setToast({
        type: TOAST_TYPE.ERROR,
        title: mode === "create" ? "Could not create agent" : "Could not update agent",
        message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const labelClass = "block text-13 font-medium text-secondary mb-1";

  const isEdit = mode === "edit";
  const heading = isEdit ? "Configure agent" : "Create an agent";
  const subheading = isEdit
    ? "Update this agent’s profile and BYOK provider config. Leave the API key blank to keep the one already on file."
    : "Agents are bot members of this workspace. Assign them to a task and they’ll participate like a teammate.";
  const submitLabel = isEdit ? (submitting ? "Saving…" : "Save changes") : submitting ? "Creating…" : "Create agent";
  const apiKeyHelper =
    isEdit && props.agent.has_api_key
      ? "A key is on file. Leave blank to keep it, or paste a new one to replace it."
      : "Stored encrypted, never echoed back.";
  const parsedProviderModel = splitProviderModel(form.provider_model);
  const selectedProvider = providerOptions.find((p) => p.value === parsedProviderModel.provider);
  const selectedProviderLabel = selectedProvider?.label ?? "Custom";
  const selectedModelLabel = parsedProviderModel.model || "Select model";

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="border-b-[0.5px] border-subtle px-5 py-4">
          <h3 className="text-18 font-medium text-secondary">{heading}</h3>
          <p className="mt-1 text-13 text-tertiary">{subheading}</p>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label className={labelClass} htmlFor="agent-name">
              Name <span className="text-danger-strong">*</span>
            </label>
            <Input
              id="agent-name"
              className="w-full"
              value={form.name}
              maxLength={128}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="PM bot"
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="agent-description">
              Description
            </label>
            <Input
              id="agent-description"
              className="w-full"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Triages incoming tasks and asks clarifying questions"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="agent-avatar">
              Avatar
            </label>
            <div className="flex items-start gap-3">
              <div className="mt-1 shrink-0 rounded-md border border-subtle bg-layer-2 p-1">
                <AgentAvatar
                  seed={isEdit ? props.agent.id : form.name || "new-agent"}
                  name={form.name || "Agent"}
                  src={form.avatar_url}
                  size={44}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Input
                  id="agent-avatar"
                  type="url"
                  className="w-full"
                  value={form.avatar_url}
                  onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
                  placeholder="https://…/agent-avatar.png"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-11 text-tertiary">
                    Paste an image URL, or generate a unique bot avatar from this agent’s name.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const avatarSeed = form.name.trim() || (isEdit ? props.agent.id : `agent-${Date.now()}`);
                      setForm((f) => ({ ...f, avatar_url: buildGeneratedAvatarUrl(avatarSeed) }));
                    }}
                    className="shrink-0 text-11 font-medium text-accent-primary hover:underline"
                  >
                    {form.avatar_url ? "Regenerate" : "Generate avatar"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-13 font-medium text-secondary" htmlFor="agent-system-prompt">
                System prompt
              </label>
              <div className="flex items-center gap-2">
                <span className="text-11 text-tertiary">Template</span>
                <CustomSelect
                  value=""
                  onChange={(templateKey: string) => {
                    const template = AGENT_TEMPLATES.find((item) => item.key === templateKey);
                    if (!template) return;
                    setForm((f) => ({
                      ...f,
                      description: f.description || template.description,
                      system_prompt: template.prompt,
                    }));
                  }}
                  label="Choose template"
                  buttonClassName="min-w-[180px] border-subtle bg-layer-1 px-2 py-1.5 text-12 text-secondary"
                >
                  {AGENT_TEMPLATES.map((template) => (
                    <CustomSelect.Option key={template.key} value={template.key}>
                      <div className="min-w-0">
                        <p className="truncate text-12 text-primary">{template.name}</p>
                        <p className="truncate text-11 text-tertiary">{template.description}</p>
                      </div>
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              </div>
            </div>
            <TextArea
              id="agent-system-prompt"
              className="min-h-24 w-full resize-y text-13"
              value={form.system_prompt}
              onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
              placeholder="You are a project-management assistant for this workspace. Triage incoming issues and ask clarifying questions when scope is unclear."
            />
          </div>

          <div className="border-t-[0.5px] border-subtle pt-4">
            <div className="mb-3 space-y-0.5">
              <p className="text-13 font-medium text-secondary">BYOK provider config</p>
              <p className="text-11 text-tertiary">
                Every agent uses your own LLM key. We don’t store a platform default.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="agent-provider">
                  Provider
                </label>
                <CustomSelect
                  value={parsedProviderModel.provider}
                  onChange={(provider: string) => {
                    const option = providerOptions.find((item) => item.value === provider);
                    if (!option) {
                      setForm((f) => ({ ...f, provider_model: "" }));
                      return;
                    }
                    const nextModel = option.models[0];
                    setForm((f) => ({
                      ...f,
                      provider_model: `${provider}/${nextModel}`,
                      api_base_url: f.api_base_url || option.defaultBaseUrl,
                    }));
                  }}
                  label={selectedProviderLabel}
                  input
                  buttonClassName="w-full border-subtle bg-layer-1 px-3 py-2 text-13 text-secondary"
                >
                  {providerOptions.map((provider) => (
                    <CustomSelect.Option key={provider.value} value={provider.value}>
                      <span className="text-13 text-primary">{provider.label}</span>
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              </div>
              <div>
                <label className={labelClass} htmlFor="agent-model">
                  Model
                </label>
                <CustomSelect
                  value={parsedProviderModel.model}
                  onChange={(model: string) => {
                    const provider = parsedProviderModel.provider || providerOptions[0]?.value || "";
                    setForm((f) => ({ ...f, provider_model: `${provider}/${model}` }));
                  }}
                  label={selectedModelLabel}
                  input
                  buttonClassName="w-full border-subtle bg-layer-1 px-3 py-2 text-13 text-secondary"
                >
                  {(selectedProvider?.models ?? []).map((model) => (
                    <CustomSelect.Option key={model} value={model}>
                      <span className="text-13 text-primary">{model}</span>
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="agent-provider-model">
                  Provider/model slug
                </label>
                <Input
                  id="agent-provider-model"
                  className="w-full"
                  value={form.provider_model}
                  onChange={(e) => setForm((f) => ({ ...f, provider_model: e.target.value }))}
                  placeholder="anthropic/claude-sonnet-4-5"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="agent-base-url">
                  API base URL
                </label>
                <Input
                  id="agent-base-url"
                  type="url"
                  className="w-full"
                  value={form.api_base_url}
                  onChange={(e) => setForm((f) => ({ ...f, api_base_url: e.target.value }))}
                  placeholder="https://api.openrouter.ai/v1 (optional)"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelClass} htmlFor="agent-api-key">
                API key
              </label>
              <Input
                id="agent-api-key"
                type="password"
                autoComplete="new-password"
                className="w-full"
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                placeholder={isEdit && props.agent.has_api_key ? "•••••••• (key on file)" : "sk-…"}
              />
              <p className="mt-1 text-11 text-tertiary">{apiKeyHelper}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="lg" type="button" onClick={handleClose} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={submitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}

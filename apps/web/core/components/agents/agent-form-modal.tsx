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
// local
import { AgentAvatar } from "./agent-avatar";

// DiceBear's open-source HTTP service renders deterministic SVG avatars
// from a seed. We use the `bottts-neutral` style — friendly bot heads
// that feel right for AI agents and play well on both light and dark
// backgrounds. URL is the source of truth; we just generate one here.
const buildGeneratedAvatarUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(seed)}`;

const buildRandomAvatarUrl = () => buildGeneratedAvatarUrl(crypto.randomUUID());

const AGENT_TEMPLATES = [
  {
    key: "workspace",
    name: "Workspace companion",
    description: "Helps across docs, tasks, and team context.",
    prompt:
      "You are Atlas, a helpful workspace companion for DragonFruit. Use clear reasoning, ask focused questions when context is missing, and help the team move work forward.",
  },
  {
    key: "writing",
    name: "Writing companion",
    description: "Plans, drafts, rewrites, and sharpens documents.",
    prompt:
      "You are Atlas, a writing companion for this workspace. Help people plan documents, improve drafts, summarize context, and keep suggestions concise and useful.",
  },
  {
    key: "delivery",
    name: "Delivery companion",
    description: "Turns tasks into plans, next actions, and checks.",
    prompt:
      "You are Atlas, a delivery companion for this workspace. Help triage tasks, propose practical plans, identify risks, and suggest verification steps.",
  },
] as const;

type AgentFormState = {
  name: string;
  description: string;
  avatar_url: string;
  system_prompt: string;
};

const EMPTY_FORM: AgentFormState = {
  name: "",
  description: "",
  avatar_url: "",
  system_prompt: "",
};

const formFromAgent = (agent: TAgent): AgentFormState => ({
  name: agent.name ?? "",
  description: agent.description ?? "",
  avatar_url: agent.avatar_url ?? "",
  system_prompt: agent.system_prompt ?? "",
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

export function AgentFormModal(props: IAgentFormModalProps) {
  const { isOpen, onClose, mode } = props;
  const { t } = useTranslation();
  const initialForm = mode === "edit" ? formFromAgent(props.agent) : EMPTY_FORM;
  const [form, setForm] = useState<AgentFormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);

  // Re-seed when the modal opens or the target agent changes (edit mode
  // reuses a single modal instance for every row).
  useEffect(() => {
    if (!isOpen) return;
    setForm(mode === "edit" ? formFromAgent(props.agent) : EMPTY_FORM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, mode === "edit" ? props.agent.id : null]);

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
        });
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Atlas initialized" });
      } else {
        // Edit mode: send every visible field so clearing one persists.
        const payload: TAgentUpdatePayload = {
          name,
          description: form.description.trim(),
          avatar_url: form.avatar_url.trim(),
          system_prompt: form.system_prompt.trim(),
        };
        await props.onSubmit(props.agent.id, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Atlas updated" });
      }
      onClose();
    } catch (err) {
      const message =
        (err as { error?: string } | undefined)?.error ??
        (mode === "create"
          ? "Failed to initialize Atlas. Check the API server logs."
          : "Failed to update Atlas. Check the API server logs.");
      setToast({
        type: TOAST_TYPE.ERROR,
        title: mode === "create" ? "Could not initialize Atlas" : "Could not update Atlas",
        message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const labelClass = "block text-13 font-medium text-secondary mb-1";

  const isEdit = mode === "edit";
  const heading = isEdit ? "Configure Atlas" : "Initialize Atlas";
  const subheading = isEdit
    ? "Update the workspace companion's behavior and profile. Model and API key live in Settings -> AI."
    : "Atlas is the single workspace companion for docs, chat, tasks, and automations.";
  const submitLabel = isEdit
    ? submitting
      ? "Saving…"
      : "Save Atlas"
    : submitting
      ? "Initializing…"
      : "Initialize Atlas";
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
              placeholder="Atlas"
              disabled={isEdit}
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
              placeholder="The workspace companion for docs, chat, tasks, and automations"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="agent-avatar">
              Avatar
            </label>
            <div className="flex items-start gap-3">
              <div className="mt-1 shrink-0 rounded-lg border border-subtle bg-layer-2 p-1">
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
                    Paste an image URL, or randomize a unique companion avatar from Atlas.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, avatar_url: buildRandomAvatarUrl() }));
                    }}
                    className="shrink-0 text-11 font-medium text-accent-primary hover:underline"
                  >
                    Randomize avatar
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
              placeholder="You are Atlas, a helpful workspace companion for DragonFruit."
            />
          </div>

          <div className="rounded-lg border border-subtle bg-layer-2 px-3 py-2.5">
            <p className="text-13 font-medium text-secondary">Model and API key</p>
            <p className="mt-0.5 text-11 text-tertiary">
              Atlas uses the workspace provider configured in Settings -&gt; AI, so collaborators have one clear place
              to manage BYOK.
            </p>
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

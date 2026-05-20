/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, type FormEvent } from "react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// services
import type { TAgent, TAgentCreatePayload } from "@/services/agent.service";

interface ICreateAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: TAgentCreatePayload) => Promise<TAgent>;
}

const _DEFAULT_FORM: TAgentCreatePayload = {
  name: "",
  description: "",
  avatar_url: "",
  system_prompt: "",
  provider_model: "",
  api_base_url: "",
  api_key: "",
};

export function CreateAgentModal({ isOpen, onClose, onCreate }: ICreateAgentModalProps) {
  const [form, setForm] = useState<TAgentCreatePayload>(_DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => setForm(_DEFAULT_FORM);

  const handleClose = () => {
    if (submitting) return;
    reset();
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
      await onCreate({
        name,
        description: form.description?.trim() || undefined,
        avatar_url: form.avatar_url?.trim() || undefined,
        system_prompt: form.system_prompt?.trim() || undefined,
        provider_model: form.provider_model?.trim() || undefined,
        api_base_url: form.api_base_url?.trim() || undefined,
        api_key: form.api_key?.trim() || undefined,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: `Agent “${name}” created` });
      reset();
      onClose();
    } catch (err) {
      const message =
        (err as { error?: string } | undefined)?.error ?? "Failed to create the agent. Check the API server logs.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Could not create agent", message });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-body-sm text-primary outline-none transition-colors focus:border-strong";
  const labelClass = "block text-caption-md-medium text-secondary mb-1";

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="border-b border-subtle px-5 py-4">
          <h3 className="text-body-md-medium text-primary">Create an agent</h3>
          <p className="text-caption-md mt-1 text-tertiary">
            Agents are bot members of this workspace. Assign them to a task and they’ll participate like a teammate.
            Provider key is optional in this slice — it will be exercised in the next release.
          </p>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label className={labelClass} htmlFor="agent-name">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="agent-name"
              className={inputClass}
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
            <input
              id="agent-description"
              className={inputClass}
              value={form.description ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Triages incoming tasks and asks clarifying questions"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="agent-avatar">
              Avatar URL
            </label>
            <input
              id="agent-avatar"
              type="url"
              className={inputClass}
              value={form.avatar_url ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
              placeholder="https://…/agent-avatar.png"
            />
          </div>

          <div className="border-t border-subtle pt-4">
            <p className="mb-2 text-caption-md-medium text-secondary">
              BYOK provider config <span className="text-tertiary">(optional in this release)</span>
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="agent-provider-model">
                  Provider/model
                </label>
                <input
                  id="agent-provider-model"
                  className={inputClass}
                  value={form.provider_model ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, provider_model: e.target.value }))}
                  placeholder="anthropic/claude-sonnet-4.6"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="agent-base-url">
                  API base URL
                </label>
                <input
                  id="agent-base-url"
                  type="url"
                  className={inputClass}
                  value={form.api_base_url ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, api_base_url: e.target.value }))}
                  placeholder="https://api.openrouter.ai/v1 (optional)"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelClass} htmlFor="agent-api-key">
                API key
              </label>
              <input
                id="agent-api-key"
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={form.api_key ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                placeholder="Stored encrypted, never echoed back"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
          <Button variant="secondary" size="sm" type="button" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create agent"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}

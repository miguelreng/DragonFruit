/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { X } from "@/components/icons/lucide-shim";
import { WorkItemTemplateService, type TWorkItemTemplate } from "@/services/issue/work-item-template.service";

const templateService = new WorkItemTemplateService();

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  template?: TWorkItemTemplate;
  onClose: () => void;
  onSaved: (template: TWorkItemTemplate) => void;
};

export function WorkItemTemplateModal({ isOpen, workspaceSlug, template, onClose, onSaved }: Props) {
  const isEdit = !!template;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setSaving(false);
    setError(null);
  }, [isOpen, template]);

  const handleSave = async () => {
    if (!workspaceSlug || saving) return;
    if (!name.trim()) {
      setError("Template name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
      };
      const saved = isEdit
        ? await templateService.update(workspaceSlug, template.id, payload)
        : await templateService.create(workspaceSlug, {
            ...payload,
            default_name: "",
            default_description_html: "",
            default_priority: "none",
            default_assignee_ids: [],
            default_label_ids: [],
          });

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: isEdit ? "Template updated" : "Template created",
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError((err as { error?: string } | undefined)?.error ?? "Couldn't save the template.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.LG}>
      <div className="flex max-h-[85vh] flex-col">
        <header className="flex items-center justify-between border-b border-subtle px-5 py-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-14 font-medium text-primary">{isEdit ? "Edit task template" : "New task template"}</h2>
            <p className="text-12 text-tertiary">Start with a name and purpose. You can flesh out defaults later.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-tertiary hover:bg-layer-2 hover:text-primary"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </header>

        <div className="flex flex-col gap-4 px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-12 font-medium text-secondary">Template name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bug triage"
              className="rounded-lg border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none placeholder:text-placeholder focus:border-strong"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-12 font-medium text-secondary">Short description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What kind of task this starter is for"
              className="rounded-lg border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none placeholder:text-placeholder focus:border-strong"
            />
          </label>

          {error && <p className="text-12 text-danger-primary">{error}</p>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void handleSave()} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create template"}
          </Button>
        </footer>
      </div>
    </ModalCore>
  );
}

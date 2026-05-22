/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { Plus, Trash2, X } from "@/components/icons/lucide-shim";
// services
import { ProjectTemplateService } from "@/services/project/project-template.service";
import type { TProjectTemplate, TProjectTemplateInitialTask } from "@/services/project/project-template.service";

const projectTemplateService = new ProjectTemplateService();

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  /** Set for edit; undefined for create. */
  template?: TProjectTemplate;
  onClose: () => void;
  onSaved: (template: TProjectTemplate) => void;
};

type DraftTask = TProjectTemplateInitialTask & { _key: string };

// Stable-id keys for the initial-task list so React doesn't reuse a
// row when the user reorders/deletes. Date.now + random is enough for
// a few rows in one modal session.
function makeKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDraft(rows: TProjectTemplateInitialTask[]): DraftTask[] {
  return rows.map((r) => ({ ...r, _key: makeKey() }));
}

const PRIORITY_OPTIONS: TProjectTemplateInitialTask["priority"][] = ["none", "urgent", "high", "medium", "low"];

const NETWORK_LABELS: { value: number; label: string; description: string }[] = [
  { value: 0, label: "Private", description: "Only invited members can see this project" },
  { value: 2, label: "Public", description: "Anyone in the workspace can join" },
];

/**
 * Single modal that handles both Create and Edit. Form is uncontrolled
 * by react-hook-form (overkill here) — local state + a save button
 * keeps things tight. Initial-task editing is a stacked list of name
 * inputs with priority dropdowns + a "+ Add task" row at the bottom.
 */
export function ProjectTemplateModal(props: Props) {
  const { isOpen, workspaceSlug, template, onClose, onSaved } = props;
  const isEdit = !!template;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [network, setNetwork] = useState<number>(0);
  const [initialTasks, setInitialTasks] = useState<DraftTask[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from the row when opening for edit. Reset on close so the
  // next "New" opens cleanly.
  useEffect(() => {
    if (!isOpen) return;
    if (template) {
      setName(template.name);
      setDescription(template.description || "");
      setProjectDescription(template.project_description || "");
      setNetwork(template.network);
      setInitialTasks(toDraft(template.initial_tasks || []));
    } else {
      setName("");
      setDescription("");
      setProjectDescription("");
      setNetwork(0);
      setInitialTasks([]);
    }
    setError(null);
    setSaving(false);
  }, [isOpen, template]);

  const handleAddTask = () => {
    setInitialTasks((cur) => [...cur, { name: "", priority: "none", _key: makeKey() }]);
  };

  const handleTaskChange = (key: string, patch: Partial<DraftTask>) => {
    setInitialTasks((cur) => cur.map((row) => (row._key === key ? { ...row, ...patch } : row)));
  };

  const handleRemoveTask = (key: string) => {
    setInitialTasks((cur) => cur.filter((row) => row._key !== key));
  };

  const handleSave = async () => {
    if (!workspaceSlug || saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Template name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    // Strip draft-only keys + drop blank-name rows so we don't
    // persist garbage entries the user added but didn't fill in.
    const cleanedTasks: TProjectTemplateInitialTask[] = initialTasks
      .filter((row) => row.name.trim().length > 0)
      .map((row) => ({
        name: row.name.trim(),
        description: row.description?.trim() || undefined,
        priority: row.priority ?? "none",
      }));
    const payload = {
      name: trimmedName,
      description: description.trim(),
      project_description: projectDescription.trim(),
      network,
      initial_tasks: cleanedTasks,
    };
    try {
      const saved = isEdit
        ? await projectTemplateService.update(workspaceSlug, template!.id, payload)
        : await projectTemplateService.create(workspaceSlug, payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: isEdit ? "Template updated" : "Template created",
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      const msg = (err as { error?: string } | undefined)?.error ?? "Couldn't save the template.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="flex max-h-[85vh] flex-col">
        <header className="flex items-center justify-between border-b border-subtle px-5 py-3">
          <h2 className="text-14 font-medium text-primary">
            {isEdit ? "Edit project template" : "New project template"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-tertiary hover:bg-layer-2 hover:text-primary"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            <Field label="Template name" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Engineering sprint"
                className="rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none placeholder:text-placeholder focus:border-strong"
              />
            </Field>

            <Field label="Template description" hint="Shown in the picker dropdown.">
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One-line summary"
                className="rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none placeholder:text-placeholder focus:border-strong"
              />
            </Field>

            <Field label="Default project description" hint="Copied into new projects as their description.">
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={3}
                placeholder="What new projects from this template should read like."
                className="min-h-[72px] resize-y rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none placeholder:text-placeholder focus:border-strong"
              />
            </Field>

            <Field label="Visibility">
              <div className="grid grid-cols-2 gap-2">
                {NETWORK_LABELS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNetwork(opt.value)}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-md border-[0.5px] px-3 py-2 text-left transition-colors",
                      network === opt.value
                        ? "border-accent-strong bg-accent-primary/5"
                        : "border-subtle bg-layer-1 hover:bg-layer-2"
                    )}
                  >
                    <span className="text-13 font-medium text-primary">{opt.label}</span>
                    <span className="text-11 text-tertiary">{opt.description}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Initial tasks"
              hint="Created inside the new project on first use. They land in the project's default state."
            >
              <ul className="flex flex-col gap-2">
                {initialTasks.map((row) => (
                  <li
                    key={row._key}
                    className="flex items-center gap-2 rounded-md border-[0.5px] border-subtle bg-layer-1 px-2 py-1.5"
                  >
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => handleTaskChange(row._key, { name: e.target.value })}
                      placeholder="Task name"
                      className="flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
                    />
                    <select
                      value={row.priority ?? "none"}
                      onChange={(e) =>
                        handleTaskChange(row._key, {
                          priority: e.target.value as TProjectTemplateInitialTask["priority"],
                        })
                      }
                      className="rounded border-[0.5px] border-subtle bg-layer-2 px-1.5 py-1 text-12 text-secondary outline-none"
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveTask(row._key)}
                      className="grid size-7 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-danger-primary"
                      aria-label="Remove task"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={handleAddTask}
                    className="inline-flex items-center gap-1.5 rounded-md border-[0.5px] border-dashed border-subtle px-3 py-1.5 text-12 text-secondary hover:bg-layer-2 hover:text-primary"
                  >
                    <Plus className="size-3" />
                    Add task
                  </button>
                </li>
              </ul>
            </Field>

            {error && <p className="text-12 text-danger-primary">{error}</p>}
          </div>
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

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-12 font-medium text-secondary">
          {label}
          {required && <span className="ml-0.5 text-danger-primary">*</span>}
        </span>
        {hint && <span className="text-11 text-tertiary">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

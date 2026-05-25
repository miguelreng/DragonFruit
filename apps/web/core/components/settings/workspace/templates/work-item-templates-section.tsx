/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
// plane imports
import { Button } from "@plane/propel/button";
// components
import { Loader2, Pencil, Plus, Trash2 } from "@/components/icons/lucide-shim";
// services
import { WorkItemTemplateService, type TWorkItemTemplate } from "@/services/issue/work-item-template.service";

const templateService = new WorkItemTemplateService();

type Props = {
  workspaceSlug: string;
  canEdit: boolean;
};

function formatRelative(updatedAt: string | undefined): string {
  if (!updatedAt) return "";
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Workspace-scoped Work Item (Task) templates. Mirrors the shape of the
 * page-templates section directly above it: list + inline rename + delete.
 *
 * "New template" creates an empty template (just a name) — the rich
 * defaults (priority, assignees, labels, description body) can be set
 * later via a richer edit modal (separate PR). The inline name/description
 * editor here is enough to manage a basic library of templates that
 * the issue-create modal's picker can apply.
 */
export function WorkItemTemplatesSection({ workspaceSlug, canEdit }: Props) {
  const [templates, setTemplates] = useState<TWorkItemTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string }>({ name: "", description: "" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceSlug) return;
    setLoading(true);
    setError(null);
    try {
      setTemplates(await templateService.list(workspaceSlug));
    } catch (err) {
      setError((err as { error?: string } | undefined)?.error ?? "Couldn't load task templates.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginEdit = useCallback((template: TWorkItemTemplate) => {
    setEditingId(template.id);
    setDraft({ name: template.name, description: template.description ?? "" });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft({ name: "", description: "" });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!workspaceSlug || creating) return;
    setCreating(true);
    try {
      const fresh = await templateService.create(workspaceSlug, {
        name: "Untitled template",
        description: "",
      });
      setTemplates((prev) => [fresh, ...prev]);
      // Drop straight into rename so the user can name it without an
      // extra click. Matches the "Untitled doc → rename" pattern we use
      // for pages and projects.
      beginEdit(fresh);
    } catch (err) {
      setError((err as { error?: string } | undefined)?.error ?? "Couldn't create the template.");
    } finally {
      setCreating(false);
    }
  }, [workspaceSlug, creating, beginEdit]);

  const handleSave = useCallback(
    async (templateId: string) => {
      if (!workspaceSlug) return;
      setBusyId(templateId);
      try {
        const updated = await templateService.update(workspaceSlug, templateId, {
          name: draft.name.trim() || "Untitled template",
          description: draft.description.trim(),
        });
        setTemplates((prev) => prev.map((row) => (row.id === templateId ? { ...row, ...updated } : row)));
        cancelEdit();
      } catch (err) {
        setError((err as { error?: string } | undefined)?.error ?? "Couldn't save the template.");
      } finally {
        setBusyId(null);
      }
    },
    [workspaceSlug, draft, cancelEdit]
  );

  const handleDelete = useCallback(
    async (templateId: string) => {
      if (!workspaceSlug) return;
      if (!window.confirm("Delete this template? This can't be undone.")) return;
      setBusyId(templateId);
      try {
        await templateService.destroy(workspaceSlug, templateId);
        setTemplates((prev) => prev.filter((row) => row.id !== templateId));
      } catch (err) {
        setError((err as { error?: string } | undefined)?.error ?? "Couldn't delete the template.");
      } finally {
        setBusyId(null);
      }
    },
    [workspaceSlug]
  );

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-14 font-medium text-primary">Task templates</h3>
          <p className="text-12 text-tertiary">
            Reusable task skeletons. Apply one when creating a new task to pre-fill its fields.
          </p>
        </div>
        {canEdit && (
          <Button variant="primary" size="sm" onClick={() => void handleCreate()} disabled={creating}>
            <Plus className="size-3.5" />
            <span>New template</span>
          </Button>
        )}
      </header>

      {error && <p className="text-12 text-danger-primary">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-13 text-tertiary">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-subtle bg-layer-1 px-6 py-10 text-center">
          <h4 className="text-13 font-medium text-secondary">No task templates yet</h4>
          <p className="max-w-md text-12 text-tertiary">
            Click "New template" above to create one. Templates show up in the task create modal's "Apply template"
            picker.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-subtle bg-layer-2">
          <div className="grid grid-cols-[1fr_1.4fr_120px_84px] gap-3 border-b border-subtle bg-layer-1 px-4 py-2 text-11 font-medium text-tertiary uppercase">
            <span>Name</span>
            <span>Description</span>
            <span>Updated</span>
            <span className="text-right">Actions</span>
          </div>
          {templates.map((template) => {
            const isEditing = editingId === template.id;
            const isBusy = busyId === template.id;
            return (
              <div
                key={template.id}
                className="grid grid-cols-[1fr_1.4fr_120px_84px] items-center gap-3 border-b border-subtle px-4 py-3 last:border-b-0"
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Template name"
                    className="rounded-lg border-[0.5px] border-subtle bg-layer-1 px-2 py-1.5 text-13 text-primary outline-none"
                    // Focus follows the click into rename — same pattern as
                    // the page-templates section above.
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                  />
                ) : (
                  <span className="truncate text-13 text-primary">{template.name}</span>
                )}
                {isEditing ? (
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="What this template is for"
                    className="rounded-lg border-[0.5px] border-subtle bg-layer-1 px-2 py-1.5 text-13 text-primary outline-none"
                  />
                ) : (
                  <span className="truncate text-12 text-secondary">{template.description || "—"}</span>
                )}
                <span className="text-11 text-tertiary">{formatRelative(template.updated_at)}</span>
                <div className="flex items-center justify-end gap-1">
                  {isEditing ? (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void handleSave(template.id)}
                        disabled={isBusy || !draft.name.trim()}
                      >
                        {isBusy ? "…" : "Save"}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={isBusy}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => beginEdit(template)}
                        disabled={!canEdit || isBusy}
                        className="rounded-md p-1.5 text-tertiary hover:bg-layer-1 hover:text-primary disabled:opacity-50"
                        title="Rename"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(template.id)}
                        disabled={!canEdit || isBusy}
                        className="rounded-md p-1.5 text-tertiary hover:bg-layer-1 hover:text-danger-primary disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

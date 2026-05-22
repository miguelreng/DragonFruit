/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
// plane imports
import { Button } from "@plane/propel/button";
// components
import { Briefcase, Loader2, Pencil, Plus, Trash2 } from "@/components/icons/lucide-shim";
// services
import { ProjectTemplateService } from "@/services/project/project-template.service";
import type { TProjectTemplate } from "@/services/project/project-template.service";
// local
import { ProjectTemplateModal } from "./project-template-modal";

const projectTemplateService = new ProjectTemplateService();

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
 * Manages workspace-scoped project templates. Mirrors the shape of the
 * page-templates list directly above it — but creates open a modal
 * (project templates have more fields than docs: project_description,
 * network, initial_tasks) instead of the inline rename UX.
 */
export function ProjectTemplatesSection({ workspaceSlug, canEdit }: Props) {
  const [templates, setTemplates] = useState<TProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TProjectTemplate | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceSlug) return;
    setLoading(true);
    setError(null);
    try {
      setTemplates(await projectTemplateService.list(workspaceSlug));
    } catch (err) {
      setError((err as { error?: string } | undefined)?.error ?? "Couldn't load project templates.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpenCreate = () => {
    setEditing(undefined);
    setModalOpen(true);
  };

  const handleOpenEdit = (template: TProjectTemplate) => {
    setEditing(template);
    setModalOpen(true);
  };

  const handleSaved = (saved: TProjectTemplate) => {
    setTemplates((cur) => {
      const i = cur.findIndex((row) => row.id === saved.id);
      if (i === -1) return [saved, ...cur];
      const next = [...cur];
      next[i] = saved;
      return next;
    });
  };

  const handleDelete = async (template: TProjectTemplate) => {
    if (!workspaceSlug) return;
    if (!window.confirm(`Delete "${template.name}"? This can't be undone.`)) return;
    setBusyId(template.id);
    try {
      await projectTemplateService.destroy(workspaceSlug, template.id);
      setTemplates((cur) => cur.filter((row) => row.id !== template.id));
    } catch (err) {
      setError((err as { error?: string } | undefined)?.error ?? "Couldn't delete the template.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-14 font-medium text-primary">Project templates</h3>
          <p className="text-12 text-tertiary">
            Reusable project skeletons — defaults for the new-project form plus an initial set of tasks.
          </p>
        </div>
        {canEdit && (
          <Button variant="primary" size="sm" onClick={handleOpenCreate}>
            <Plus className="size-3.5" />
            New template
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
          <Briefcase className="size-7 text-tertiary" />
          <h4 className="text-13 font-medium text-secondary">No project templates yet</h4>
          <p className="max-w-md text-12 text-tertiary">
            Create a template to pre-fill new projects with a description, visibility, and an initial task list.
          </p>
          {canEdit && (
            <Button variant="primary" size="sm" onClick={handleOpenCreate}>
              <Plus className="size-3.5" />
              New template
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-subtle bg-layer-2">
          <div className="grid grid-cols-[1fr_1.4fr_80px_120px_84px] gap-3 border-b border-subtle bg-layer-1 px-4 py-2 text-11 font-medium text-tertiary uppercase">
            <span>Name</span>
            <span>Description</span>
            <span>Tasks</span>
            <span>Updated</span>
            <span className="text-right">Actions</span>
          </div>
          {templates.map((template) => {
            const isBusy = busyId === template.id;
            const taskCount = (template.initial_tasks ?? []).length;
            return (
              <div
                key={template.id}
                className="grid grid-cols-[1fr_1.4fr_80px_120px_84px] items-center gap-3 border-b border-subtle px-4 py-3 text-13 last:border-b-0"
              >
                <div className="flex items-center gap-2 truncate text-primary">
                  <Briefcase className="size-3.5 shrink-0 text-tertiary" />
                  <span className="truncate">{template.name}</span>
                </div>
                <span className="truncate text-12 text-secondary">{template.description || "—"}</span>
                <span className="text-12 text-tertiary">{taskCount}</span>
                <span className="text-11 text-tertiary">{formatRelative(template.updated_at)}</span>
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(template)}
                    disabled={!canEdit || isBusy}
                    className="rounded-md p-1.5 text-tertiary hover:bg-layer-1 hover:text-primary disabled:opacity-50"
                    title="Edit"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(template)}
                    disabled={!canEdit || isBusy}
                    className="rounded-md p-1.5 text-tertiary hover:bg-layer-1 hover:text-danger-primary disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProjectTemplateModal
        isOpen={modalOpen}
        workspaceSlug={workspaceSlug}
        template={editing}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </section>
  );
}

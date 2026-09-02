/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@dragonfruit/propel/button";
import { CheckSquare, Loader2, Pencil, Plus, Trash2 } from "@/components/icons/lucide-shim";
import { WorkItemTemplateService, type TWorkItemTemplate } from "@/services/issue/work-item-template.service";
import { WorkItemTemplateModal } from "./work-item-template-modal";

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

export function WorkItemTemplatesSection({ workspaceSlug, canEdit }: Props) {
  const [templates, setTemplates] = useState<TWorkItemTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TWorkItemTemplate | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const handleSaved = (saved: TWorkItemTemplate) => {
    setTemplates((current) => {
      const index = current.findIndex((row) => row.id === saved.id);
      if (index === -1) return [saved, ...current];
      const next = [...current];
      next[index] = saved;
      return next;
    });
  };

  const handleDelete = async (template: TWorkItemTemplate) => {
    if (!workspaceSlug) return;
    if (!window.confirm(`Delete "${template.name}"? This can't be undone.`)) return;
    setBusyId(template.id);
    try {
      await templateService.destroy(workspaceSlug, template.id);
      setTemplates((current) => current.filter((row) => row.id !== template.id));
    } catch (err) {
      setError((err as { error?: string } | undefined)?.error ?? "Couldn't delete the template.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-14 font-medium text-primary">Task templates</h3>
          <p className="text-12 text-tertiary">
            Reusable task starters for bugs, requests, QA checks, handoffs, and recurring operational work.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditing(undefined);
              setModalOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            New task template
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
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-subtle bg-layer-1 px-6 py-10 text-center">
          <CheckSquare className="size-7 text-tertiary" />
          <h4 className="text-13 font-medium text-secondary">No task templates yet</h4>
          <p className="max-w-md text-12 text-tertiary">
            Start with a lightweight task starter here, then apply it any time your team creates similar work.
          </p>
          {canEdit && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditing(undefined);
                setModalOpen(true);
              }}
            >
              <Plus className="size-3.5" />
              New task template
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {templates.map((template) => {
            const isBusy = busyId === template.id;
            return (
              <div
                key={template.id}
                className="group shadow-sm flex min-h-[160px] flex-col justify-between rounded-xl border border-subtle bg-surface-1 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-layer-2 text-secondary">
                      <CheckSquare className="size-4" />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <h4 className="truncate text-14 font-medium text-primary">{template.name}</h4>
                      <p className="line-clamp-3 text-12 leading-5 text-secondary">
                        {template.description ||
                          "Task starter ready for priorities, labels, assignees, and future defaults."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(template);
                        setModalOpen(true);
                      }}
                      disabled={!canEdit || isBusy}
                      className="rounded-lg p-1.5 text-tertiary hover:bg-layer-1 hover:text-primary disabled:opacity-50"
                      title="Edit"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(template)}
                      disabled={!canEdit || isBusy}
                      className="rounded-lg p-1.5 text-tertiary hover:bg-layer-1 hover:text-danger-primary disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4 text-11 text-tertiary">
                  <span>Task template</span>
                  <span>{formatRelative(template.updated_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <WorkItemTemplateModal
        isOpen={modalOpen}
        workspaceSlug={workspaceSlug}
        template={editing}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </section>
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@plane/propel/button";
import type { TPageTemplate, TPageTemplateDetail } from "@plane/types";
import { FileText, Loader2, Pencil, Plus, Trash2 } from "@/components/icons/lucide-shim";
import { PageTemplateService } from "@/services/page/page-template.service";
import { PageTemplateModal } from "./page-template-modal";

const templateService = new PageTemplateService();

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

export function PageTemplatesSection({ workspaceSlug, canEdit }: Props) {
  const [templates, setTemplates] = useState<TPageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TPageTemplate | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceSlug) return;
    setLoading(true);
    setError(null);
    try {
      setTemplates(await templateService.list(workspaceSlug));
    } catch (err) {
      setError((err as { error?: string } | undefined)?.error ?? "Couldn't load doc templates.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaved = (saved: TPageTemplateDetail) => {
    setTemplates((current) => {
      const index = current.findIndex((row) => row.id === saved.id);
      if (index === -1) return [saved, ...current];
      const next = [...current];
      next[index] = saved;
      return next;
    });
  };

  const handleDelete = async (template: TPageTemplate) => {
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
          <h3 className="text-14 font-medium text-primary">Doc templates</h3>
          <p className="text-12 text-tertiary">
            Create reusable writing starters for briefs, landing pages, proposals, and internal notes.
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
            New doc template
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
          <FileText className="size-7 text-tertiary" />
          <h4 className="text-13 font-medium text-secondary">No doc templates yet</h4>
          <p className="max-w-md text-12 text-tertiary">
            Start a reusable doc here, or save an existing doc as a template from the editor when it’s ready.
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
              New doc template
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
                      <FileText className="size-4" />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <h4 className="truncate text-14 font-medium text-primary">{template.name}</h4>
                      <p className="line-clamp-3 text-12 leading-5 text-secondary">
                        {template.description || "Blank doc starter ready to be shaped into a reusable format."}
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
                  <span>Doc template</span>
                  <span>{formatRelative(template.updated_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PageTemplateModal
        isOpen={modalOpen}
        workspaceSlug={workspaceSlug}
        template={editing}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </section>
  );
}

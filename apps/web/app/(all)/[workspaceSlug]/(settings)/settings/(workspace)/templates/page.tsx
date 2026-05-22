/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TPageTemplate } from "@plane/types";
import { cn } from "@plane/utils";
// icons
import { FileText, Loader2, Pencil, Trash2 } from "@/components/icons/lucide-shim";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { PageTemplateService } from "@/services/page/page-template.service";
// section components
import { ProjectTemplatesSection } from "@/components/settings/workspace/templates/project-templates-section";
import { WorkItemTemplatesSection } from "@/components/settings/workspace/templates/work-item-templates-section";
// local
import { TemplatesWorkspaceSettingsHeader } from "./header";

const templateService = new PageTemplateService();

function formatRelative(updatedAt: string | undefined): string {
  if (!updatedAt) return "";
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function TemplatesSettingsPage() {
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();
  const params = useParams();
  const workspaceSlug = String(params?.workspaceSlug ?? "");

  const canEdit = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const [templates, setTemplates] = useState<TPageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string }>({ name: "", description: "" });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceSlug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await templateService.list(workspaceSlug);
      setTemplates(data);
    } catch (err: any) {
      setError(err?.error || "Couldn't load templates.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginEdit = useCallback((template: TPageTemplate) => {
    setEditingId(template.id);
    setDraft({ name: template.name, description: template.description ?? "" });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft({ name: "", description: "" });
  }, []);

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
      } catch (err: any) {
        setError(err?.error || "Couldn't save the template.");
      } finally {
        setBusyId(null);
      }
    },
    [workspaceSlug, draft, cancelEdit]
  );

  const handleDelete = useCallback(
    async (templateId: string) => {
      if (!workspaceSlug) return;
      if (!window.confirm(t("workspace_settings.settings.templates.delete_confirm"))) return;
      setBusyId(templateId);
      try {
        await templateService.destroy(workspaceSlug, templateId);
        setTemplates((prev) => prev.filter((row) => row.id !== templateId));
      } catch (err: any) {
        setError(err?.error || "Couldn't delete the template.");
      } finally {
        setBusyId(null);
      }
    },
    [workspaceSlug, t]
  );

  const pageTitle = useMemo(
    () =>
      currentWorkspace?.name
        ? `${currentWorkspace.name} - ${t("workspace_settings.settings.templates.title")}`
        : undefined,
    [currentWorkspace?.name, t]
  );

  if (workspaceUserInfo && !canEdit) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<TemplatesWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className={cn("flex w-full flex-col gap-y-8", { "opacity-60": !canEdit })}>
        <SettingsHeading
          title={t("workspace_settings.settings.templates.heading")}
          description={t("workspace_settings.settings.templates.description")}
        />

        {error && <p className="text-12 text-danger-primary">{error}</p>}

        {/* ── Page templates ── */}
        <section className="flex flex-col gap-3">
          <header>
            <h3 className="text-14 font-medium text-primary">Page templates</h3>
            <p className="text-12 text-tertiary">
              Reusable doc skeletons. Use "Save as template" on any page to add one.
            </p>
          </header>
          {loading ? (
            <div className="flex items-center gap-2 text-13 text-tertiary">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-subtle bg-layer-1 px-6 py-10 text-center">
              <FileText className="size-7 text-tertiary" />
              <h4 className="text-13 font-medium text-secondary">
                {t("workspace_settings.settings.templates.empty_title")}
              </h4>
              <p className="max-w-md text-12 text-tertiary">
                {t("workspace_settings.settings.templates.empty_description")}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-subtle bg-layer-2">
              <div className="tracking-normal grid grid-cols-[1fr_1.4fr_120px_84px] gap-3 border-b border-subtle bg-layer-1 px-4 py-2 text-11 font-medium text-tertiary uppercase">
                <span>{t("workspace_settings.settings.templates.table_name")}</span>
                <span>{t("workspace_settings.settings.templates.table_description")}</span>
                <span>{t("workspace_settings.settings.templates.table_updated")}</span>
                <span className="text-right">{t("workspace_settings.settings.templates.table_actions")}</span>
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
                        placeholder={t("workspace_settings.settings.templates.name_placeholder")}
                        className="rounded-md border-[0.5px] border-subtle bg-layer-1 px-2 py-1.5 text-13 text-primary outline-none"
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center gap-2 truncate text-13 text-primary">
                        <FileText className="size-3.5 shrink-0 text-tertiary" />
                        <span className="truncate">{template.name}</span>
                      </div>
                    )}
                    {isEditing ? (
                      <input
                        type="text"
                        value={draft.description}
                        onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                        placeholder={t("workspace_settings.settings.templates.description_placeholder")}
                        className="rounded-md border-[0.5px] border-subtle bg-layer-1 px-2 py-1.5 text-13 text-primary outline-none"
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
                            title={t("workspace_settings.settings.templates.rename")}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(template.id)}
                            disabled={!canEdit || isBusy}
                            className="rounded-md p-1.5 text-tertiary hover:bg-layer-1 hover:text-danger-primary disabled:opacity-50"
                            title={t("workspace_settings.settings.templates.delete")}
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

        {/* ── Task templates ── */}
        <WorkItemTemplatesSection workspaceSlug={workspaceSlug} canEdit={canEdit} />

        {/* ── Project templates ── */}
        <ProjectTemplatesSection workspaceSlug={workspaceSlug} canEdit={canEdit} />
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(TemplatesSettingsPage);

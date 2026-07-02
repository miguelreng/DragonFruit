/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate } from "react-router";
import { EPageAccess, EUserPermissions } from "@plane/constants";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { ArrowLeft, File as FileIcon, LayoutGrid, Search, X } from "@/components/icons/lucide-shim";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { ProjectPageService } from "@/services/page/project-page.service";
import {
  DOC_TEMPLATE_CATEGORIES,
  DOC_TEMPLATES,
  getTemplateLogoProps,
  type TDocTemplate,
  type TDocTemplateCategory,
} from "./doc-templates";

const pageService = new ProjectPageService();
const PAGE_READY_RETRY_DELAYS_MS = [150, 300, 500, 800, 1200];
const wait = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));

const ALLOWED_ROLES = new Set<EUserPermissions | EUserProjectRoles>([
  EUserPermissions.ADMIN,
  EUserPermissions.MEMBER,
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.MEMBER,
]);

type RailKey = TDocTemplateCategory | "all";

type Props = {
  workspaceSlug: string;
  isOpen: boolean;
  onClose: () => void;
  /** When set, create directly in this project and skip the project picker. */
  lockedProjectId?: string;
};

export const DocTemplateGalleryModal = observer(function DocTemplateGalleryModal({
  workspaceSlug,
  isOpen,
  onClose,
  lockedProjectId,
}: Props) {
  const navigate = useNavigate();
  const { joinedProjectIds, getProjectById } = useProject();
  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();

  const [activeRail, setActiveRail] = useState<RailKey>("all");
  const [projectSearch, setProjectSearch] = useState("");
  const [submittingProjectId, setSubmittingProjectId] = useState<string | null>(null);
  // The template awaiting a project choice. `null` template = blank doc.
  const [pending, setPending] = useState<{ template: TDocTemplate | null } | null>(null);

  const eligibleProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    return (joinedProjectIds ?? [])
      .map((id) => getProjectById(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .filter((p) => {
        const role = getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, p.id);
        return role !== undefined && ALLOWED_ROLES.has(role);
      })
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true));
  }, [joinedProjectIds, getProjectById, getProjectRoleByWorkspaceSlugAndProjectId, workspaceSlug, projectSearch]);

  const isCreating = submittingProjectId !== null;

  const reset = () => {
    setActiveRail("all");
    setProjectSearch("");
    setPending(null);
    setSubmittingProjectId(null);
  };

  const handleClose = () => {
    if (isCreating) return;
    reset();
    onClose();
  };

  const waitForCreatedPage = async (projectId: string, pageId: string, delays = PAGE_READY_RETRY_DELAYS_MS) => {
    try {
      await pageService.fetchById(workspaceSlug, projectId, pageId, false);
    } catch {
      const [delay, ...rest] = delays;
      if (delay === undefined) return;
      await wait(delay);
      await waitForCreatedPage(projectId, pageId, rest);
    }
  };

  const createDoc = async (projectId: string, template: TDocTemplate | null) => {
    if (isCreating) return;
    setSubmittingProjectId(projectId);
    const payload: Partial<TPage> = {
      access: EPageAccess.PRIVATE,
      page_type: "doc",
      ...(template
        ? {
            name: template.title,
            logo_props: getTemplateLogoProps(template),
            description_html: template.descriptionHtml,
          }
        : {}),
    };
    try {
      const page = await pageService.create(workspaceSlug, projectId, payload);
      if (page?.id) {
        // Don't open the editor before the new page is queryable.
        await waitForCreatedPage(projectId, page.id);
        reset();
        onClose();
        navigate(`/${workspaceSlug}/projects/${projectId}/pages/${page.id}`);
      }
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.error || "Doc could not be created. Please try again.",
      });
      setSubmittingProjectId(null);
    }
  };

  // Picking a template: create straight away when the project is unambiguous,
  // otherwise advance to the project picker.
  const handleSelectTemplate = (template: TDocTemplate | null) => {
    if (isCreating) return;
    if (lockedProjectId) {
      void createDoc(lockedProjectId, template);
      return;
    }
    if (eligibleProjects.length === 1) {
      void createDoc(eligibleProjects[0].id, template);
      return;
    }
    setPending({ template });
  };

  const showProjectStep = pending !== null && !lockedProjectId;
  const visibleCategories = DOC_TEMPLATE_CATEGORIES.filter((c) => activeRail === "all" || c.key === activeRail);

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXXL}>
      <div className="flex h-[560px] max-h-[80vh] flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            {showProjectStep && (
              <button
                type="button"
                onClick={() => setPending(null)}
                className="grid size-6 place-items-center rounded-md text-tertiary hover:bg-layer-1 hover:text-primary"
                aria-label="Back to templates"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <span className="text-15 font-normal text-primary">{showProjectStep ? "Choose a project" : "New doc"}</span>
            {showProjectStep && pending?.template && (
              <span className="text-13 text-tertiary">· {pending.template.title}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="grid size-6 place-items-center rounded-md text-tertiary hover:bg-layer-1 hover:text-primary"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {showProjectStep ? (
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="mb-2 flex shrink-0 items-center gap-1.5 rounded-lg border border-subtle bg-canvas px-2.5 py-1.5">
              <Search className="size-4 text-tertiary" />
              <input
                type="text"
                autoFocus
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Search projects"
                className="w-full bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {eligibleProjects.length > 0 ? (
                eligibleProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    disabled={isCreating}
                    onClick={() => void createDoc(project.id, pending?.template ?? null)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-13 text-primary hover:bg-layer-1",
                      { "opacity-50": isCreating }
                    )}
                  >
                    <span className="grid size-4 flex-shrink-0 place-items-center">
                      <Logo logo={project.logo_props} size={12} />
                    </span>
                    <span className="truncate">{project.name}</span>
                    {submittingProjectId === project.id && (
                      <span className="ml-auto text-13 text-tertiary">Creating…</span>
                    )}
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-11 text-placeholder italic">
                  {projectSearch.trim() ? "No matching projects" : "Join a project to create a doc"}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="flex w-40 flex-shrink-0 flex-col gap-0.5 border-r border-subtle p-2.5">
              <RailItem
                label="All templates"
                active={activeRail === "all"}
                onClick={() => setActiveRail("all")}
                icon={<LayoutGrid className="size-4" weight={activeRail === "all" ? "Bold" : undefined} />}
              />
              {DOC_TEMPLATE_CATEGORIES.map(({ key, label, Icon }) => (
                <RailItem
                  key={key}
                  label={label}
                  active={activeRail === key}
                  onClick={() => setActiveRail(key)}
                  icon={<Icon className="size-4" weight={activeRail === key ? "Bold" : undefined} />}
                />
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
              {activeRail === "all" && (
                <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <TemplateCard
                    title="Blank doc"
                    subtitle="Start from scratch"
                    icon={<FileIcon className="size-4" />}
                    disabled={isCreating}
                    onClick={() => handleSelectTemplate(null)}
                  />
                </div>
              )}
              <div className="flex flex-col gap-5">
                {visibleCategories.map((cat) => (
                  <section key={cat.key}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-11 font-normal text-tertiary">{cat.label}</span>
                      <span className="h-0 flex-1 border-t border-subtle" />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {DOC_TEMPLATES.filter((t) => t.category === cat.key).map((template) => (
                        <TemplateCard
                          key={template.id}
                          title={template.title}
                          subtitle={template.subtitle}
                          icon={<cat.Icon className="size-4" />}
                          disabled={isCreating}
                          onClick={() => handleSelectTemplate(template)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalCore>
  );
});

type RailItemProps = { label: string; active: boolean; onClick: () => void; icon: React.ReactNode };

function RailItem({ label, active, onClick, icon }: RailItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-13 text-primary transition-colors hover:bg-layer-1",
        { "bg-layer-1 font-normal": active }
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

type TemplateCardProps = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

function TemplateCard({ title, subtitle, icon, disabled, onClick }: TemplateCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-xl border border-subtle bg-surface-1 p-3 text-left transition-colors hover:border-strong hover:bg-layer-1",
        { "cursor-not-allowed opacity-50": disabled }
      )}
    >
      <span className="mb-2.5 grid size-8 place-items-center rounded-lg bg-layer-1">{icon}</span>
      <span className="text-13 font-normal text-primary">{title}</span>
      <span className="mt-0.5 line-clamp-2 text-12 text-tertiary">{subtitle}</span>
    </button>
  );
}

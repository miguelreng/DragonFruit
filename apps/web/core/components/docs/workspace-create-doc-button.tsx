/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate } from "react-router";
import { Menu } from "@headlessui/react";
import { usePopper } from "react-popper";
import { EPageAccess, EUserPermissions } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage, TPageType } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
import { cn } from "@plane/utils";
import { ChevronDown, FileText, Whiteboard, Search } from "@/components/icons/lucide-shim";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { ProjectPageService } from "@/services/page/project-page.service";

const pageService = new ProjectPageService();
const PAGE_READY_RETRY_DELAYS_MS = [150, 300, 500, 800, 1200];

const wait = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));

const TYPE_META: Record<TPageType, { label: string; Icon: typeof FileText }> = {
  doc: { label: "Doc", Icon: FileText },
  whiteboard: { label: "Whiteboard", Icon: Whiteboard },
};

const ALLOWED_ROLES = new Set<EUserPermissions | EUserProjectRoles>([
  EUserPermissions.ADMIN,
  EUserPermissions.MEMBER,
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.MEMBER,
]);

type Props = {
  workspaceSlug: string;
  defaultType?: TPageType;
};

export const WorkspaceCreateDocButton = observer(function WorkspaceCreateDocButton({
  workspaceSlug,
  defaultType = "doc",
}: Props) {
  const navigate = useNavigate();
  const { joinedProjectIds, getProjectById } = useProject();
  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();

  const [currentType, setCurrentType] = useState<TPageType>(defaultType);
  const [projectSearch, setProjectSearch] = useState("");
  const [submittingProjectId, setSubmittingProjectId] = useState<string | null>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLDivElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom-end",
    strategy: "fixed",
    modifiers: [
      { name: "offset", options: { offset: [0, 4] } },
      { name: "preventOverflow", options: { rootBoundary: "viewport" } },
      { name: "flip", options: { rootBoundary: "viewport" } },
    ],
  });

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
  const hasEligibleProjects = eligibleProjects.length > 0;
  const meta = TYPE_META[currentType];

  const waitForCreatedPage = async (projectId: string, pageId: string, retryDelays = PAGE_READY_RETRY_DELAYS_MS) => {
    try {
      await pageService.fetchById(workspaceSlug, projectId, pageId, false);
    } catch {
      const [delay, ...remainingDelays] = retryDelays;
      if (delay === undefined) return;
      await wait(delay);
      await waitForCreatedPage(projectId, pageId, remainingDelays);
    }
  };

  const handleCreate = async (projectId: string) => {
    if (isCreating) return;
    setSubmittingProjectId(projectId);
    const payload: Partial<TPage> = {
      access: currentType === "doc" ? EPageAccess.PRIVATE : EPageAccess.PUBLIC,
      page_type: currentType,
    };
    try {
      const page = await pageService.create(workspaceSlug, projectId, payload);
      if (page?.id) {
        // Avoid opening the editor before the new page is queryable.
        await waitForCreatedPage(projectId, page.id);
        navigate(`/${workspaceSlug}/projects/${projectId}/pages/${page.id}`);
      }
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.error || `${meta.label} could not be created. Please try again.`,
      });
      setSubmittingProjectId(null);
    }
  };

  return (
    <Menu as="div" className="relative">
      <div ref={setReferenceElement} className="flex items-stretch">
        <Menu.Button as={Button} variant="primary" size="lg" loading={isCreating} className="rounded-r-none">
          {isCreating ? "Adding" : `New ${meta.label.toLowerCase()}`}
        </Menu.Button>
        <Menu.Button
          aria-label="Choose type and project"
          className="flex items-center rounded-r-lg bg-[#e548a5] px-1.5 text-white hover:bg-[#d93d9a] active:bg-[#c9368e]"
        >
          <ChevronDown className="size-4" />
        </Menu.Button>
      </div>
      <Menu.Items
        ref={setPopperElement}
        style={styles.popper}
        {...attributes.popper}
        className="fixed z-[60] w-64 rounded-lg border-[0.5px] border-strong bg-surface-1 py-1 shadow-raised-200 outline-none"
      >
        <div className="px-2 pt-1 pb-1.5 text-11 font-medium text-tertiary uppercase">Type</div>
        <div className="flex gap-1 px-2 pb-2">
          {(Object.keys(TYPE_META) as TPageType[]).map((t) => {
            const isActive = t === currentType;
            const { Icon, label } = TYPE_META[t];
            return (
              <button
                key={t}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCurrentType(t);
                }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-lg border border-subtle px-2 py-1 text-11 text-secondary transition-colors hover:bg-layer-1",
                  { "border-strong bg-layer-1 text-primary": isActive }
                )}
              >
                <Icon className="size-3" />
                {label}
              </button>
            );
          })}
        </div>
        <div className="border-t border-subtle" />
        <div className="px-2 pt-2 pb-1.5 text-11 font-medium text-tertiary uppercase">Project</div>
        <div className="px-2 pb-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-subtle bg-canvas px-2 py-1">
            <Search className="size-3 text-tertiary" />
            <input
              type="text"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Search projects"
              className="w-full bg-transparent text-11 text-primary outline-none placeholder:text-placeholder"
            />
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto pb-1">
          {hasEligibleProjects ? (
            eligibleProjects.map((project) => (
              <Menu.Item key={project.id}>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={() => handleCreate(project.id)}
                    disabled={isCreating}
                    className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-12 text-primary", {
                      "bg-layer-1-hover": active,
                      "opacity-50": isCreating,
                    })}
                  >
                    <span className="grid h-4 w-4 flex-shrink-0 place-items-center">
                      <Logo logo={project.logo_props} size={12} />
                    </span>
                    <span className="truncate">{project.name}</span>
                    {submittingProjectId === project.id && (
                      <span className="ml-auto text-11 text-tertiary">Adding…</span>
                    )}
                  </button>
                )}
              </Menu.Item>
            ))
          ) : (
            <p className="px-3 py-2 text-11 text-placeholder italic">
              {projectSearch.trim() ? "No matching projects" : "Join a project to create a page"}
            </p>
          )}
        </div>
      </Menu.Items>
    </Menu>
  );
});

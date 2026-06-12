/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";
import { type FormEvent, type MutableRefObject, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  CalendarDays,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  History,
  Info,
  TextSelect,
  Settings,
  Layers,
  ListTodo,
  Star,
  Search,
  Sparkles,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
} from "@/components/icons/lucide-shim";
import { ChevronRightIcon, CopyIcon, EditIcon, PlusIcon, TrashIcon } from "@plane/propel/icons";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomMenu, EModalPosition, EModalWidth, Input, Loader, ModalCore } from "@plane/ui";
import { cn, copyTextToClipboard, generateWorkItemLink, getPageName } from "@plane/utils";
import { orderBy } from "lodash-es";
import { NotificationsBell } from "@/plane-web/components/navigations/notifications-bell";
// components
import { AppSidebarItem, AppSidebarTooltip } from "@/components/sidebar/sidebar-item";
import { UserMenuRoot } from "@/components/workspace/sidebar/user-menu-root";
import { IssueLayoutIcon } from "@/components/issues/issue-layouts/layout-icon";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { usePowerK } from "@/hooks/store/use-power-k";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useFavorite } from "@/hooks/store/use-favorite";
import { useUserPermissions } from "@/hooks/store/user";
// hooks
import { useAppRailPreferences } from "@/hooks/use-navigation-preferences";
import { useTopBarTheme } from "@/hooks/use-top-bar-theme";
// services
import { WorkspaceService } from "@/services/workspace.service";
// local imports
import { AppSidebarItemsRoot } from "./items-root";
import { generateFavoriteItemLink } from "@/components/workspace/sidebar/favorites/favorite-items/common";
import { WORKSPACE_FAVORITE } from "@/constants/fetch-keys";
import { WorkspaceMenuRoot } from "@/components/workspace/sidebar/workspace-menu-root";
import type {
  IFavorite,
  EIssueLayoutTypes,
  TActivityEntityData,
  TIssueEntityData,
  TLogoProps,
  TPageEntityData,
  TPartialProject,
  TProjectEntityData,
} from "@plane/types";
import { DeleteProjectModal } from "@/components/project/delete-project-modal";

const workspaceService = new WorkspaceService();

type TCompactRailItem = {
  id: string;
  href: string;
  label: string;
  icon: React.JSX.Element;
  isActive: boolean;
};

type TProjectRailItem = TCompactRailItem & {
  briefHref: string;
  pagesHref: string;
  tasksHref: string;
  project: TPartialProject;
};

const MAX_COMPACT_RAIL_ITEMS = 3;
const MAX_RECENT_RAIL_ITEMS = 10;
const RAIL_INLINE_ICON_CLASS = "size-4 flex-shrink-0 text-current";
const COMPRESSED_ICON_CLASS =
  "relative grid size-8 place-items-center rounded-lg text-tertiary t-press hover:bg-layer-transparent-hover hover:text-secondary dark:text-white/60 dark:hover:bg-white/[0.08] dark:hover:text-white/90";
const EXPANDED_ICON_CLASS =
  "group relative flex w-fit max-w-full cursor-pointer items-center justify-start gap-1.5 rounded-lg px-2 py-1 text-13 font-medium leading-5 text-tertiary outline-none t-press dark:text-white/70";
const EXPANDED_ICON_ACTIVE =
  "!bg-white/55 sepia:!bg-[#dbccb3] !text-primary dark:!bg-layer-1 dark:!text-accent-primary";
const EXPANDED_ICON_INACTIVE =
  "text-secondary hover:bg-layer-transparent-hover active:bg-layer-transparent-selected dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white dark:active:bg-white/[0.12]";
const COMPACT_RAIL_ICON_CLASS = "grid size-5 place-items-center [&_svg]:size-5 [&_svg]:text-current";
const EXPANDED_RAIL_ICON_CLASS = "grid size-4 flex-shrink-0 place-items-center [&_svg]:size-4 [&_svg]:text-current";
const RAIL_ICON_ACTIVE = "text-current";
const RAIL_ICON_INACTIVE = "text-icon-tertiary dark:text-white/60";
const RAIL_TREE_LINE_CLASS = "absolute top-0 bottom-1 left-1 w-px bg-[var(--border-color-strong)] dark:bg-white/[0.28]";
const RAIL_LOGO_ICON_SIZE = 14;

const isRouteMatch = (targetPath: string, pathname: string) => {
  const normalizedTargetPath = targetPath.split("?")[0];

  return pathname === normalizedTargetPath || pathname.startsWith(`${normalizedTargetPath}/`);
};

const getFavoriteLayoutRailIcon = (layout: EIssueLayoutTypes | undefined) => {
  if (!layout) return null;

  return <IssueLayoutIcon layout={layout} className={RAIL_INLINE_ICON_CLASS} />;
};

const getFavoriteRailIcon = (favorite: IFavorite, projectLogoProps: TLogoProps | undefined) => {
  if (favorite.entity_type === "view") {
    const layout = favorite.entity_data?.view_layout as EIssueLayoutTypes | undefined;
    return getFavoriteLayoutRailIcon(layout) ?? <ListTodo className={RAIL_INLINE_ICON_CLASS} />;
  }

  switch (favorite.entity_type) {
    case "project": {
      const layout = favorite.entity_data?.view_layout as EIssueLayoutTypes | undefined;
      const iconProps = projectLogoProps ?? favorite.entity_data?.logo_props;

      if (layout) return getFavoriteLayoutRailIcon(layout) ?? <ListTodo className={RAIL_INLINE_ICON_CLASS} />;
      if (iconProps?.in_use) return <Logo logo={iconProps} size={RAIL_LOGO_ICON_SIZE} type="material" />;

      return <Folder className={RAIL_INLINE_ICON_CLASS} />;
    }
    case "page":
      return <FileText className={RAIL_INLINE_ICON_CLASS} />;
    case "cycle":
      return <CalendarDays className={RAIL_INLINE_ICON_CLASS} />;
    case "module":
      return <Layers className={RAIL_INLINE_ICON_CLASS} />;
    default:
      return <Folder className={RAIL_INLINE_ICON_CLASS} />;
  }
};

const getRecentVisitRailIcon = (visit: TActivityEntityData) => {
  switch (visit.entity_name) {
    case "project": {
      const logoProps = (visit.entity_data as TProjectEntityData | undefined)?.logo_props;
      if (logoProps?.in_use) return <Logo logo={logoProps} size={RAIL_LOGO_ICON_SIZE} type="material" />;
      return <Folder className={RAIL_INLINE_ICON_CLASS} />;
    }
    case "page":
    case "workspace_page": {
      const logoProps = (visit.entity_data as TPageEntityData | undefined)?.logo_props;
      if (logoProps?.in_use) return <Logo logo={logoProps} size={RAIL_LOGO_ICON_SIZE} type="lucide" />;
      return <FileText className={RAIL_INLINE_ICON_CLASS} />;
    }
    case "issue":
      return <ListTodo className={RAIL_INLINE_ICON_CLASS} />;
    default:
      return <Folder className={RAIL_INLINE_ICON_CLASS} />;
  }
};

const generateRecentVisitLink = (workspaceSlug: string, visit: TActivityEntityData): string | null => {
  switch (visit.entity_name) {
    case "project":
      return `/${workspaceSlug}/projects/${visit.entity_identifier}/issues`;
    case "page":
    case "workspace_page": {
      const page = visit.entity_data as TPageEntityData | undefined;
      return page?.project_id
        ? `/${workspaceSlug}/projects/${page.project_id}/pages/${visit.entity_identifier}`
        : `/${workspaceSlug}/pages/${visit.entity_identifier}`;
    }
    case "issue": {
      const issue = visit.entity_data as TIssueEntityData | undefined;
      if (!issue) return null;
      return generateWorkItemLink({
        workspaceSlug,
        projectId: issue.project_id,
        issueId: issue.id,
        projectIdentifier: issue.project_identifier,
        sequenceId: issue.sequence_id,
        isEpic: issue.is_epic,
      });
    }
    default:
      return null;
  }
};

const getRecentVisitLabel = (visit: TActivityEntityData) => {
  if (visit.entity_name === "page" || visit.entity_name === "workspace_page")
    return getPageName(visit.entity_data?.name);
  return visit.entity_data?.name ?? "";
};

const CompactRailLink = (props: { item: TCompactRailItem; onActivate?: () => void }) => {
  const { item, onActivate } = props;

  return (
    <AppSidebarTooltip tooltipContent={item.label}>
      <Link
        href={item.href}
        aria-label={item.label}
        onClick={onActivate}
        className={cn(COMPRESSED_ICON_CLASS, {
          "bg-white/55 !text-secondary dark:!bg-layer-1 dark:!text-accent-primary sepia:!bg-[#dbccb3]": item.isActive,
        })}
      >
        <span
          className={cn(COMPACT_RAIL_ICON_CLASS, {
            [RAIL_ICON_ACTIVE]: item.isActive,
            [RAIL_ICON_INACTIVE]: !item.isActive,
          })}
        >
          {item.icon}
        </span>
      </Link>
    </AppSidebarTooltip>
  );
};

const ExpandedCompactRailLink = (props: { item: TCompactRailItem; onActivate?: () => void }) => {
  const { item, onActivate } = props;

  return (
    <AppSidebarTooltip tooltipContent={item.label}>
      <Link
        href={item.href}
        aria-label={item.label}
        onClick={onActivate}
        className={cn(EXPANDED_ICON_CLASS, {
          [EXPANDED_ICON_ACTIVE]: item.isActive,
          [EXPANDED_ICON_INACTIVE]: !item.isActive,
        })}
      >
        <span
          className={cn(EXPANDED_RAIL_ICON_CLASS, {
            [RAIL_ICON_ACTIVE]: item.isActive,
            [RAIL_ICON_INACTIVE]: !item.isActive,
          })}
        >
          {item.icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      </Link>
    </AppSidebarTooltip>
  );
};

const CompactRailOverflowMenu = (props: {
  items: TCompactRailItem[];
  routerPush: (href: string) => void;
  isCompact?: boolean;
  panelDataTheme?: "dark" | "light" | "sepia";
}) => {
  const { items, routerPush, isCompact = true, panelDataTheme } = props;
  if (items.length === 0) return null;

  return (
    <CustomMenu
      customButton={
        isCompact ? (
          <AppSidebarTooltip tooltipContent="More">
            <span className="flex items-center justify-center">
              <MoreHorizontal className={RAIL_INLINE_ICON_CLASS} />
            </span>
          </AppSidebarTooltip>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            <MoreHorizontal className={RAIL_INLINE_ICON_CLASS} />
            <span className="min-w-0 flex-1 truncate">More</span>
          </span>
        )
      }
      customButtonClassName={
        isCompact
          ? cn(COMPRESSED_ICON_CLASS, "cursor-pointer border-none bg-transparent p-0")
          : cn(
              EXPANDED_ICON_CLASS,
              "min-w-0 cursor-pointer border-none bg-transparent outline-none",
              EXPANDED_ICON_INACTIVE
            )
      }
      ariaLabel="More"
      placement="right-start"
      className="p-0"
      optionsClassName="min-w-52 p-1.5"
      panelDataTheme={panelDataTheme}
    >
      {items.map((item) => (
        <CustomMenu.MenuItem key={item.id} onClick={() => routerPush(item.href)} className="rounded-lg">
          <span className="text-sm flex w-full items-center gap-2 px-1.5 py-1 text-left font-medium">
            <span className="grid size-4 place-items-center text-icon-tertiary dark:text-white/60 [&_svg]:size-4 [&_svg]:text-current">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </span>
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
};

const CompactRailItemGroup = (props: {
  primaryItems: TCompactRailItem[];
  overflowItems: TCompactRailItem[];
  onNavigate: (href: string) => void;
  isCompact: boolean;
  panelDataTheme?: "dark" | "light" | "sepia";
  // Fired right before an item navigates (used to suppress project-tree auto-expand).
  onItemActivate?: () => void;
}) => {
  const { primaryItems, overflowItems, onNavigate, isCompact, panelDataTheme, onItemActivate } = props;
  const LinkComponent = isCompact ? CompactRailLink : ExpandedCompactRailLink;

  return (
    <div
      className={cn("flex flex-col", {
        "items-center gap-0.5": isCompact,
        "items-start gap-0.5": !isCompact,
      })}
    >
      {primaryItems.map((item) => (
        <LinkComponent key={item.id} item={item} onActivate={onItemActivate} />
      ))}
      <CompactRailOverflowMenu
        items={overflowItems}
        routerPush={onNavigate}
        isCompact={isCompact}
        panelDataTheme={panelDataTheme}
      />
    </div>
  );
};

const RailItemsSkeleton = (props: { isCompact: boolean }) => {
  const { isCompact } = props;
  const rows = [0, 1, 2];

  if (isCompact) {
    return (
      <Loader className="flex flex-col items-center gap-0.5">
        {rows.map((row) => (
          <Loader.Item key={row} height="2rem" width="2rem" />
        ))}
      </Loader>
    );
  }

  return (
    <Loader className="flex w-full flex-col gap-0.5">
      {rows.map((row) => (
        <div key={row} className="flex items-center gap-1.5 px-2 py-1">
          <Loader.Item height="1rem" width="1rem" />
          <Loader.Item height="0.625rem" width={row === 0 ? "70%" : row === 1 ? "55%" : "45%"} />
        </div>
      ))}
    </Loader>
  );
};

const RailCategory = (props: {
  title: string;
  isExpanded: boolean;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
  action?: React.ReactNode;
  // Optional custom header icon; falls back to the folder open/closed icons.
  icon?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const { title, isExpanded, isOpen, onToggle, action, icon, children, className = "" } = props;

  if (!isExpanded) return <>{children}</>;

  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <div className="group/category flex w-full items-center justify-between gap-1 rounded-lg pr-1 hover:bg-layer-transparent-hover dark:hover:bg-white/[0.08]">
        <AppSidebarTooltip tooltipContent={title}>
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-12 font-medium text-tertiary hover:text-secondary dark:text-white/60 dark:hover:text-white/90"
            aria-label={title}
            aria-expanded={isOpen}
          >
            <span className="flex size-5 flex-shrink-0 items-center justify-center text-icon-tertiary dark:text-white/55 [&_svg]:size-4 [&_svg]:text-current">
              {icon ?? (isOpen ? <FolderOpen /> : <Folder />)}
            </span>
            <span className="min-w-0 flex-1 truncate">{title}</span>
          </button>
        </AppSidebarTooltip>
        {action}
      </div>
      {isOpen && (
        <div className="relative ml-3 flex w-[calc(100%-0.75rem)] flex-col gap-0.5 pl-3">
          <div className={RAIL_TREE_LINE_CLASS} />
          {children}
        </div>
      )}
    </div>
  );
};

const RenameProjectModal = (props: {
  isOpen: boolean;
  projectName: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) => {
  const { isOpen, projectName, isSubmitting, onClose, onSubmit } = props;
  const [name, setName] = useState(projectName);

  useEffect(() => {
    if (isOpen) setName(projectName);
  }, [isOpen, projectName]);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && trimmedName !== projectName && !isSubmitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit(trimmedName);
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.MD}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-16 font-medium text-primary">Rename project</h3>
          <p className="text-13 text-secondary">Update the project name shown in the sidebar.</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="rename-project-name" className="text-13 font-medium text-secondary">
            Project name
          </label>
          <Input
            id="rename-project-name"
            name="projectName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="lg" disabled={!canSubmit} loading={isSubmitting}>
            {isSubmitting ? "Renaming" : "Rename"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
};

const ProjectRailTreeItem = (props: {
  item: TProjectRailItem;
  pathname: string;
  workspaceSlug: string;
  suppressAutoOpenRef: MutableRefObject<boolean>;
}) => {
  const { item, pathname, workspaceSlug, suppressAutoOpenRef } = props;
  const [isOpen, setIsOpen] = useState(item.isActive);
  const [isDeleteProjectModalOpen, setIsDeleteProjectModalOpen] = useState(false);
  const [isRenameProjectModalOpen, setIsRenameProjectModalOpen] = useState(false);
  const [isRenameSubmitting, setIsRenameSubmitting] = useState(false);
  const { updateProject } = useProject();
  const router = useRouter();
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const isBriefActive = isRouteMatch(item.briefHref, pathname);
  const isTasksActive = isRouteMatch(item.tasksHref, pathname);
  const isPagesActive = isRouteMatch(item.pagesHref, pathname);
  const shouldHighlightProject = item.isActive && !isBriefActive && !isTasksActive && !isPagesActive;
  const isProjectAdmin = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    item.id
  );

  const handleCopyProjectId = async () => {
    try {
      await copyTextToClipboard(item.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Project ID copied",
        message: item.id,
      });
    } catch (_err) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't copy project ID",
        message: "Try again in a moment.",
      });
    }
  };

  const handleRenameProject = async (nextName: string) => {
    if (!nextName || nextName === item.label) return;

    try {
      setIsRenameSubmitting(true);
      await updateProject(workspaceSlug, item.id, { name: nextName });
      setIsRenameProjectModalOpen(false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Project renamed",
        message: nextName,
      });
    } catch (_err) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't rename project",
        message: "Try again in a moment.",
      });
    } finally {
      setIsRenameSubmitting(false);
    }
  };

  useEffect(() => {
    // When the user navigates by clicking a favorite, don't auto-expand the
    // project tree that contains the target — they asked to jump straight to
    // the item without revealing where it lives.
    if (item.isActive && !suppressAutoOpenRef.current) setIsOpen(true);
  }, [item.isActive, suppressAutoOpenRef]);

  return (
    <>
      <DeleteProjectModal
        project={item.project}
        isOpen={isDeleteProjectModalOpen}
        onClose={() => setIsDeleteProjectModalOpen(false)}
      />
      <RenameProjectModal
        isOpen={isRenameProjectModalOpen}
        projectName={item.label}
        isSubmitting={isRenameSubmitting}
        onClose={() => setIsRenameProjectModalOpen(false)}
        onSubmit={handleRenameProject}
      />
      <div className="flex w-full flex-col">
        <div
          className={cn(
            "group/project flex w-full items-center gap-1 rounded-lg px-2 py-1 text-secondary hover:bg-layer-transparent-hover dark:text-white/75 dark:hover:bg-white/[0.08]",
            {
              [EXPANDED_ICON_ACTIVE]: shouldHighlightProject,
            }
          )}
        >
          <AppSidebarTooltip tooltipContent={item.label}>
            <button
              type="button"
              onClick={() => setIsOpen((open) => !open)}
              aria-label={item.label}
              aria-expanded={isOpen}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <span
                className={cn(EXPANDED_RAIL_ICON_CLASS, {
                  [RAIL_ICON_ACTIVE]: shouldHighlightProject,
                  [RAIL_ICON_INACTIVE]: !shouldHighlightProject,
                })}
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-13 font-medium">{item.label}</span>
            </button>
          </AppSidebarTooltip>
          <CustomMenu
            customButton={
              <span className="grid place-items-center">
                <MoreHorizontal className="size-4 text-current" />
              </span>
            }
            className="pointer-events-none flex-shrink-0 opacity-0 transition-opacity group-hover/project:pointer-events-auto group-hover/project:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
            customButtonClassName="grid size-5 flex-shrink-0 place-items-center rounded-lg text-icon-tertiary hover:bg-layer-transparent-hover hover:text-icon-secondary dark:text-white/45 dark:hover:bg-white/[0.08] dark:hover:text-white/90"
            placement="bottom-start"
            ariaLabel="Project actions"
            closeOnSelect
          >
            <CustomMenu.MenuItem onClick={() => void handleCopyProjectId()}>
              <span className="flex items-center justify-start gap-2">
                <CopyIcon className="h-3.5 w-3.5 stroke-[1.5]" />
                <span>Copy project ID</span>
              </span>
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem
              onClick={() => {
                router.push(`/${workspaceSlug}/settings/projects/${item.id}`);
              }}
            >
              <span className="flex items-center justify-start gap-2">
                <Settings className="h-3.5 w-3.5 stroke-[1.5]" />
                <span>{t("settings")}</span>
              </span>
            </CustomMenu.MenuItem>
            {isProjectAdmin && (
              <CustomMenu.MenuItem onClick={() => setIsRenameProjectModalOpen(true)}>
                <span className="flex items-center justify-start gap-2">
                  <EditIcon className="h-3.5 w-3.5 stroke-[1.5]" />
                  <span>Rename</span>
                </span>
              </CustomMenu.MenuItem>
            )}
            {isProjectAdmin && (
              <CustomMenu.MenuItem onClick={() => setIsDeleteProjectModalOpen(true)}>
                <span className="flex items-center justify-start gap-2 text-danger-primary">
                  <TrashIcon className="h-3.5 w-3.5 stroke-[1.5]" />
                  <span>Delete</span>
                </span>
              </CustomMenu.MenuItem>
            )}
          </CustomMenu>
          <AppSidebarTooltip tooltipContent={isOpen ? "Collapse project" : "Expand project"}>
            <button
              type="button"
              onClick={() => setIsOpen((open) => !open)}
              className={cn(
                "grid size-5 flex-shrink-0 place-items-center rounded-lg text-icon-tertiary opacity-0 group-hover/project:opacity-100 hover:bg-layer-transparent-hover hover:text-icon-secondary focus:opacity-100 dark:text-white/45 dark:hover:bg-white/[0.08] dark:hover:text-white/90",
                {
                  "opacity-100": isOpen,
                }
              )}
              aria-label={isOpen ? "Collapse project" : "Expand project"}
              aria-expanded={isOpen}
            >
              <ChevronRightIcon
                className={cn("size-4 text-current transition-transform", {
                  "rotate-90": isOpen,
                })}
              />
            </button>
          </AppSidebarTooltip>
        </div>
        {isOpen && (
          <div className="relative mt-0.5 mb-1 ml-4 flex flex-col gap-0.5 pl-3">
            <div className={RAIL_TREE_LINE_CLASS} />
            <AppSidebarTooltip tooltipContent={`${item.label} Brief`}>
              <Link
                href={item.briefHref}
                aria-label={`${item.label} Brief`}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2 py-1 text-12 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary dark:text-white/60 dark:hover:bg-white/[0.08] dark:hover:text-white/90",
                  {
                    "bg-white/55 !text-secondary dark:!bg-layer-1 dark:!text-accent-primary sepia:!bg-[#dbccb3]":
                      isBriefActive,
                  }
                )}
              >
                <TextSelect className={RAIL_INLINE_ICON_CLASS} />
                <span className="truncate">Brief</span>
              </Link>
            </AppSidebarTooltip>
            <AppSidebarTooltip tooltipContent={`${item.label} Tasks`}>
              <Link
                href={item.tasksHref}
                aria-label={`${item.label} Tasks`}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2 py-1 text-12 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary dark:text-white/60 dark:hover:bg-white/[0.08] dark:hover:text-white/90",
                  {
                    "bg-white/55 !text-secondary dark:!bg-layer-1 dark:!text-accent-primary sepia:!bg-[#dbccb3]":
                      isTasksActive,
                  }
                )}
              >
                <ListTodo className={RAIL_INLINE_ICON_CLASS} />
                <span className="truncate">Tasks</span>
              </Link>
            </AppSidebarTooltip>
            <AppSidebarTooltip tooltipContent={`${item.label} Pages`}>
              <Link
                href={item.pagesHref}
                aria-label={`${item.label} Pages`}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2 py-1 text-12 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary dark:text-white/60 dark:hover:bg-white/[0.08] dark:hover:text-white/90",
                  {
                    "bg-white/55 !text-secondary dark:!bg-layer-1 dark:!text-accent-primary sepia:!bg-[#dbccb3]":
                      isPagesActive,
                  }
                )}
              >
                <FileText className={RAIL_INLINE_ICON_CLASS} />
                <span className="truncate">Docs</span>
              </Link>
            </AppSidebarTooltip>
          </div>
        )}
      </div>
    </>
  );
};

const ProjectRailTree = (props: {
  projects: TProjectRailItem[];
  pathname: string;
  workspaceSlug: string;
  suppressAutoOpenRef: MutableRefObject<boolean>;
}) => {
  const { projects, pathname, workspaceSlug, suppressAutoOpenRef } = props;

  return (
    <div className="flex w-full flex-col gap-0.5">
      {projects.map((project) => (
        <ProjectRailTreeItem
          key={project.id}
          item={project}
          pathname={pathname}
          workspaceSlug={workspaceSlug}
          suppressAutoOpenRef={suppressAutoOpenRef}
        />
      ))}
    </div>
  );
};

const AppleIcon = () => (
  <svg fill="currentColor" role="img" viewBox="0 0 24 24" aria-label="Apple">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
);

const ChromeWebStoreIcon = () => (
  <svg fill="currentColor" role="img" viewBox="0 0 24 24" aria-label="Chrome Web Store">
    <path d="M0 1.637v19.09c0 .9.736 1.636 1.636 1.636h.131a10.4 10.4 0 0 1-.13-1.636 10.3 10.3 0 0 1 1.667-5.64l4.202 7.276h1.128A3.77 3.77 0 0 1 12 16.958a3.77 3.77 0 0 1 3.366 5.406h1.048a4.7 4.7 0 0 0-1.587-5.406h6.83a10.34 10.34 0 0 1 .577 5.406h.13c.9 0 1.636-.737 1.636-1.637V1.637Zm9.273 2.181h5.454a1.09 1.09 0 1 1 0 2.182H9.273a1.09 1.09 0 1 1 0-2.182M12 10.364a10.36 10.36 0 0 1 9.233 5.652H12a4.71 4.71 0 0 0-4.677 4.149L3.91 14.25A10.34 10.34 0 0 1 12 10.364" />
  </svg>
);

// Distribution links for the downloadable clients. The Mac build is self-served
// as a static asset from apps/web/public/downloads (so it downloads directly,
// no external host needed). Swap ATLAS_MAC_DOWNLOAD_URL for a CDN URL once one
// is provisioned, and update the extension link once it's on the Chrome Web Store.
const ATLAS_MAC_DOWNLOAD_URL = "/downloads/DragonFruit-Atlas.dmg";
const CHROME_EXTENSION_URL = "https://chromewebstore.google.com/";

const DOWNLOAD_APPS: {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.JSX.Element;
  cta: string;
  ctaIcon: React.JSX.Element;
  variant: "primary" | "secondary";
  steps: string[];
  // When set, the link is fetched as a same-origin download with this filename
  // (forces a save dialog instead of opening a tab). Omit for external links.
  download?: string;
  // Temporary beta caveat — remove once the Mac build is notarized.
  note?: string;
}[] = [
  {
    id: "atlas-mac",
    title: "Atlas for Mac",
    description: "Voice, dictation, and meeting notes from your menu bar.",
    href: ATLAS_MAC_DOWNLOAD_URL,
    download: "DragonFruit Atlas.dmg",
    icon: <AppleIcon />,
    cta: "Download",
    ctaIcon: <Download />,
    variant: "primary",
    note: "Beta build isn't notarized yet, so macOS blocks the first open. Allow it in System Settings → Privacy & Security → Open Anyway.",
    steps: [
      "Open the download and drag Atlas into Applications.",
      "Grant Accessibility, Microphone, and Screen Recording when prompted.",
      "Press ⌥Space to capture a voice action, or ⌥⇧Space to dictate.",
    ],
  },
  {
    id: "chrome-extension",
    title: "Chrome extension",
    description: "Save pages, images, and tweets straight to DragonFruit.",
    href: CHROME_EXTENSION_URL,
    icon: <ChromeWebStoreIcon />,
    cta: "Get extension",
    ctaIcon: <ExternalLink />,
    variant: "secondary",
    steps: [
      "Add it from the Chrome Web Store and pin it to your toolbar.",
      "Sign in, then choose a workspace and project.",
      "Click the icon to save a page, or right-click an image to save it.",
    ],
  },
];

const DownloadAppsModal = (props: { isOpen: boolean; onClose: () => void }) => {
  const { isOpen, onClose } = props;

  const openApp = (app: (typeof DOWNLOAD_APPS)[number]) => {
    if (app.download) {
      // Same-origin asset: trigger a direct download instead of opening a tab.
      const link = document.createElement("a");
      link.href = app.href;
      link.download = app.download;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else {
      window.open(app.href, "_blank", "noopener,noreferrer");
    }
    onClose();
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.LG}
      className="overflow-hidden"
    >
      <div className="flex flex-col">
        {/* Banner that dissolves into the modal surface */}
        <div className="relative h-48 w-full shrink-0 bg-layer-1">
          <img
            src="/images/download-apps-header.jpg"
            alt=""
            className="size-full object-cover object-center"
            loading="lazy"
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-surface-1 to-transparent"
          />
        </div>
        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-16 font-medium text-primary">Download apps</h3>
            <p className="text-13 text-secondary">Use DragonFruit on your desktop and in your browser.</p>
          </div>
          <div className="flex flex-col gap-3">
            {DOWNLOAD_APPS.map((app) => (
              <div key={app.id} className="flex flex-col gap-3 rounded-lg border border-subtle bg-layer-1 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 flex-shrink-0 place-items-center rounded-lg bg-layer-transparent-hover text-[color:var(--download-app-icon-color)] [&_svg]:size-4">
                    {app.icon}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-13 font-medium text-primary">{app.title}</span>
                    <span className="text-12 text-tertiary">{app.description}</span>
                  </div>
                  <Button
                    variant={app.variant}
                    size="lg"
                    prependIcon={app.ctaIcon}
                    onClick={() => openApp(app)}
                    className="flex-shrink-0"
                  >
                    {app.cta}
                  </Button>
                </div>
                {app.note && (
                  <div className="flex items-start gap-2 rounded-lg bg-layer-transparent-hover px-3 py-2.5 text-12 text-secondary">
                    <span className="mt-px flex-shrink-0 text-tertiary [&_svg]:size-3.5">
                      <Info />
                    </span>
                    <span className="flex-1">{app.note}</span>
                  </div>
                )}
                <ol className="flex flex-col gap-2 border-t border-subtle pt-3">
                  {app.steps.map((step, index) => (
                    <li key={step} className="flex items-start gap-2 text-12 text-secondary">
                      <span className="mt-px grid size-4 flex-shrink-0 place-items-center rounded-full bg-layer-transparent-hover text-11 font-medium text-tertiary">
                        {index + 1}
                      </span>
                      <span className="flex-1">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalCore>
  );
};

export const AppRailRoot = observer((props: { isMobile?: boolean }) => {
  const { isMobile = false } = props;
  // router
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const router = useRouter();
  // preferences
  const { preferences, updateDisplayMode } = useAppRailPreferences();
  const { agentChatOpen, toggleAgentChat } = useAppTheme();
  const { togglePowerKModal } = usePowerK();
  const { toggleCreateIssueModal, toggleCreateProjectModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();
  const { joinedProjectIds, getPartialProjectById } = useProject();
  const { groupedFavorites } = useFavorite();
  const { t } = useTranslation();
  const surfaceTheme = useTopBarTheme();
  const [isFavoritesCategoryOpen, setIsFavoritesCategoryOpen] = useState(true);
  const [isRecentsCategoryOpen, setIsRecentsCategoryOpen] = useState(true);
  const [isProjectsCategoryOpen, setIsProjectsCategoryOpen] = useState(true);
  const [isDownloadAppsModalOpen, setIsDownloadAppsModalOpen] = useState(false);
  // derived values
  // In the mobile drawer the rail always shows labels and fills the panel.
  const isRailExpanded = isMobile || preferences.displayMode === "icon_with_label";
  const showRailLabels = isRailExpanded;
  const railWidth = isMobile ? "100%" : isRailExpanded ? "14.5rem" : "3.25rem";
  const slug = workspaceSlug?.toString() ?? "";
  // Subscribe (without a fetcher) to the shared favorites request kicked off by the
  // workspace wrapper, so the rail can show a skeleton while favorites load instead
  // of a placeholder item that looks like a real favorite.
  const { isLoading: isFavoritesLoading } = useSWR(slug ? WORKSPACE_FAVORITE(slug) : null);
  // Recent visits are tracked server-side (UserRecentVisit) whenever the user opens
  // a project, work item, or page. The key matches the home "Recents" widget so the
  // two surfaces share one SWR cache entry.
  const {
    data: recentVisits,
    isLoading: isRecentsLoading,
    mutate: mutateRecents,
  } = useSWR(
    slug ? `WORKSPACE_RECENT_ACTIVITY_${slug}_all item` : null,
    slug ? () => workspaceService.fetchWorkspaceRecents(slug) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  const canCreateIssue = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const canCreateProject = canCreateIssue;
  const isCreateTaskDisabled = joinedProjectIds.length === 0 || !canCreateIssue;
  const projects = joinedProjectIds
    .map((id) => getPartialProjectById(id))
    .filter((project): project is NonNullable<ReturnType<typeof getPartialProjectById>> => !!project)
    .map((project) => {
      const tasksHref = `/${slug}/projects/${project.id}/issues/?layout=list`;
      const pagesHref = `/${slug}/projects/${project.id}/pages`;
      const briefHref = `/${slug}/projects/${project.id}/brief`;
      return {
        id: project.id,
        href: tasksHref,
        briefHref,
        tasksHref,
        pagesHref,
        project,
        label: project.name,
        icon: <Logo logo={project.logo_props} size={RAIL_LOGO_ICON_SIZE} type="material" />,
        isActive: pathname.includes(`/${slug}/projects/${project.id}`),
      };
    }) satisfies TProjectRailItem[];
  const rootFavorites = orderBy(
    Object.values(groupedFavorites).filter((favorite): favorite is IFavorite => !favorite.parent),
    "sequence",
    "desc"
  ) as IFavorite[];
  const favorites = rootFavorites.map((favorite) => {
    const project = favorite.project_id ? getPartialProjectById(favorite.project_id) : undefined;
    const href = generateFavoriteItemLink(slug, favorite);
    return {
      id: favorite.id,
      href,
      label: favorite.entity_data?.name || favorite.name,
      icon: getFavoriteRailIcon(favorite, project?.logo_props),
      isActive: isRouteMatch(href, pathname),
    };
  });
  const favoriteItemsForRail =
    favorites.length > 0
      ? favorites
      : [
          {
            id: "favorites-empty-state",
            href: `/${slug}/favorites`,
            label: t("favorites"),
            icon: <Star className={RAIL_INLINE_ICON_CLASS} />,
            isActive: isRouteMatch(`/${slug}/favorites`, pathname),
          },
        ];

  const recentItems = orderBy(
    (recentVisits ?? []).filter((visit) => !!visit.entity_data),
    "visited_at",
    "desc"
  )
    .map((visit) => {
      const href = generateRecentVisitLink(slug, visit);
      if (!href) return null;
      return {
        id: visit.id,
        href,
        label: getRecentVisitLabel(visit),
        icon: getRecentVisitRailIcon(visit),
        isActive: isRouteMatch(href, pathname),
      };
    })
    .filter((item): item is TCompactRailItem => !!item)
    .slice(0, MAX_RECENT_RAIL_ITEMS);

  const handleCreateTask = () => {
    if (!isCreateTaskDisabled) {
      toggleCreateIssueModal(true);
    }
  };
  // Set when navigation is triggered by clicking a favorite so the project tree
  // doesn't auto-expand to reveal where the target lives. Children read it in
  // their auto-open effect; we clear it after each navigation settles.
  const suppressAutoOpenRef = useRef(false);
  useEffect(() => {
    suppressAutoOpenRef.current = false;
  }, [pathname]);
  // Refresh recents after each in-app navigation so the section tracks the
  // latest visits. The backend records a visit asynchronously when the entity
  // is fetched, so wait a beat before revalidating.
  useEffect(() => {
    if (!slug) return;
    const timeout = setTimeout(() => void mutateRecents(), 1500);
    return () => clearTimeout(timeout);
  }, [pathname, slug, mutateRecents]);
  const handleFavoriteNavigation = (href: string) => {
    suppressAutoOpenRef.current = true;
    router.push(href);
  };
  return (
    <div
      data-theme={surfaceTheme}
      className={cn(
        "z-[26] h-full flex-shrink-0 overflow-hidden rounded-[18px] transition-[width] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        "bg-gray-200 shadow-sm text-secondary dark:bg-[oklch(0.17_0.01_0)] dark:text-white/75",
        // Drawer mode: flush left edge, fill the panel, no width animation.
        isMobile && "rounded-l-none transition-none"
      )}
      style={{
        width: railWidth,
        display: "block",
      }}
    >
      <div className="flex h-full flex-col px-2 py-3">
        <div
          className={cn("relative z-10 flex-shrink-0", {
            "flex flex-col items-start gap-2": isRailExpanded,
            "flex flex-col items-center gap-2": !isRailExpanded,
          })}
        >
          <div
            className={cn({
              "flex w-full flex-col items-start gap-0.5": isRailExpanded,
              "flex flex-col items-center gap-0.5": !isRailExpanded,
            })}
          >
            {!isMobile && (
              <AppSidebarTooltip tooltipContent={isRailExpanded ? "Collapse rail" : "Expand rail"}>
                <button
                  type="button"
                  onClick={() => {
                    updateDisplayMode(isRailExpanded ? "icon_only" : "icon_with_label");
                  }}
                  className="grid size-8 place-items-center rounded-lg text-icon-tertiary hover:bg-layer-transparent-hover hover:text-icon-secondary dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white/90 [&_svg]:size-5 [&_svg]:text-current"
                  aria-label={isRailExpanded ? "Collapse app rail" : "Expand app rail"}
                >
                  {isRailExpanded ? <PanelLeft /> : <PanelRight />}
                </button>
              </AppSidebarTooltip>
            )}
            <WorkspaceMenuRoot variant="sidebar" showLabel={isRailExpanded} />
            <AppSidebarItem
              variant="button"
              item={{
                label: t("sidebar.new_work_item"),
                icon: <PlusIcon />,
                onClick: handleCreateTask,
                disabled: isCreateTaskDisabled,
                isInline: isRailExpanded,
                showLabel: showRailLabels,
              }}
            />
          </div>
        </div>
        <div
          className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto pt-3 pb-[22px]", {
            "flex flex-col items-start gap-1.5": isRailExpanded,
            "flex flex-col items-center gap-1.5": !isRailExpanded,
          })}
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, black 22px, black calc(100% - 22px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, black 22px, black calc(100% - 22px), transparent 100%)",
          }}
        >
          <div
            className={cn({
              "flex w-full flex-col items-start gap-1.5": isRailExpanded,
              "flex flex-col items-center gap-1.5": !isRailExpanded,
            })}
          >
            <div
              className={cn({
                "flex w-full flex-col items-start gap-1": isRailExpanded,
                "flex flex-col items-center gap-1": !isRailExpanded,
              })}
            >
              <AppSidebarItemsRoot showLabel={showRailLabels} isInline={isRailExpanded} />
            </div>
            <RailCategory
              title="Favs"
              icon={<Star />}
              isExpanded={isRailExpanded}
              isOpen={isFavoritesCategoryOpen}
              onToggle={() => setIsFavoritesCategoryOpen((isOpen) => !isOpen)}
            >
              {isFavoritesLoading && favorites.length === 0 ? (
                <RailItemsSkeleton isCompact={!isRailExpanded} />
              ) : (
                <CompactRailItemGroup
                  primaryItems={favoriteItemsForRail.slice(0, MAX_COMPACT_RAIL_ITEMS)}
                  overflowItems={favoriteItemsForRail.slice(MAX_COMPACT_RAIL_ITEMS)}
                  isCompact={!isRailExpanded}
                  onNavigate={handleFavoriteNavigation}
                  onItemActivate={() => {
                    suppressAutoOpenRef.current = true;
                  }}
                  panelDataTheme={surfaceTheme}
                />
              )}
            </RailCategory>
            {(isRecentsLoading || recentItems.length > 0) && (
              <RailCategory
                title="Recents"
                icon={<History />}
                isExpanded={isRailExpanded}
                isOpen={isRecentsCategoryOpen}
                onToggle={() => setIsRecentsCategoryOpen((isOpen) => !isOpen)}
              >
                {isRecentsLoading && recentItems.length === 0 ? (
                  <RailItemsSkeleton isCompact={!isRailExpanded} />
                ) : (
                  <CompactRailItemGroup
                    primaryItems={recentItems.slice(0, MAX_COMPACT_RAIL_ITEMS)}
                    overflowItems={recentItems.slice(MAX_COMPACT_RAIL_ITEMS)}
                    isCompact={!isRailExpanded}
                    onNavigate={handleFavoriteNavigation}
                    onItemActivate={() => {
                      suppressAutoOpenRef.current = true;
                    }}
                    panelDataTheme={surfaceTheme}
                  />
                )}
              </RailCategory>
            )}
            <RailCategory
              title="Projects"
              isExpanded={isRailExpanded}
              isOpen={isProjectsCategoryOpen}
              onToggle={() => setIsProjectsCategoryOpen((isOpen) => !isOpen)}
              className="mt-[-4px]"
              action={
                canCreateProject ? (
                  <AppSidebarTooltip tooltipContent={t("create_project")}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleCreateProjectModal(true);
                      }}
                      className="grid size-5 flex-shrink-0 place-items-center rounded-lg text-icon-tertiary opacity-0 transition-opacity group-hover/category:opacity-100 hover:bg-layer-transparent-hover hover:text-icon-secondary focus:opacity-100 dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white/90 [&_svg]:size-3.5 [&_svg]:text-current"
                      aria-label={t("aria_labels.projects_sidebar.create_new_project")}
                    >
                      <PlusIcon />
                    </button>
                  </AppSidebarTooltip>
                ) : null
              }
            >
              {isRailExpanded ? (
                <ProjectRailTree
                  projects={projects}
                  pathname={pathname}
                  workspaceSlug={slug}
                  suppressAutoOpenRef={suppressAutoOpenRef}
                />
              ) : (
                <CompactRailItemGroup
                  primaryItems={projects.slice(0, MAX_COMPACT_RAIL_ITEMS)}
                  overflowItems={projects.slice(MAX_COMPACT_RAIL_ITEMS)}
                  isCompact
                  onNavigate={handleFavoriteNavigation}
                  panelDataTheme={surfaceTheme}
                />
              )}
            </RailCategory>
          </div>
        </div>
        <div
          className={cn("relative z-10 flex-shrink-0", {
            "flex flex-col items-center gap-1 pt-2": !isRailExpanded,
            "flex w-full flex-col items-start gap-1 pt-3": isRailExpanded,
          })}
        >
          <AppSidebarItem
            variant="button"
            item={{
              label: "Search",
              icon: <Search />,
              onClick: () => togglePowerKModal(true),
              isInline: isRailExpanded,
              showLabel: showRailLabels,
            }}
          />
          <AppSidebarItem
            variant="button"
            item={{
              label: "Ask Atlas",
              icon: <Sparkles />,
              isActive: agentChatOpen,
              onClick: () => toggleAgentChat(),
              isInline: isRailExpanded,
              showLabel: showRailLabels,
            }}
          />
          <AppSidebarItem
            variant="button"
            item={{
              label: "Download Apps",
              icon: <Download />,
              onClick: () => setIsDownloadAppsModalOpen(true),
              isInline: isRailExpanded,
              showLabel: showRailLabels,
            }}
          />
          <NotificationsBell showLabel={showRailLabels} isInline={isRailExpanded} />
          <UserMenuRoot showLabel={showRailLabels} isInline={isRailExpanded} />
        </div>
      </div>
      <DownloadAppsModal isOpen={isDownloadAppsModalOpen} onClose={() => setIsDownloadAppsModalOpen(false)} />
    </div>
  );
});

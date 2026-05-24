/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";
import { useState } from "react";
import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Layers,
  ListTodo,
  Star,
  Search,
  Sparkles,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
} from "@/components/icons/lucide-shim";
import { ChevronRightIcon, PlusIcon } from "@plane/propel/icons";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
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
// local imports
import { AppSidebarItemsRoot } from "./items-root";
import { generateFavoriteItemLink } from "@/components/workspace/sidebar/favorites/favorite-items/common";
import { WorkspaceMenuRoot } from "@/components/workspace/sidebar/workspace-menu-root";
import type { IFavorite, EIssueLayoutTypes, TLogoProps } from "@plane/types";

type TCompactRailItem = {
  id: string;
  href: string;
  label: string;
  icon: React.JSX.Element;
  isActive: boolean;
};

type TProjectRailItem = TCompactRailItem & {
  pagesHref: string;
  tasksHref: string;
};

const MAX_COMPACT_RAIL_ITEMS = 3;
const RAIL_INLINE_ICON_CLASS = "size-4 flex-shrink-0 text-current";
const COMPRESSED_ICON_CLASS =
  "relative grid size-8 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-secondary dark:text-white/60 dark:hover:bg-white/[0.08] dark:hover:text-white/90";
const EXPANDED_ICON_CLASS =
  "group relative flex w-fit max-w-full cursor-pointer items-center justify-start gap-1.5 rounded-md px-2 py-1 text-13 font-medium leading-5 text-tertiary outline-none transition-colors dark:text-white/70";
const EXPANDED_ICON_ACTIVE = "!bg-white/55 !text-primary dark:!bg-layer-1 dark:!text-accent-primary";
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

const CompactRailLink = (props: { item: TCompactRailItem }) => {
  const { item } = props;

  return (
    <AppSidebarTooltip tooltipContent={item.label}>
      <Link
        href={item.href}
        aria-label={item.label}
        className={cn(COMPRESSED_ICON_CLASS, {
          "bg-white/55 !text-secondary dark:!bg-layer-1 dark:!text-accent-primary": item.isActive,
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

const ExpandedCompactRailLink = (props: { item: TCompactRailItem }) => {
  const { item } = props;

  return (
    <AppSidebarTooltip tooltipContent={item.label}>
      <Link
        href={item.href}
        aria-label={item.label}
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
  panelDataTheme?: "dark" | "light";
}) => {
  const { items, routerPush, isCompact = true, panelDataTheme } = props;
  if (items.length === 0) return null;

  return (
    <CustomMenu
      customButton={
        isCompact ? (
          <AppSidebarTooltip tooltipContent="More">
            <button
              type="button"
              aria-label="More"
              className={cn(COMPRESSED_ICON_CLASS, "cursor-pointer border-none bg-transparent p-0")}
            >
              <MoreHorizontal className={RAIL_INLINE_ICON_CLASS} />
            </button>
          </AppSidebarTooltip>
        ) : (
          <button
            type="button"
            className={cn(
              EXPANDED_ICON_CLASS,
              "min-w-0 cursor-pointer border-none bg-transparent outline-none",
              EXPANDED_ICON_INACTIVE
            )}
          >
            <MoreHorizontal className={RAIL_INLINE_ICON_CLASS} />
            <span className="min-w-0 flex-1 truncate">More</span>
          </button>
        )
      }
      placement="right-start"
      className="p-0"
      optionsClassName="min-w-52 p-1.5"
      panelDataTheme={panelDataTheme}
    >
      {items.map((item) => (
        <CustomMenu.MenuItem key={item.id} onClick={() => routerPush(item.href)} className="rounded-sm">
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
  panelDataTheme?: "dark" | "light";
}) => {
  const { primaryItems, overflowItems, onNavigate, isCompact, panelDataTheme } = props;
  const LinkComponent = isCompact ? CompactRailLink : ExpandedCompactRailLink;

  return (
    <div
      className={cn("flex flex-col", {
        "items-center gap-1": isCompact,
        "items-start gap-0.5": !isCompact,
      })}
    >
      {primaryItems.map((item) => (
        <LinkComponent key={item.id} item={item} />
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

const RailCategory = (props: {
  title: string;
  isExpanded: boolean;
  isOpen: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const { title, isExpanded, isOpen, onToggle, action, children } = props;

  if (!isExpanded) return <>{children}</>;

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="group/category flex w-full items-center justify-between gap-1 rounded-md pr-1 hover:bg-layer-transparent-hover dark:hover:bg-white/[0.08]">
        <AppSidebarTooltip tooltipContent={title}>
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-12 font-medium text-tertiary hover:text-secondary dark:text-white/60 dark:hover:text-white/90"
            aria-label={title}
            aria-expanded={isOpen}
          >
            <span className="flex size-5 flex-shrink-0 items-center justify-center text-icon-tertiary dark:text-white/55 [&_svg]:size-4 [&_svg]:text-current">
              {isOpen ? <FolderOpen /> : <Folder />}
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

const ProjectRailTreeItem = (props: { item: TProjectRailItem; pathname: string }) => {
  const { item, pathname } = props;
  const [isOpen, setIsOpen] = useState(item.isActive);
  const isTasksActive = isRouteMatch(item.tasksHref, pathname);
  const isPagesActive = isRouteMatch(item.pagesHref, pathname);
  const shouldHighlightProject = item.isActive && !isTasksActive && !isPagesActive;

  return (
    <div className="flex w-full flex-col">
      <div
        className={cn(
          "group/project flex w-full items-center gap-1 rounded-md px-2 py-1 text-secondary hover:bg-layer-transparent-hover dark:text-white/75 dark:hover:bg-white/[0.08]",
          {
            [EXPANDED_ICON_ACTIVE]: shouldHighlightProject,
          }
        )}
      >
        <AppSidebarTooltip tooltipContent={item.label}>
          <Link href={item.href} aria-label={item.label} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(EXPANDED_RAIL_ICON_CLASS, {
                [RAIL_ICON_ACTIVE]: shouldHighlightProject,
                [RAIL_ICON_INACTIVE]: !shouldHighlightProject,
              })}
            >
              {item.icon}
            </span>
            <span className="min-w-0 flex-1 truncate text-13 font-medium">{item.label}</span>
          </Link>
        </AppSidebarTooltip>
        <AppSidebarTooltip tooltipContent={isOpen ? "Collapse project" : "Expand project"}>
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            className={cn(
              "grid size-5 flex-shrink-0 place-items-center rounded-md text-icon-tertiary opacity-0 group-hover/project:opacity-100 hover:bg-layer-transparent-hover hover:text-icon-secondary focus:opacity-100 dark:text-white/45 dark:hover:bg-white/[0.08] dark:hover:text-white/90",
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
          <AppSidebarTooltip tooltipContent={`${item.label} Tasks`}>
            <Link
              href={item.tasksHref}
              aria-label={`${item.label} Tasks`}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-12 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary dark:text-white/60 dark:hover:bg-white/[0.08] dark:hover:text-white/90",
                {
                  "bg-white/55 !text-secondary dark:!bg-layer-1 dark:!text-accent-primary": isTasksActive,
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
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-12 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary dark:text-white/60 dark:hover:bg-white/[0.08] dark:hover:text-white/90",
                {
                  "bg-white/55 !text-secondary dark:!bg-layer-1 dark:!text-accent-primary": isPagesActive,
                }
              )}
            >
              <FileText className={RAIL_INLINE_ICON_CLASS} />
              <span className="truncate">Pages</span>
            </Link>
          </AppSidebarTooltip>
        </div>
      )}
    </div>
  );
};

const ProjectRailTree = (props: { projects: TProjectRailItem[]; pathname: string }) => {
  const { projects, pathname } = props;

  return (
    <div className="flex w-full flex-col gap-0.5">
      {projects.map((project) => (
        <ProjectRailTreeItem key={project.id} item={project} pathname={pathname} />
      ))}
    </div>
  );
};

export const AppRailRoot = observer(() => {
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
  const [isProjectsCategoryOpen, setIsProjectsCategoryOpen] = useState(true);
  // derived values
  const isRailExpanded = preferences.displayMode === "icon_with_label";
  const showRailLabels = isRailExpanded;
  const railWidth = isRailExpanded ? "14.5rem" : "3.25rem";
  const slug = workspaceSlug?.toString() ?? "";
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
      return {
        id: project.id,
        href: tasksHref,
        tasksHref,
        pagesHref,
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

  const handleCreateTask = () => {
    if (!isCreateTaskDisabled) {
      toggleCreateIssueModal(true);
    }
  };
  const handleFavoriteNavigation = (href: string) => {
    router.push(href);
  };
  return (
    <div
      data-theme={surfaceTheme}
      className={cn(
        "z-[26] h-full flex-shrink-0 overflow-hidden rounded-[18px] transition-all duration-300 ease-in-out",
        "bg-gray-200 shadow-sm text-secondary dark:bg-[#09090a] dark:text-white/75"
      )}
      style={{
        width: railWidth,
        display: "block",
      }}
    >
      <div className="flex h-full flex-col justify-between gap-3 px-2 py-3">
        <div
          className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto", {
            "flex flex-col items-start gap-4": isRailExpanded,
            "flex flex-col items-center gap-4": !isRailExpanded,
          })}
        >
          <div
            className={cn({
              "flex w-full flex-col items-start gap-1": isRailExpanded,
              "flex flex-col items-center gap-1": !isRailExpanded,
            })}
          >
            <AppSidebarTooltip tooltipContent={isRailExpanded ? "Collapse rail" : "Expand rail"}>
              <button
                type="button"
                onClick={() => {
                  updateDisplayMode(isRailExpanded ? "icon_only" : "icon_with_label");
                }}
                className="grid size-8 place-items-center rounded-md text-icon-tertiary hover:bg-layer-transparent-hover hover:text-icon-secondary dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white/90 [&_svg]:size-5 [&_svg]:text-current"
                aria-label={isRailExpanded ? "Collapse app rail" : "Expand app rail"}
              >
                {isRailExpanded ? <PanelLeft /> : <PanelRight />}
              </button>
            </AppSidebarTooltip>
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
          <div
            className={cn({
              "flex w-full flex-col items-start gap-3": isRailExpanded,
              "flex flex-col items-center gap-3": !isRailExpanded,
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
              isExpanded={isRailExpanded}
              isOpen={isFavoritesCategoryOpen}
              onToggle={() => setIsFavoritesCategoryOpen((isOpen) => !isOpen)}
            >
              <CompactRailItemGroup
                primaryItems={favoriteItemsForRail.slice(0, MAX_COMPACT_RAIL_ITEMS)}
                overflowItems={favoriteItemsForRail.slice(MAX_COMPACT_RAIL_ITEMS)}
                isCompact={!isRailExpanded}
                onNavigate={handleFavoriteNavigation}
                panelDataTheme={surfaceTheme}
              />
            </RailCategory>
            <RailCategory
              title="Projects"
              isExpanded={isRailExpanded}
              isOpen={isProjectsCategoryOpen}
              onToggle={() => setIsProjectsCategoryOpen((isOpen) => !isOpen)}
              action={
                canCreateProject ? (
                  <AppSidebarTooltip tooltipContent={t("create_project")}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleCreateProjectModal(true);
                      }}
                      className="grid size-5 flex-shrink-0 place-items-center rounded-md text-icon-tertiary opacity-0 transition-opacity group-hover/category:opacity-100 hover:bg-layer-transparent-hover hover:text-icon-secondary focus:opacity-100 dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white/90 [&_svg]:size-3.5 [&_svg]:text-current"
                      aria-label={t("aria_labels.projects_sidebar.create_new_project")}
                    >
                      <PlusIcon />
                    </button>
                  </AppSidebarTooltip>
                ) : null
              }
            >
              {isRailExpanded ? (
                <ProjectRailTree projects={projects} pathname={pathname} />
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
          className={cn({
            "flex flex-col items-center gap-1 pt-2": !isRailExpanded,
            "flex w-full flex-col items-start gap-1 border-t border-subtle pt-3": isRailExpanded,
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
              label: "Ask Copilot",
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
              label: "Get Copilot",
              icon: <Download />,
              isInline: isRailExpanded,
              showLabel: showRailLabels,
            }}
          />
          <NotificationsBell showLabel={showRailLabels} isInline={isRailExpanded} />
          <UserMenuRoot showLabel={showRailLabels} isInline={isRailExpanded} />
        </div>
      </div>
    </div>
  );
});

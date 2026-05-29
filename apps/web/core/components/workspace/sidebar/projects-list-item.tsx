/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { attachInstruction, extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { observer } from "mobx-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { createRoot } from "react-dom/client";
import scrollIntoView from "smooth-scroll-into-view-if-needed";
import { Briefcase, Copy, FileText, Settings, Share2, LogOut, MoreHorizontal } from "@/components/icons/lucide-shim";
import { Disclosure, Transition } from "@headlessui/react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel, MEMBER_TRACKER_ELEMENTS } from "@plane/constants";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { LinkIcon, ArchiveIcon, ChevronRightIcon } from "@plane/propel/icons";
import { IconButton, getIconButtonStyling } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { CustomMenu, DropIndicator, DragHandle, ControlLink } from "@plane/ui";
import { cn, copyTextToClipboard } from "@plane/utils";
// components
import { DEFAULT_TAB_KEY, getTabUrl } from "@/components/navigation/tab-navigation-utils";
import { useTabPreferences } from "@/components/navigation/use-tab-preferences";
import { LeaveProjectModal } from "@/components/project/leave-project-modal";
import { PublishProjectModal } from "@/components/project/publish-project/modal";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { ProjectTemplateService } from "@/services/project/project-template.service";
// plane web imports
import { useNavigationItems } from "@/plane-web/components/navigations";
import { ProjectNavigationRoot } from "@/plane-web/components/sidebar";
// local imports
import { HIGHLIGHT_CLASS, highlightIssueOnDrop } from "../../issues/issue-layouts/utils";

// Singleton — the kebab menu uses this lazily, and a single service
// instance per app is the convention used elsewhere in the codebase.
const projectTemplateService = new ProjectTemplateService();

type Props = {
  projectId: string;
  handleCopyText: () => void;
  handleOnProjectDrop?: (
    sourceId: string | undefined,
    destinationId: string | undefined,
    shouldDropAtEnd: boolean
  ) => void;
  projectListType: "JOINED" | "FAVORITES";
  disableDrag?: boolean;
  disableDrop?: boolean;
  isLastChild: boolean;
};

export const SidebarProjectsListItem = observer(function SidebarProjectsListItem(props: Props) {
  const { projectId, handleCopyText, disableDrag, disableDrop, isLastChild, handleOnProjectDrop, projectListType } =
    props;
  // store hooks
  const { t } = useTranslation();
  const { getPartialProjectById } = useProject();
  const { isMobile } = usePlatformOS();
  const { allowPermissions } = useUserPermissions();
  const { getIsProjectListOpen, toggleProjectListOpen } = useCommandPalette();
  const { preferences: projectPreferences } = useProjectNavigationPreferences();
  const { toggleAnySidebarDropdown } = useAppTheme();

  // states
  const [leaveProjectModalOpen, setLeaveProjectModal] = useState(false);
  const [publishModalOpen, setPublishModal] = useState(false);
  const [isMenuActive, setIsMenuActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isProjectListOpen = getIsProjectListOpen(projectId);
  const [instruction, setInstruction] = useState<"DRAG_OVER" | "DRAG_BELOW" | undefined>(undefined);
  // refs
  const actionSectionRef = useRef<HTMLElement | null>(null);
  const projectRef = useRef<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  // router
  const { workspaceSlug, projectId: URLProjectId } = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // derived values
  const project = getPartialProjectById(projectId);
  const openedFromFavorites = searchParams.get("openFrom") === "favorites";

  // Get available navigation items for this project
  const navigationItems = useNavigationItems({
    workspaceSlug: workspaceSlug.toString(),
    projectId,
    project,
    allowPermissions,
  });
  const availableTabKeys = navigationItems.map((item) => item.key);

  // Get preferences from hook
  const { tabPreferences } = useTabPreferences(workspaceSlug.toString(), projectId);
  const defaultTabKey = tabPreferences.defaultTab;
  // Validate that the default tab is available
  const validatedDefaultTabKey = availableTabKeys.includes(defaultTabKey) ? defaultTabKey : DEFAULT_TAB_KEY;
  const defaultTabUrl = project ? getTabUrl(workspaceSlug.toString(), project.id, validatedDefaultTabKey) : "";

  // toggle project list open
  const setIsProjectListOpen = useCallback(
    (value: boolean) => toggleProjectListOpen(projectId, value),
    [projectId, toggleProjectListOpen]
  );
  // auth
  const isAdmin = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug.toString(),
    project?.id
  );
  const handleSaveAsTemplate = useCallback(async () => {
    if (!workspaceSlug || !project?.id) return;
    const defaultName = project.name || "Untitled template";
    const name = window.prompt("Save this project as a template — pick a name:", defaultName);
    if (!name) return;
    try {
      await projectTemplateService.saveAsTemplate(workspaceSlug.toString(), project.id, {
        name: name.trim(),
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Template saved",
        message: "It's now available in the Create project modal.",
      });
    } catch (err) {
      const message = (err as { error?: string } | undefined)?.error ?? "Try again in a moment.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't save template", message });
    }
  }, [workspaceSlug, project?.id, project?.name]);

  const isAuthorized = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug.toString(),
    project?.id
  );

  const handleLeaveProject = () => {
    setLeaveProjectModal(true);
  };

  const handleCopyProjectId = async () => {
    try {
      await copyTextToClipboard(projectId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Project ID copied",
        message: projectId,
      });
    } catch (_err) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't copy project ID",
        message: "Try again in a moment.",
      });
    }
  };

  const pageNavigationItem = navigationItems.find((item) => item.key === "pages");

  const projectLogoProps = project?.logo_props;
  const projectName = project?.name;

  useEffect(() => {
    const element = projectRef.current;
    const dragHandleElement = dragHandleRef.current;

    if (!element) return;

    return combine(
      draggable({
        element,
        canDrag: () => !disableDrag,
        dragHandle: dragHandleElement ?? undefined,
        getInitialData: () => ({ id: projectId, dragInstanceId: "PROJECTS" }),
        onDragStart: () => {
          setIsDragging(true);
        },
        onDrop: () => {
          setIsDragging(false);
        },
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          // Add a custom drag image
          setCustomNativeDragPreview({
            getOffset: pointerOutsideOfPreview({ x: "0px", y: "0px" }),
            render: ({ container }) => {
              const root = createRoot(container);
              root.render(
                <div className="flex items-center rounded-lg bg-surface-1 p-1 pr-2 text-13">
                  <div className="grid size-4 flex-shrink-0 place-items-center">
                    {projectLogoProps && <Logo logo={projectLogoProps} />}
                  </div>
                  <p className="truncate text-secondary">{projectName}</p>
                </div>
              );
              return () => root.unmount();
            },
            nativeSetDragImage,
          });
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          !disableDrop && source?.data?.id !== projectId && source?.data?.dragInstanceId === "PROJECTS",
        getData: ({ input, element: targetElement }) => {
          const data = { id: projectId };

          // attach instruction for last in list
          return attachInstruction(data, {
            input,
            element: targetElement,
            currentLevel: 0,
            indentPerLevel: 0,
            mode: isLastChild ? "last-in-group" : "standard",
          });
        },
        onDrag: ({ self }) => {
          const extractedInstruction = extractInstruction(self?.data)?.type;
          // check if the highlight is to be shown above or below
          setInstruction(
            extractedInstruction
              ? extractedInstruction === "reorder-below" && isLastChild
                ? "DRAG_BELOW"
                : "DRAG_OVER"
              : undefined
          );
        },
        onDragLeave: () => {
          setInstruction(undefined);
        },
        onDrop: ({ self, source }) => {
          setInstruction(undefined);
          const extractedInstruction = extractInstruction(self?.data)?.type;
          const currentInstruction = extractedInstruction
            ? extractedInstruction === "reorder-below" && isLastChild
              ? "DRAG_BELOW"
              : "DRAG_OVER"
            : undefined;
          if (!currentInstruction) return;

          const sourceId = source?.data?.id as string | undefined;
          const destinationId = self?.data?.id as string | undefined;

          handleOnProjectDrop?.(sourceId, destinationId, currentInstruction === "DRAG_BELOW");

          highlightIssueOnDrop(`sidebar-${sourceId}-${projectListType}`);
        },
      })
    );
  }, [
    disableDrag,
    disableDrop,
    handleOnProjectDrop,
    isLastChild,
    projectId,
    projectListType,
    projectLogoProps,
    projectName,
  ]);

  useEffect(() => {
    if (isMenuActive) toggleAnySidebarDropdown(true);
    else toggleAnySidebarDropdown(false);
  }, [isMenuActive, toggleAnySidebarDropdown]);

  useOutsideClickDetector(actionSectionRef, () => setIsMenuActive(false));
  useOutsideClickDetector(projectRef, () => projectRef?.current?.classList?.remove(HIGHLIGHT_CLASS));

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (URLProjectId === project?.id) {
      if (openedFromFavorites) {
        setIsProjectListOpen(false);
      } else {
        setIsProjectListOpen(true);
        // Scroll to active project
        if (projectRef.current) {
          timeoutId = setTimeout(() => {
            if (projectRef.current) {
              scrollIntoView(projectRef.current, {
                behavior: "smooth",
                block: "center",
                scrollMode: "if-needed",
              });
            }
          }, 200);
        }
      }
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [URLProjectId, openedFromFavorites, project?.id, setIsProjectListOpen]);

  useEffect(() => {
    if (!openedFromFavorites) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("openFrom");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [openedFromFavorites, pathname, router, searchParams]);

  if (!project) return null;

  const isAccordionMode = projectPreferences.navigationMode === "ACCORDION";

  const handleItemClick = () => {
    if (projectPreferences.navigationMode === "ACCORDION") {
      setIsProjectListOpen(!isProjectListOpen);
    } else {
      router.push(defaultTabUrl);
    }
  };

  const shouldHighlightProject = URLProjectId === project?.id && projectPreferences.navigationMode !== "ACCORDION";

  return (
    <>
      <PublishProjectModal isOpen={publishModalOpen} projectId={projectId} onClose={() => setPublishModal(false)} />
      <LeaveProjectModal project={project} isOpen={leaveProjectModalOpen} onClose={() => setLeaveProjectModal(false)} />
      <Disclosure key={`${project.id}_${URLProjectId}`} defaultOpen={isProjectListOpen} as="div">
        <div
          id={`sidebar-${projectId}-${projectListType}`}
          className={cn("relative", {
            "bg-layer-1 opacity-60": isDragging,
          })}
          ref={projectRef}
        >
          <DropIndicator classNames="absolute top-0" isVisible={instruction === "DRAG_OVER"} />
          <div
            className={cn(
              "group/project-item relative flex w-full items-center rounded-lg px-2 py-1.5 text-primary hover:bg-layer-transparent-hover",
              {
                "bg-surface-2": isMenuActive,
                "bg-layer-transparent-active": shouldHighlightProject,
                "pr-14": isAccordionMode,
              }
            )}
            id={`${project?.id}`}
          >
            {!disableDrag && (
              <Tooltip
                isMobile={isMobile}
                tooltipContent={
                  project.sort_order === null ? t("join_the_project_to_rearrange") : t("drag_to_rearrange")
                }
                position="top-end"
                disabled={isDragging}
              >
                <button
                  type="button"
                  className={cn(
                    "absolute top-1/2 -left-3 hidden -translate-y-1/2 cursor-grab items-center justify-center rounded-lg text-placeholder group-hover/project-item:flex",
                    {
                      "cursor-not-allowed opacity-60": project.sort_order === null,
                      "cursor-grabbing": isDragging,
                      flex: isMenuActive,
                    }
                  )}
                  ref={dragHandleRef}
                >
                  <DragHandle className="bg-transparent" />
                </button>
              </Tooltip>
            )}
            <>
              <ControlLink href={defaultTabUrl} className="flex min-w-0 flex-grow truncate" onClick={handleItemClick}>
                {isAccordionMode ? (
                  <Disclosure.Button
                    as="button"
                    type="button"
                    className={cn("flex w-full min-w-0 flex-grow items-center gap-1.5 text-left select-none", {})}
                    aria-label={
                      isProjectListOpen
                        ? t("aria_labels.projects_sidebar.close_project_menu")
                        : t("aria_labels.projects_sidebar.open_project_menu")
                    }
                  >
                    <div className="grid size-4 flex-shrink-0 place-items-center">
                      <Logo logo={project.logo_props} size={16} />
                    </div>
                    <p className="truncate text-13 font-medium text-secondary">{project.name}</p>
                  </Disclosure.Button>
                ) : (
                  <div className="flex w-full min-w-0 flex-grow items-center gap-1.5 text-left select-none">
                    <div className="grid size-4 flex-shrink-0 place-items-center">
                      <Logo logo={project.logo_props} size={16} />
                    </div>
                    <p className="truncate text-13 font-medium text-secondary">{project.name}</p>
                  </div>
                )}
              </ControlLink>
              <div
                className={cn("flex flex-shrink-0 items-center gap-1", {
                  "absolute top-1/2 right-1 -translate-y-1/2": isAccordionMode,
                })}
              >
                <CustomMenu
                  customButton={
                    <span ref={actionSectionRef} className="grid place-items-center">
                      <MoreHorizontal className="size-3.5" />
                    </span>
                  }
                  menuButtonOnClick={() => setIsMenuActive((isActive) => !isActive)}
                  className={cn(
                    "pointer-events-none flex-shrink-0 opacity-0 transition-opacity group-hover/project-item:pointer-events-auto group-hover/project-item:opacity-100",
                    {
                      "pointer-events-auto opacity-100": isMenuActive,
                    }
                  )}
                  customButtonClassName={cn(getIconButtonStyling("ghost", "sm"), "text-placeholder")}
                  placement="bottom-start"
                  ariaLabel={t("aria_labels.projects_sidebar.toggle_quick_actions_menu")}
                  useCaptureForOutsideClick
                  closeOnSelect
                  onMenuClose={() => setIsMenuActive(false)}
                >
                  {pageNavigationItem && (
                    <CustomMenu.MenuItem onClick={() => router.push(pageNavigationItem.href)}>
                      <div className="flex cursor-pointer items-center justify-start gap-2">
                        <div className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-lg text-secondary transition-all duration-300 hover:bg-layer-1">
                          <pageNavigationItem.icon className="h-3.5 w-3.5 stroke-[1.5]" />
                        </div>
                        <div>{t(pageNavigationItem.i18n_key)}</div>
                      </div>
                    </CustomMenu.MenuItem>
                  )}
                  <CustomMenu.MenuItem onClick={() => router.push(`/${workspaceSlug.toString()}/docs`)}>
                    <div className="flex cursor-pointer items-center justify-start gap-2">
                      <div className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-lg text-secondary transition-all duration-300 hover:bg-layer-1">
                        <FileText className="h-3.5 w-3.5 stroke-[1.5]" />
                      </div>
                      <div>{t("sidebar.docs")}</div>
                    </div>
                  </CustomMenu.MenuItem>
                  {/* TODO: Removed is_favorite logic due to the optimization in projects API */}
                  {/* {isAuthorized && (
                    <CustomMenu.MenuItem
                      onClick={project.is_favorite ? handleRemoveFromFavorites : handleAddToFavorites}
                    >
                      <span className="flex items-center justify-start gap-2">
                        <Star
                          className={cn("h-3.5 w-3.5 ", {
                            "fill-yellow-500 stroke-yellow-500": project.is_favorite,
                          })}
                        />
                        <span>{project.is_favorite ? t("remove_from_favorites") : t("add_to_favorites")}</span>
                      </span>
                    </CustomMenu.MenuItem>
                  )} */}

                  {/* publish project settings */}
                  {isAdmin && (
                    <CustomMenu.MenuItem onClick={() => setPublishModal(true)}>
                      <div className="relative flex flex-shrink-0 items-center justify-start gap-2">
                        <div className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-lg text-secondary transition-all duration-300 hover:bg-layer-1">
                          <Share2 className="h-3.5 w-3.5 stroke-[1.5]" />
                        </div>
                        <div>{t("publish_project")}</div>
                      </div>
                    </CustomMenu.MenuItem>
                  )}
                  {/* Save as project template — admin-only, matches the
                      page-kebab "Save as template" pattern. window.prompt
                      for the name keeps it one-click and avoids another
                      modal. */}
                  {isAdmin && (
                    <CustomMenu.MenuItem onClick={() => void handleSaveAsTemplate()}>
                      <div className="relative flex flex-shrink-0 items-center justify-start gap-2">
                        <div className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-lg text-secondary transition-all duration-300 hover:bg-layer-1">
                          <Briefcase className="h-3.5 w-3.5 stroke-[1.5]" />
                        </div>
                        <div>Save as template</div>
                      </div>
                    </CustomMenu.MenuItem>
                  )}
                  <CustomMenu.MenuItem onClick={handleCopyText}>
                    <span className="flex items-center justify-start gap-2">
                      <LinkIcon className="h-3.5 w-3.5 stroke-[1.5]" />
                      <span>{t("copy_link")}</span>
                    </span>
                  </CustomMenu.MenuItem>
                  <CustomMenu.MenuItem onClick={() => void handleCopyProjectId()}>
                    <span className="flex items-center justify-start gap-2">
                      <Copy className="h-3.5 w-3.5 stroke-[1.5]" />
                      <span>Copy project ID</span>
                    </span>
                  </CustomMenu.MenuItem>
                  {isAuthorized && (
                    <CustomMenu.MenuItem
                      onClick={() => {
                        router.push(`/${workspaceSlug}/projects/${project?.id}/archives/issues`);
                      }}
                    >
                      <div className="flex cursor-pointer items-center justify-start gap-2">
                        <ArchiveIcon className="h-3.5 w-3.5 stroke-[1.5]" />
                        <span>{t("archives")}</span>
                      </div>
                    </CustomMenu.MenuItem>
                  )}
                  <CustomMenu.MenuItem
                    onClick={() => {
                      router.push(`/${workspaceSlug}/settings/projects/${project?.id}`);
                    }}
                  >
                    <div className="flex cursor-pointer items-center justify-start gap-2">
                      <Settings className="h-3.5 w-3.5 stroke-[1.5]" />
                      <span>{t("settings")}</span>
                    </div>
                  </CustomMenu.MenuItem>
                  {/* leave project */}
                  {!isAuthorized && (
                    <CustomMenu.MenuItem
                      onClick={handleLeaveProject}
                      data-ph-element={MEMBER_TRACKER_ELEMENTS.SIDEBAR_PROJECT_QUICK_ACTIONS}
                    >
                      <div className="flex items-center justify-start gap-2">
                        <LogOut className="h-3.5 w-3.5 stroke-[1.5]" />
                        <span>{t("leave_project")}</span>
                      </div>
                    </CustomMenu.MenuItem>
                  )}
                </CustomMenu>
                {isAccordionMode && (
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={ChevronRightIcon}
                    onClick={() => setIsProjectListOpen(!isProjectListOpen)}
                    className="text-placeholder"
                    iconClassName={cn("transition-transform", {
                      "rotate-90": isProjectListOpen,
                    })}
                    aria-label={t(
                      isProjectListOpen
                        ? "aria_labels.projects_sidebar.close_project_menu"
                        : "aria_labels.projects_sidebar.open_project_menu"
                    )}
                  />
                )}
              </div>
            </>
          </div>
          {isAccordionMode && (
            <Transition
              show={isProjectListOpen}
              enter="transition duration-100 ease-out"
              enterFrom="transform scale-95 opacity-0"
              enterTo="transform scale-100 opacity-100"
              leave="transition duration-75 ease-out"
              leaveFrom="transform scale-100 opacity-100"
              leaveTo="transform scale-95 opacity-0"
            >
              {isProjectListOpen && (
                <Disclosure.Panel as="div" className="relative mt-1 mb-1.5 flex flex-col gap-0.5 pl-6">
                  <div className="absolute top-0 bottom-1 left-[15px] w-[1px] bg-layer-3" />
                  <ProjectNavigationRoot workspaceSlug={workspaceSlug.toString()} projectId={projectId.toString()} />
                </Disclosure.Panel>
              )}
            </Transition>
          )}
          {isLastChild && <DropIndicator isVisible={instruction === "DRAG_BELOW"} />}
        </div>
      </Disclosure>
    </>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useState, useEffect } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
// icons
import { CirclePlus, LogOut, Mails, Settings, UserPlus } from "@/components/icons/lucide-shim";
// ui
import { Menu, Transition } from "@headlessui/react";
// plane imports
import { EUserPermissions } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ChevronDownIcon } from "@/components/icons/propel-shim";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspace } from "@plane/types";
import { Loader } from "@plane/ui";
import { orderWorkspacesList, cn } from "@plane/utils";
import { AppSidebarTooltip } from "@/components/sidebar/sidebar-item";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser, useUserProfile } from "@/hooks/store/user";
import { useInstance } from "@/hooks/store/use-instance";
// components
import { WorkspaceLogo } from "../logo";
import SidebarDropdownItem from "./dropdown-item";

type WorkspaceMenuRootProps = {
  variant: "sidebar" | "top-navigation";
  showLabel?: boolean;
};

export const WorkspaceMenuRoot = observer(function WorkspaceMenuRoot(props: WorkspaceMenuRootProps) {
  const { variant, showLabel = false } = props;
  // store hooks
  const { toggleSidebar, toggleAnySidebarDropdown } = useAppTheme();
  const { config } = useInstance();
  const { signOut } = useUser();
  const { updateUserProfile } = useUserProfile();
  const { currentWorkspace: activeWorkspace, workspaces } = useWorkspace();
  // derived values
  const isWorkspaceCreationDisabled = config?.is_workspace_creation_disabled ?? false;
  // translation
  const { t } = useTranslation();
  // local state
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);

  const handleWorkspaceNavigation = (workspace: IWorkspace) => updateUserProfile({ last_workspace_id: workspace?.id });

  const handleSignOut = async () => {
    await signOut().catch(() =>
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("auth.sign_out.toast.error.title"),
        message: t("auth.sign_out.toast.error.message"),
      })
    );
  };

  const handleItemClick = () => {
    if (window.innerWidth < 768) {
      toggleSidebar();
    }
  };
  const workspacesList = orderWorkspacesList(Object.values(workspaces ?? {}));
  const canManageActiveWorkspace =
    !!activeWorkspace && [EUserPermissions.ADMIN, EUserPermissions.MEMBER].includes(activeWorkspace.role);
  const canInviteToActiveWorkspace = !!activeWorkspace && activeWorkspace.role === EUserPermissions.ADMIN;
  // TODO: fix workspaces list scroll

  // Toggle sidebar dropdown state when either menu is open
  useEffect(() => {
    toggleAnySidebarDropdown(isWorkspaceMenuOpen);
  }, [isWorkspaceMenuOpen, toggleAnySidebarDropdown]);

  return (
    <Menu
      as="div"
      className={cn("relative flex w-fit max-w-48 truncate whitespace-nowrap", {
        "justify-start text-left": variant === "sidebar" && showLabel,
        "w-full justify-center text-center": variant === "sidebar" && !showLabel,
        "justify-start truncate text-left": variant === "top-navigation",
      })}
    >
      {({ open }: { open: boolean }) => {
        // Update local state directly
        if (isWorkspaceMenuOpen !== open) {
          setIsWorkspaceMenuOpen(open);
        }

        return (
          <>
            {variant === "sidebar" && (
              <AppSidebarTooltip tooltipContent={activeWorkspace?.name ?? t("loading")} disabled={showLabel}>
                <Menu.Button
                  aria-label={activeWorkspace?.name ?? t("aria_labels.projects_sidebar.open_workspace_switcher")}
                  className={cn(
                    "flex h-8 max-w-full items-center rounded-lg hover:bg-layer-transparent-hover dark:text-white/75 dark:hover:bg-white/[0.08]",
                    {
                      "bg-layer-1": open,
                      "dark:bg-white/[0.12]": open,
                      "w-fit justify-start gap-2 px-2": showLabel,
                      "w-8 justify-center": !showLabel,
                    }
                  )}
                >
                  <WorkspaceLogo
                    logo={activeWorkspace?.logo_url}
                    name={activeWorkspace?.name}
                    workspaceId={activeWorkspace?.id}
                    classNames="size-5 flex-shrink-0 rounded-lg border border-subtle"
                  />
                  {showLabel && (
                    <>
                      <span className="min-w-0 flex-1 truncate text-13 font-medium text-secondary dark:text-white/80">
                        {activeWorkspace?.name ?? t("loading")}
                      </span>
                      <ChevronDownIcon
                        className={cn("size-4 flex-shrink-0 text-icon-tertiary duration-300 dark:text-white/55", {
                          "rotate-180": open,
                        })}
                      />
                    </>
                  )}
                </Menu.Button>
              </AppSidebarTooltip>
            )}
            {variant === "top-navigation" && (
              <Menu.Button
                className={cn(
                  "group/menu-button flex flex-grow items-center justify-between gap-1 truncate rounded-lg py-1 pr-1 pl-0 text-13 font-medium text-secondary hover:bg-layer-1 focus:outline-none",
                  {
                    "bg-layer-1": open,
                  }
                )}
                aria-label={t("aria_labels.projects_sidebar.open_workspace_switcher")}
              >
                <div className="flex flex-grow items-center gap-2 truncate">
                  <WorkspaceLogo
                    logo={activeWorkspace?.logo_url}
                    name={activeWorkspace?.name}
                    workspaceId={activeWorkspace?.id}
                    classNames="border border-subtle rounded-lg size-7"
                  />
                  <h4 className="truncate text-14 font-medium text-primary">{activeWorkspace?.name ?? t("loading")}</h4>
                </div>
                <ChevronDownIcon
                  className={cn("size-4 flex-shrink-0 text-placeholder duration-300", {
                    "rotate-180": open,
                  })}
                />
              </Menu.Button>
            )}
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="trnsform opacity-100 scale-100"
              leave="transition ease-out duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items as={Fragment}>
                <div
                  className={cn(
                    "fixed z-21 mt-1 flex w-64 origin-top-left flex-col divide-y divide-subtle overflow-hidden rounded-lg border-[0.5px] border-strong bg-surface-1 p-1 shadow-raised-200 outline-none",
                    {
                      "top-11 left-14": variant === "sidebar",
                      "top-10 left-0": variant === "top-navigation",
                    }
                  )}
                >
                  <div className="vertical-scrollbar flex scrollbar-sm max-h-56 flex-col items-start justify-start overflow-x-hidden overflow-y-auto">
                    {workspacesList ? (
                      <div className="flex size-full flex-col items-start justify-start">
                        {(activeWorkspace
                          ? [
                              activeWorkspace,
                              ...workspacesList.filter((workspace) => workspace.id !== activeWorkspace?.id),
                            ]
                          : workspacesList
                        ).map((workspace) => (
                          <SidebarDropdownItem
                            key={workspace.id}
                            workspace={workspace}
                            activeWorkspace={activeWorkspace}
                            handleItemClick={handleItemClick}
                            handleWorkspaceNavigation={handleWorkspaceNavigation}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="w-full">
                        <Loader className="space-y-2">
                          <Loader.Item height="30px" />
                          <Loader.Item height="30px" />
                        </Loader>
                      </div>
                    )}
                  </div>
                  <div className="flex w-full flex-col items-start justify-start gap-0.5 pt-1 text-13">
                    {canManageActiveWorkspace && (
                      <Link href={`/${activeWorkspace.slug}/settings`} className="w-full" onClick={handleItemClick}>
                        <Menu.Item
                          as="div"
                          className="flex h-8 items-center gap-2 rounded-lg px-2 text-13 font-medium text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                        >
                          <Settings className="size-4 flex-shrink-0" />
                          <span>{t("settings")}</span>
                        </Menu.Item>
                      </Link>
                    )}

                    {canInviteToActiveWorkspace && (
                      <Link
                        href={`/${activeWorkspace.slug}/settings/members`}
                        className="w-full"
                        onClick={handleItemClick}
                      >
                        <Menu.Item
                          as="div"
                          className="flex h-8 items-center gap-2 rounded-lg px-2 text-13 font-medium text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                        >
                          <UserPlus className="size-4 flex-shrink-0" />
                          <span>{t("project_settings.members.invite_members.title")}</span>
                        </Menu.Item>
                      </Link>
                    )}

                    {(canManageActiveWorkspace || canInviteToActiveWorkspace) && (
                      <div className="bg-border-200 my-0 h-px w-full" />
                    )}

                    {!isWorkspaceCreationDisabled && (
                      <Link href="/create-workspace" className="w-full">
                        <Menu.Item
                          as="div"
                          className="flex h-8 items-center gap-2 rounded-lg px-2 text-13 font-medium text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                        >
                          <CirclePlus className="size-4 flex-shrink-0" />
                          {t("create_workspace")}
                        </Menu.Item>
                      </Link>
                    )}

                    <Link href="/invitations" className="w-full" onClick={handleItemClick}>
                      <Menu.Item
                        as="div"
                        className="flex h-8 items-center gap-2 rounded-lg px-2 text-13 font-medium text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                      >
                        <Mails className="h-4 w-4 flex-shrink-0" />
                        {t("workspace_invites")}
                      </Menu.Item>
                    </Link>

                    <div className="w-full">
                      <Menu.Item
                        as="button"
                        type="button"
                        className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-13 font-medium text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                        onClick={handleSignOut}
                      >
                        <LogOut className="size-4 flex-shrink-0" />
                        {t("sign_out")}
                      </Menu.Item>
                    </div>
                  </div>
                </div>
              </Menu.Items>
            </Transition>
          </>
        );
      }}
    </Menu>
  );
});

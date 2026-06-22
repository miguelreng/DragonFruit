/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
// ui
import { LogOut } from "@/components/icons/lucide-shim";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button, getButtonStyling } from "@plane/propel/button";
import { DragonfruitLogo } from "@/components/icons/propel-shim";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
// assets
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
import { CursorBuddyDocToastListener } from "@/components/agent/cursor-buddy-doc-toast-listener";
// constants
import {
  WORKSPACE_AGENTS,
  WORKSPACE_MEMBERS,
  WORKSPACE_PARTIAL_PROJECTS,
  WORKSPACE_MEMBER_ME_INFORMATION,
  WORKSPACE_PROJECTS_ROLES_INFORMATION,
  WORKSPACE_FAVORITE,
  WORKSPACE_STATES,
  WORKSPACE_SIDEBAR_PREFERENCES,
  WORKSPACE_PROJECT_NAVIGATION_PREFERENCES,
  USER_WORKSPACES_LIST,
} from "@/constants/fetch-keys";
// hooks
import { useAgent } from "@/hooks/store/use-agent";
import { useFavorite } from "@/hooks/store/use-favorite";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { usePlatformOS } from "@/hooks/use-platform-os";

interface IWorkspaceAuthWrapper {
  children: ReactNode;
  isLoading?: boolean;
}

export const WorkspaceAuthWrapper = observer(function WorkspaceAuthWrapper(props: IWorkspaceAuthWrapper) {
  const { children, isLoading: isParentLoading = false } = props;
  // router params
  const { workspaceSlug } = useParams();
  // store hooks
  const { signOut, data: currentUser } = useUser();
  const { fetchPartialProjects } = useProject();
  const { fetchFavorite } = useFavorite();
  const {
    workspace: { fetchWorkspaceMembers },
  } = useMember();
  const agentStore = useAgent();
  const {
    loader: workspaceListLoader,
    workspaces,
    fetchWorkspaces,
    fetchSidebarNavigationPreferences,
    fetchProjectNavigationPreferences,
  } = useWorkspace();
  const { isMobile } = usePlatformOS();
  const { loader, workspaceInfoBySlug, fetchUserWorkspaceInfo, fetchUserProjectPermissions, allowPermissions } =
    useUserPermissions();
  const { fetchWorkspaceStates } = useProjectState();
  // derived values
  const canPerformWorkspaceMemberActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const allWorkspaces = workspaces ? Object.values(workspaces) : undefined;
  const currentWorkspace =
    (allWorkspaces && allWorkspaces.find((workspace) => workspace?.slug === workspaceSlug)) || undefined;
  const currentWorkspaceInfo = workspaceSlug && workspaceInfoBySlug(workspaceSlug.toString());
  const shouldRefreshWorkspaces = Boolean(workspaceSlug && allWorkspaces && currentWorkspace === undefined);

  const { isLoading: isWorkspaceRefreshLoading, isValidating: isWorkspaceRefreshValidating } = useSWR(
    shouldRefreshWorkspaces ? `${USER_WORKSPACES_LIST}_${workspaceSlug.toString()}` : null,
    shouldRefreshWorkspaces ? () => fetchWorkspaces() : null,
    { revalidateIfStale: true, revalidateOnFocus: false, shouldRetryOnError: false }
  );

  // fetching user workspace information
  useSWR(
    workspaceSlug && currentWorkspace ? WORKSPACE_MEMBER_ME_INFORMATION(workspaceSlug.toString()) : null,
    workspaceSlug && currentWorkspace ? () => fetchUserWorkspaceInfo(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  useSWR(
    workspaceSlug && currentWorkspace ? WORKSPACE_PROJECTS_ROLES_INFORMATION(workspaceSlug.toString()) : null,
    workspaceSlug && currentWorkspace ? () => fetchUserProjectPermissions(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // fetching workspace projects
  useSWR(
    workspaceSlug && currentWorkspace ? WORKSPACE_PARTIAL_PROJECTS(workspaceSlug.toString()) : null,
    workspaceSlug && currentWorkspace ? () => fetchPartialProjects(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  // fetch workspace members
  useSWR(
    workspaceSlug && currentWorkspace ? WORKSPACE_MEMBERS(workspaceSlug.toString()) : null,
    workspaceSlug && currentWorkspace ? () => fetchWorkspaceMembers(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  // fetch workspace agents — needed so every member-avatar render site
  // (assignee chips, activity feed, mentions, dropdowns) can overlay the
  // agent's current avatar on top of the underlying bot user. Soft-fails
  // if the user can't access the endpoint.
  useSWR(
    workspaceSlug && currentWorkspace ? WORKSPACE_AGENTS(workspaceSlug.toString()) : null,
    workspaceSlug && currentWorkspace ? () => agentStore.fetchAgents(workspaceSlug.toString()).catch(() => []) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  // fetch workspace favorite
  useSWR(
    workspaceSlug && currentWorkspace && canPerformWorkspaceMemberActions
      ? WORKSPACE_FAVORITE(workspaceSlug.toString())
      : null,
    workspaceSlug && currentWorkspace && canPerformWorkspaceMemberActions
      ? () => fetchFavorite(workspaceSlug.toString())
      : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  // fetch workspace states
  useSWR(
    workspaceSlug ? WORKSPACE_STATES(workspaceSlug.toString()) : null,
    workspaceSlug ? () => fetchWorkspaceStates(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // fetch workspace sidebar preferences
  useSWR(
    workspaceSlug ? WORKSPACE_SIDEBAR_PREFERENCES(workspaceSlug.toString()) : null,
    workspaceSlug ? () => fetchSidebarNavigationPreferences(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // fetch workspace project navigation preferences
  useSWR(
    workspaceSlug ? WORKSPACE_PROJECT_NAVIGATION_PREFERENCES(workspaceSlug.toString()) : null,
    workspaceSlug ? () => fetchProjectNavigationPreferences(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const handleSignOut = async () => {
    await signOut().catch(() =>
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Failed to sign out. Please try again.",
      })
    );
  };

  // if list of workspaces are not there then we have to render the spinner
  if (
    isParentLoading ||
    allWorkspaces === undefined ||
    loader ||
    workspaceListLoader ||
    isWorkspaceRefreshLoading ||
    isWorkspaceRefreshValidating
  ) {
    return (
      <div className="grid h-full place-items-center rounded-lg border border-subtle p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <LogoSpinner />
        </div>
      </div>
    );
  }

  // if workspaces are there and we are trying to access the workspace that we are not part of then show the existing workspaces
  if (currentWorkspace === undefined && !currentWorkspaceInfo) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center bg-surface-2">
        <div className="relative container mx-auto flex h-full w-full flex-col overflow-hidden overflow-y-auto px-5 py-14 md:px-0">
          <div className="relative flex flex-shrink-0 items-center justify-between gap-4">
            <div className="z-10 flex-shrink-0 bg-surface-2 py-4">
              <DragonfruitLogo className="h-9 w-auto text-primary" />
            </div>
            <div className="relative flex items-center gap-2">
              <div className="text-13 font-medium">{currentUser?.email}</div>
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div
                className="relative flex h-6 w-6 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg hover:bg-layer-1"
                onClick={handleSignOut}
              >
                <Tooltip tooltipContent={"Sign out"} position="top" className="ml-2" isMobile={isMobile}>
                  <LogOut size={14} />
                </Tooltip>
              </div>
            </div>
          </div>
          <div className="relative flex h-full w-full flex-grow flex-col items-center justify-center space-y-3">
            <div className="relative flex-shrink-0">
              <img
                src="/empty-state/renaissance-sketch/invalid-link.png"
                className="h-[220px] object-contain object-center"
                alt="DragonFruit logo"
              />
            </div>
            <h3 className="text-center text-16 font-semibold">Workspace not found</h3>
            <p className="text-center text-13 text-secondary">
              No workspace found with the URL. It may not exist or you lack authorization to view it.
            </p>
            <div className="flex items-center justify-center gap-2 pt-4">
              {allWorkspaces && allWorkspaces.length > 0 && (
                <Link href="/" className={cn(getButtonStyling("primary", "base"))}>
                  Go Home
                </Link>
              )}
              {allWorkspaces?.length > 0 && (
                <Link href="/settings/profile/general/" className={cn(getButtonStyling("secondary", "base"))}>
                  Visit Profile
                </Link>
              )}
              {allWorkspaces && allWorkspaces.length === 0 && (
                <Link href="/create-workspace/" className={cn(getButtonStyling("secondary", "base"))}>
                  Create new workspace
                </Link>
              )}
            </div>
          </div>

          <div className="absolute top-0 bottom-0 left-4 w-0 bg-layer-1 md:w-0.5" />
        </div>
      </div>
    );
  }

  // while user does not have access to view that workspace
  if (currentWorkspaceInfo === undefined) {
    return (
      <div className={`h-screen w-full overflow-hidden bg-surface-1`}>
        <div className="grid h-full place-items-center p-4">
          <div className="space-y-8 text-center">
            <img
              src="/empty-state/renaissance-sketch/not-authorized.png"
              alt=""
              className="mx-auto h-40 w-40 object-contain"
            />
            <div className="space-y-2">
              <h3 className="text-16 font-semibold">Not Authorized!</h3>
              <p className="mx-auto w-1/2 text-13 text-secondary">
                You{"'"}re not a member of this workspace. Please contact the workspace admin to get an invitation or
                check your pending invitations.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Link href="/invitations">
                <span>
                  <Button variant="secondary">Check pending invites</Button>
                </span>
              </Link>
              <Link href="/create-workspace">
                <span>
                  <Button variant="primary">Create new workspace</Button>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <CursorBuddyDocToastListener workspaceSlug={workspaceSlug?.toString()} />
      {children}
    </>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserProfile } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";

// Legacy redirect: profile settings used to live at the global /settings/profile/:tab.
// They are now a section of the unified workspace settings at
// /:workspaceSlug/settings/account/:tab, so bounce the user there using their
// current / last-used / first-available workspace.
function ProfileSettingsRedirect() {
  // router
  const router = useAppRouter();
  // params
  const { profileTabId } = useParams();
  // store hooks
  const { currentWorkspace, workspaces } = useWorkspace();
  const { data: userProfile } = useUserProfile();

  const tab = profileTabId || "general";

  useEffect(() => {
    const workspacesList = Object.values(workspaces ?? {});
    const slug =
      currentWorkspace?.slug ??
      workspacesList.find((workspace) => workspace.id === userProfile?.last_workspace_id)?.slug ??
      workspacesList[0]?.slug;

    if (slug) {
      router.replace(`/${slug}/settings/account/${tab}`);
    } else if (workspaces) {
      // Authenticated but no workspace yet — send them to onboarding/home.
      router.replace("/");
    }
  }, [currentWorkspace, workspaces, userProfile, tab, router]);

  return (
    <div className="grid size-full place-items-center px-4">
      <LogoSpinner />
    </div>
  );
}

export default observer(ProfileSettingsRedirect);

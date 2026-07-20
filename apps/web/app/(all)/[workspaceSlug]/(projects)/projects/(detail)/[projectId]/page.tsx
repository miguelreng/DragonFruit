/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo } from "react";
import { observer } from "mobx-react";
// plane imports
import { Loader } from "@plane/ui";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// plane web imports
import { useNavigationItems } from "@/plane-web/components/navigations";
// local imports
import { DEFAULT_TAB_KEY } from "@/components/navigation/tab-navigation-utils";
import { useTabPreferences } from "@/components/navigation/use-tab-preferences";
import type { Route } from "./+types/page";

function ProjectDefaultTabRedirect({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const router = useAppRouter();
  const { getPartialProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  const project = getPartialProjectById(projectId);
  const { tabPreferences, isLoading } = useTabPreferences(workspaceSlug, projectId);

  const navigationItems = useNavigationItems({
    workspaceSlug,
    projectId,
    project,
    allowPermissions,
  });
  const availableNavigationItems = useMemo(
    () => navigationItems.filter((item) => item.shouldRender),
    [navigationItems]
  );

  useEffect(() => {
    if (isLoading || availableNavigationItems.length === 0) return;

    const targetItem =
      availableNavigationItems.find((item) => item.key === tabPreferences.defaultTab) ??
      availableNavigationItems.find((item) => item.key === DEFAULT_TAB_KEY) ??
      availableNavigationItems[0];

    if (targetItem) router.replace(targetItem.href);
  }, [availableNavigationItems, isLoading, router, tabPreferences.defaultTab]);

  return (
    <div className="flex h-full w-full flex-col gap-3 p-4">
      <Loader className="flex items-center gap-3">
        <Loader.Item width="120px" height="22px" />
        <Loader.Item width="80px" height="22px" />
        <Loader.Item width="100px" height="22px" />
      </Loader>
      <Loader className="flex flex-col gap-2">
        <Loader.Item width="100%" height="36px" />
        <Loader.Item width="100%" height="36px" />
        <Loader.Item width="100%" height="36px" />
        <Loader.Item width="80%" height="36px" />
      </Loader>
    </div>
  );
}

export default observer(ProjectDefaultTabRedirect);

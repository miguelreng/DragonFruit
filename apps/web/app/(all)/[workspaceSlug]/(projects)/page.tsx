/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { useTranslation } from "@plane/i18n";
import { PageHead } from "@/components/core/page-title";
import { WorkspaceHomeView } from "@/components/home";
// hooks
import { useUser } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// local components
import { HomeGreeting } from "./home-greeting";

function WorkspaceDashboardPage() {
  const { currentWorkspace } = useWorkspace();
  const { data: currentUser } = useUser();
  const { t } = useTranslation();
  // derived values
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace?.name} - ${t("home.title")}` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <WorkspaceHomeView header={currentUser ? <HomeGreeting user={currentUser} /> : null} />
    </>
  );
}

export default observer(WorkspaceDashboardPage);

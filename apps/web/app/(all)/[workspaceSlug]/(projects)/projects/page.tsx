/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useTranslation } from "@plane/i18n";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { ProjectRoot } from "@/components/project/root";

function WorkspaceProjectsPage() {
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();
  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_projects.label", { count: 2 })}`
    : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <ContentWrapper>
        <ProjectRoot />
      </ContentWrapper>
    </>
  );
}

export default observer(WorkspaceProjectsPage);

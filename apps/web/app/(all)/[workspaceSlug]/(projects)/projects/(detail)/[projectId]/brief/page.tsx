/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PageHead } from "@/components/core/page-title";
import { ProjectBriefRoot } from "@/components/project/brief";
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectBriefPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { getPartialProjectById } = useProject();
  const project = getPartialProjectById(projectId);
  const pageTitle = project?.name ? `${project.name} - Brief` : "Brief";

  return (
    <>
      <PageHead title={pageTitle} />
      <ProjectBriefRoot workspaceSlug={workspaceSlug} projectId={projectId} />
    </>
  );
}

export default observer(ProjectBriefPage);

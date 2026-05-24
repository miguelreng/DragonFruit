/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { BookmarkBoard } from "@/components/bookmarks";
import { PageHead } from "@/components/core/page-title";
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectBookmarksPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { getPartialProjectById } = useProject();
  const project = getPartialProjectById(projectId);
  const pageTitle = project?.name ? `${project.name} - Bookmarks` : "Bookmarks";

  return (
    <>
      <PageHead title={pageTitle} />
      <BookmarkBoard workspaceSlug={workspaceSlug} projectId={projectId} mode="project" />
    </>
  );
}

export default observer(ProjectBookmarksPage);

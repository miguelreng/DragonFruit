/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { PageHead } from "@/components/core/page-title";
import { WorkspaceDocsRoot } from "@/components/docs/workspace-docs-root";
import type { Route } from "./+types/page";

export default function WorkspaceWhiteboardsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  return (
    <>
      <PageHead title="Whiteboards" />
      <WorkspaceDocsRoot
        workspaceSlug={workspaceSlug}
        pageType="whiteboard"
        labels={{
          emptyTitle: "No whiteboards yet",
          emptyDescription: "Create a whiteboard from any project's Pages list to see it here.",
          filteredEmptyTitle: "No whiteboards match your filters",
        }}
      />
    </>
  );
}

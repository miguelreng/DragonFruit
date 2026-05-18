/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { PageHead } from "@/components/core/page-title";
import { WorkspaceDocsRoot } from "@/components/docs/workspace-docs-root";
import type { Route } from "./+types/page";

export default function WorkspaceDiagramsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  return (
    <>
      <PageHead title="Diagrams" />
      <WorkspaceDocsRoot
        workspaceSlug={workspaceSlug}
        pageType="diagram"
        labels={{
          emptyTitle: "No diagrams yet",
          emptyDescription: "Create a diagram from any project's Pages list to see it here.",
          filteredEmptyTitle: "No diagrams match your filters",
        }}
      />
    </>
  );
}

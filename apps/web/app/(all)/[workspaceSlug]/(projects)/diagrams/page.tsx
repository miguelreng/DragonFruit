/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Flowchart } from "@/components/icons/lucide-shim";
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
        headerLabel="Diagrams"
        headerIcon={<Flowchart className="h-4 w-4 text-tertiary" />}
        labels={{
          emptyTitle: "No diagrams yet",
          emptyDescription: "Click New diagram to create your first one.",
          filteredEmptyTitle: "No diagrams match your filters",
        }}
      />
    </>
  );
}

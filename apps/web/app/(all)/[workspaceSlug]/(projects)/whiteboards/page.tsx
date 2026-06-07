/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Whiteboard } from "@/components/icons/lucide-shim";
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
        headerLabel="Whiteboards"
        headerIcon={<Whiteboard className="h-4 w-4 text-tertiary" />}
        labels={{
          emptyTitle: "No whiteboards yet",
          emptyDescription: "Click New whiteboard to create your first one.",
          filteredEmptyTitle: "No whiteboards match your filters",
        }}
      />
    </>
  );
}

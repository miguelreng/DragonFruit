/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { PageHead } from "@/components/core/page-title";
import { UnsavedDocsSection } from "@/components/drafts/unsaved-docs-section";
import { WorkspaceDraftIssuesRoot } from "@/components/issues/workspace-draft";
import type { Route } from "./+types/page";

function WorkspaceDraftPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const pageTitle = "Workspace Draft";

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="relative h-full w-full overflow-hidden overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 pt-6">
          <UnsavedDocsSection workspaceSlug={workspaceSlug} />
        </div>
        <WorkspaceDraftIssuesRoot workspaceSlug={workspaceSlug} />
      </div>
    </>
  );
}

export default WorkspaceDraftPage;

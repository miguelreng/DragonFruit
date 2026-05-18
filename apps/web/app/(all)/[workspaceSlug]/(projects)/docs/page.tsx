/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { PageHead } from "@/components/core/page-title";
import { WorkspaceDocsRoot } from "@/components/docs/workspace-docs-root";
import type { Route } from "./+types/page";

export default function WorkspaceDocsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  return (
    <>
      <PageHead title="Docs" />
      <div className="relative h-full w-full overflow-hidden overflow-y-auto">
        <WorkspaceDocsRoot workspaceSlug={workspaceSlug} />
      </div>
    </>
  );
}

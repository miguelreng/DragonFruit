/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { FileText } from "@/components/icons/lucide-shim";
import { PageHead } from "@/components/core/page-title";
import { WorkspaceDocsRoot } from "@/components/docs/workspace-docs-root";
import type { Route } from "./+types/page";

export default function WorkspaceDocsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  return (
    <>
      <PageHead title="Docs" />
      <WorkspaceDocsRoot
        workspaceSlug={workspaceSlug}
        headerLabel="Docs"
        headerIcon={<FileText className="h-4 w-4 text-tertiary" />}
      />
    </>
  );
}

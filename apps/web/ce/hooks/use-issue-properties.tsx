/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueServiceType } from "@plane/types";
import { useProjectCustomFields } from "@/hooks/use-project-custom-fields";

export const useWorkItemProperties = (
  projectId: string | null | undefined,
  workspaceSlug: string | null | undefined,
  workItemId: string | null | undefined,
  _issueServiceType: TIssueServiceType
) => {
  useProjectCustomFields(workspaceSlug ?? undefined, projectId ?? undefined);
  if (!projectId || !workspaceSlug || !workItemId) return;
};

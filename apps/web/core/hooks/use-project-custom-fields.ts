/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import { PROJECT_CUSTOM_FIELDS } from "@/constants/fetch-keys";
import { ProjectCustomFieldService } from "@/services/project";

const customFieldService = new ProjectCustomFieldService();

export const useProjectCustomFields = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const key = workspaceSlug && projectId ? PROJECT_CUSTOM_FIELDS(projectId) : null;

  const swr = useSWR(key, () => customFieldService.list(workspaceSlug!, projectId!), {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });

  return {
    ...swr,
    customFields: swr.data ?? [],
    refetchCustomFields: swr.mutate,
  };
};

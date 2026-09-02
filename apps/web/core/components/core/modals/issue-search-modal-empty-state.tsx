/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { ISearchIssueResponse } from "@plane/types";
// components
import { SimpleEmptyState } from "@/components/empty-state/simple-empty-state-root";

interface EmptyStateProps {
  issues: ISearchIssueResponse[];
  searchTerm: string;
  debouncedSearchTerm: string;
  isSearching: boolean;
}

export function IssueSearchModalEmptyState({ issues, searchTerm, debouncedSearchTerm, isSearching }: EmptyStateProps) {
  // plane hooks
  const { t } = useTranslation();

  function EmptyStateContainer({ children }: { children: React.ReactNode }) {
    return <div className="flex flex-col items-center justify-center px-3 py-8 text-center">{children}</div>;
  }

  if (issues.length === 0 && searchTerm !== "" && debouncedSearchTerm !== "" && !isSearching) {
    return (
      <EmptyStateContainer>
        <SimpleEmptyState title={t("issue_relation.empty_state.no_issues.title")} visual={{ type: "icon", name: "tasks" }} />
      </EmptyStateContainer>
    );
  } else if (issues.length === 0) {
    return (
      <EmptyStateContainer>
        <SimpleEmptyState title={t("issue_relation.empty_state.search.title")} visual={{ type: "icon", name: "search" }} />
      </EmptyStateContainer>
    );
  }
  return null;
}

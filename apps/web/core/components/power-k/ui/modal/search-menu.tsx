/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
// plane imports
import { WORKSPACE_DEFAULT_SEARCH_RESULT } from "@plane/constants";
import type { IWorkspaceSearchResults } from "@plane/types";
// hooks
import { usePowerK } from "@/hooks/store/use-power-k";
import useDebounce from "@/hooks/use-debounce";
// plane web imports
import { PowerKModalNoSearchResultsCommand } from "@/plane-web/components/command-palette/power-k/search/no-results-command";
import { WorkspaceService } from "@/services/workspace.service";
// local imports
import type { TPowerKScope } from "../../core/scope";
import type { TPowerKContext, TPowerKPageType } from "../../core/types";
import { PowerKModalSearchResults } from "./search-results";
// services init
const workspaceService = new WorkspaceService();

type Props = {
  activePage: TPowerKPageType | null;
  context: TPowerKContext;
  isWorkspaceLevel: boolean;
  searchTerm: string;
  updateSearchTerm: (value: string) => void;
  handleSearchMenuClose?: () => void;
  scope?: TPowerKScope;
  onResultClick?: (kind: string, label: string, id: string, path: string) => void;
};

export function PowerKModalSearchMenu(props: Props) {
  const {
    activePage,
    context,
    isWorkspaceLevel,
    searchTerm,
    updateSearchTerm,
    handleSearchMenuClose,
    scope,
    onResultClick,
  } = props;
  // states
  const [resultsCount, setResultsCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<IWorkspaceSearchResults>(WORKSPACE_DEFAULT_SEARCH_RESULT);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  // navigation
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { togglePowerKModal } = usePowerK();

  useEffect(() => {
    if (activePage || !workspaceSlug) return;
    setIsSearching(true);

    if (debouncedSearchTerm) {
      workspaceService
        .searchWorkspace(workspaceSlug.toString(), {
          ...(projectId ? { project_id: projectId.toString() } : {}),
          search: debouncedSearchTerm,
          workspace_search: !projectId ? true : isWorkspaceLevel,
        })
        .then((results) => {
          setResults(results);
          const count = Object.keys(results.results).reduce(
            (accumulator, key) => results.results[key as keyof typeof results.results]?.length + accumulator,
            0
          );
          setResultsCount(count);
        })
        .catch(() => {
          setResults(WORKSPACE_DEFAULT_SEARCH_RESULT);
          setResultsCount(0);
        })
        .finally(() => setIsSearching(false));
    } else {
      setResults(WORKSPACE_DEFAULT_SEARCH_RESULT);
      setIsSearching(false);
    }
  }, [debouncedSearchTerm, isWorkspaceLevel, projectId, workspaceSlug, activePage]);

  if (activePage) return null;

  const handleClosePalette = () => {
    handleSearchMenuClose?.();
    togglePowerKModal(false);
  };

  // When Ask AI is rendering above these results (scope "all" / "ai" in the
  // top-nav variant), it owns the empty state. Suppress the "No results found"
  // placeholder so we don't show a redundant "search found nothing" row beneath
  // an AI answer.
  const askAIOwnsEmptyState = scope === "all" || scope === "ai";

  return (
    <>
      {/* Show empty state only when not loading, no results, and Ask AI isn't already covering it */}
      {!isSearching &&
        resultsCount === 0 &&
        searchTerm.trim() !== "" &&
        debouncedSearchTerm.trim() !== "" &&
        !askAIOwnsEmptyState && (
          <PowerKModalNoSearchResultsCommand
            context={context}
            searchTerm={searchTerm}
            updateSearchTerm={updateSearchTerm}
          />
        )}

      {searchTerm.trim() !== "" && (
        <PowerKModalSearchResults
          closePalette={handleClosePalette}
          results={results}
          scope={scope}
          onResultClick={onResultClick}
        />
      )}
    </>
  );
}

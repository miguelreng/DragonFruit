/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPowerKScope } from "../../core/scope";
import type { TPowerKCommandConfig, TPowerKContext, TPowerKPageType } from "../../core/types";
import { PowerKModalPagesList } from "../pages";
import { PowerKContextBasedPagesList } from "../pages/context-based";
import { PowerKAskAISection } from "./ask-ai-section";
import { PowerKModalSearchMenu } from "./search-menu";

export type TPowerKCommandsListProps = {
  activePage: TPowerKPageType | null;
  context: TPowerKContext;
  handleCommandSelect: (command: TPowerKCommandConfig) => void;
  handlePageDataSelection: (data: unknown) => void;
  isWorkspaceLevel: boolean;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  handleSearchMenuClose?: () => void;
  scope?: TPowerKScope;
  onResultClick?: (kind: string, label: string, id: string, path: string) => void;
  /**
   * Suppress the internal Ask AI section. The top-nav variant renders its own
   * Ask AI above the search results so it can be controlled by the scope chips;
   * the standalone modal wrapper still lets this component render Ask AI inline.
   */
  hideAskAI?: boolean;
};

export function ProjectsAppPowerKCommandsList(props: TPowerKCommandsListProps) {
  const {
    activePage,
    context,
    handleCommandSelect,
    handlePageDataSelection,
    isWorkspaceLevel,
    searchTerm,
    setSearchTerm,
    handleSearchMenuClose,
    scope,
    onResultClick,
    hideAskAI,
  } = props;

  return (
    <>
      <PowerKModalSearchMenu
        activePage={activePage}
        context={context}
        isWorkspaceLevel={!context.params.projectId || isWorkspaceLevel}
        searchTerm={searchTerm}
        updateSearchTerm={setSearchTerm}
        handleSearchMenuClose={handleSearchMenuClose}
        scope={scope}
        onResultClick={onResultClick}
      />
      {!activePage && !hideAskAI && (
        <PowerKAskAISection
          workspaceSlug={context.params.workspaceSlug?.toString()}
          searchTerm={searchTerm}
        />
      )}
      <PowerKContextBasedPagesList
        activeContext={context.activeContext}
        activePage={activePage}
        handleSelection={handlePageDataSelection}
      />
      <PowerKModalPagesList
        activePage={activePage}
        context={context}
        onPageDataSelect={handlePageDataSelection}
        onCommandSelect={handleCommandSelect}
      />
    </>
  );
}

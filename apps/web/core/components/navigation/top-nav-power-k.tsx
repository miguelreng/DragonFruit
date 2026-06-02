/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { Command } from "cmdk";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// hooks
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
// power-k
import type { TPowerKScope } from "@/components/power-k/core/scope";
import type { TPowerKCommandConfig, TPowerKContext } from "@/components/power-k/core/types";
import { usePowerKRecents, type TPowerKRecentItem } from "@/components/power-k/hooks/use-power-k-recents";
import { PowerKAskAISection } from "@/components/power-k/ui/modal/ask-ai-section";
import { ProjectsAppPowerKCommandsList } from "@/components/power-k/ui/modal/commands-list";
import { PowerKModalFooter } from "@/components/power-k/ui/modal/footer";
import { PowerKRecentsSection } from "@/components/power-k/ui/modal/recents-section";
import { PowerKScopeChips } from "@/components/power-k/ui/modal/scope-chips";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { usePowerK } from "@/hooks/store/use-power-k";
import { useUser } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { useExpandableSearch } from "@/hooks/use-expandable-search";
import { useTopBarTheme } from "@/hooks/use-top-bar-theme";

export const TopNavPowerK = observer(() => {
  // router
  const router = useAppRouter();
  const params = useParams();
  const { projectId: routerProjectId, workItem: workItemIdentifier } = params;

  // states
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCommand, setActiveCommand] = useState<TPowerKCommandConfig | null>(null);
  const [shouldShowContextBasedActions, setShouldShowContextBasedActions] = useState(true);
  const [isWorkspaceLevel, setIsWorkspaceLevel] = useState(false);
  const [scope, setScope] = useState<TPowerKScope>("all");
  // recents
  const { recents, pins, recordVisit, togglePin, isPinned } = usePowerKRecents();

  // store hooks
  const { activeContext, setActivePage, activePage, setTopNavInputRef } = usePowerK();
  const { data: currentUser } = useUser();
  const surfaceTheme = useTopBarTheme();

  const handleOnClose = useCallback(() => {
    setSearchTerm("");
    setActivePage(null);
    setActiveCommand(null);
    setScope("all");
  }, [setSearchTerm, setActivePage, setActiveCommand]);

  const handleResultClick = useCallback(
    (kind: string, label: string, id: string, path: string) => {
      if (!label) return;
      recordVisit({ id, label, path, kind });
    },
    [recordVisit]
  );

  // expandable search hook
  const {
    isOpen,
    containerRef,
    inputRef,
    handleClose: closePanel,
    handleMouseDown,
    handleFocus,
    openPanel,
  } = useExpandableSearch({
    onClose: handleOnClose,
  });

  const handleRecentSelect = useCallback(
    (item: TPowerKRecentItem) => {
      closePanel();
      router.push(item.path);
    },
    [closePanel, router]
  );

  // derived values
  const {
    issue: { getIssueById, getIssueIdByIdentifier },
  } = useIssueDetail();

  const workItemId = workItemIdentifier ? getIssueIdByIdentifier(workItemIdentifier.toString()) : undefined;
  const workItemDetails = workItemId ? getIssueById(workItemId) : undefined;
  const projectId: string | string[] | undefined | null = routerProjectId ?? workItemDetails?.project_id;

  // Build command context
  const context: TPowerKContext = useMemo(
    () => ({
      currentUserId: currentUser?.id,
      activeCommand,
      activeContext,
      shouldShowContextBasedActions,
      setShouldShowContextBasedActions,
      params: {
        ...params,
        projectId,
      },
      router,
      closePalette: closePanel,
      setActiveCommand,
      setActivePage,
    }),
    [
      currentUser?.id,
      activeCommand,
      activeContext,
      shouldShowContextBasedActions,
      params,
      projectId,
      router,
      setActivePage,
      closePanel,
    ]
  );

  // Register input ref with PowerK store for keyboard shortcut access
  useEffect(() => {
    setTopNavInputRef(inputRef);
    return () => {
      setTopNavInputRef(null);
    };
  }, [setTopNavInputRef, inputRef]);

  const handleClear = () => {
    setSearchTerm("");
    inputRef.current?.focus();
  };

  // Handle command selection
  const handleCommandSelect = useCallback(
    (command: TPowerKCommandConfig) => {
      if (command.type === "action") {
        command.action(context);
        // Always close on command selection
        context.closePalette();
      } else if (command.type === "change-page") {
        context.setActiveCommand(command);
        setActivePage(command.page);
        setSearchTerm("");
      }
    },
    [context, setActivePage]
  );

  // Handle selection page item selection
  const handlePageDataSelection = useCallback(
    (data: unknown) => {
      if (context.activeCommand?.type === "change-page") {
        context.activeCommand.onSelect(data, context);
      }
      // Always close on page data selection
      context.closePalette();
    },
    [context]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cmd/Ctrl+K closes the search dropdown
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        closePanel();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (searchTerm) {
          setSearchTerm("");
        }
        closePanel();
        return;
      }

      if (e.key === "Backspace" && !searchTerm) {
        if (activePage) {
          e.preventDefault();
          setActivePage(null);
          context.setActiveCommand(null);
        } else if (shouldShowContextBasedActions) {
          // Optional: logic to hide context actions if desired, similar to wrapper
          context.setShouldShowContextBasedActions(false);
        }
        return;
      }

      // Arrow down/up keys to navigate command items
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && isOpen) {
        e.preventDefault();
        // Get the Command.List element
        const commandList = containerRef.current?.querySelector("[cmdk-list]") as HTMLElement;
        if (commandList) {
          // Create and dispatch a keyboard event on the list to trigger cmdk navigation
          const syntheticEvent = new KeyboardEvent("keydown", {
            key: e.key,
            bubbles: true,
            cancelable: true,
          });
          commandList.dispatchEvent(syntheticEvent);

          // Also try to focus the first/selected item
          if (e.key === "ArrowDown") {
            const firstItem = commandList.querySelector('[cmdk-item]:not([aria-disabled="true"])') as HTMLElement;
            if (firstItem) {
              firstItem.focus();
            }
          }
        }
        return;
      }

      // Enter key to execute selected command
      if (e.key === "Enter" && isOpen) {
        e.preventDefault();
        // Find the currently selected/focused item
        const selectedItem = containerRef.current?.querySelector('[cmdk-item][aria-selected="true"]') as HTMLElement;
        if (selectedItem) {
          // Trigger click on the selected item
          selectedItem.click();
        }
        return;
      }
    },
    // reason: containerRef accessed only inside the callback; safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchTerm, activePage, context, shouldShowContextBasedActions, setActivePage, closePanel, isOpen]
  );

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn("relative z-30 flex w-[364px] items-center transition-all duration-300 ease-in-out", {
          "w-[554px]": isOpen,
        })}
      >
        <div
          className={cn(
            "flex h-7 w-full items-center rounded-lg border border-[color:var(--power-k-ai-bar-border)] bg-[image:var(--power-k-ai-bar-bg)] p-2 text-[color:var(--power-k-ai-bar-text)] shadow-[var(--power-k-ai-bar-shadow)] transition-colors duration-200",
            {
              "bg-[image:var(--power-k-ai-bar-bg-active)]": isOpen,
            }
          )}
          onClick={(e) => {
            // Only open on real user clicks — extensions probing the input
            // dispatch synthetic clicks/focuses, which used to pop the panel
            // when the AI settings page (with its password field) mounted.
            if (!e.nativeEvent.isTrusted) return;
            inputRef.current?.focus();
            if (!isOpen) openPanel();
          }}
          onKeyDown={(e) => {
            if (!e.nativeEvent.isTrusted) return;
            // Only treat Enter/Space as button activation when the wrapper itself
            // is focused — otherwise we eat the space character the user is
            // trying to type into the inner input.
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.focus();
              if (!isOpen) openPanel();
            }
          }}
          // reason: wrapper contains an input + clear button, can't be a real <button>; focus delegated to inner input
          // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
          role="button"
          tabIndex={-1}
        >
          <SearchIcon className="mr-2 size-3.5 shrink-0 text-[color:var(--power-k-ai-bar-muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => {
              // Ignore synthetic events from browser extensions (password managers
              // probe nearby inputs when a password field mounts — e.g. on the AI
              // settings page — which was popping the panel on navigation).
              if (!e.nativeEvent.isTrusted) return;
              setSearchTerm(e.target.value);
              if (!isOpen) openPanel();
            }}
            onMouseDown={handleMouseDown}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-13 text-[color:var(--power-k-ai-bar-text)] outline-none placeholder:text-[color:var(--power-k-ai-bar-placeholder)]"
          />
          {searchTerm ? (
            <button type="button" onClick={handleClear} className="ml-2 shrink-0">
              <CloseIcon className="size-3.5 text-[color:var(--power-k-ai-bar-muted)] hover:text-[color:var(--power-k-ai-bar-text)]" />
            </button>
          ) : (
            !isOpen && (
              <kbd className="font-sans ml-2 shrink-0 rounded border border-[color:var(--power-k-ai-bar-border)] bg-layer-transparent-hover px-1.5 py-0.5 text-11 text-[color:var(--power-k-ai-bar-muted)]">
                ⌘ K
              </kbd>
            )
          )}
        </div>
      </div>
      <div
        className={cn(
          "absolute -top-[6px] left-1/2 z-20 -translate-x-1/2 overflow-hidden transition-[width,max-height] duration-300 ease-in-out",
          {
            "max-h-[80vh] w-[570px]": isOpen,
            "max-h-0 w-0": !isOpen,
          }
        )}
      >
        <div
          data-theme={surfaceTheme}
          data-open={isOpen ? true : undefined}
          data-origin="top-center"
          className="t-dropdown flex w-full flex-col overflow-hidden rounded-[18px] border-[0.5px] border-strong bg-surface-1 px-2 pt-10 pb-2 text-primary shadow-raised-200"
        >
          {isOpen && (
            <Command
              filter={(i18nValue: string, search: string) => {
                if (i18nValue === "no-results") return 1;
                if (i18nValue.toLowerCase().includes(search.toLowerCase())) return 1;
                return 0;
              }}
              shouldFilter={searchTerm.length > 0}
              className="flex h-full w-full flex-col"
            >
              <Command.Input value={searchTerm} hidden />
              <PowerKScopeChips scope={scope} onChange={setScope} />
              <Command.List className="vertical-scrollbar scrollbar-sm max-h-[60vh] overflow-y-auto px-2 pb-4 outline-none">
                {searchTerm.trim() === "" && scope !== "ai" && (
                  <PowerKRecentsSection
                    recents={recents}
                    pins={pins}
                    isPinned={isPinned}
                    onSelect={handleRecentSelect}
                    onTogglePin={togglePin}
                  />
                )}
                {(scope === "ai" || (searchTerm.trim() !== "" && scope === "all")) && (
                  <PowerKAskAISection workspaceSlug={params.workspaceSlug?.toString()} searchTerm={searchTerm} />
                )}
                {scope !== "ai" && (
                  <ProjectsAppPowerKCommandsList
                    activePage={activePage}
                    context={context}
                    handleCommandSelect={handleCommandSelect}
                    handlePageDataSelection={handlePageDataSelection}
                    isWorkspaceLevel={isWorkspaceLevel}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    handleSearchMenuClose={() => closePanel()}
                    scope={scope}
                    onResultClick={handleResultClick}
                    hideAskAI
                  />
                )}
              </Command.List>
              <PowerKModalFooter
                isWorkspaceLevel={isWorkspaceLevel}
                projectId={context.params.projectId?.toString()}
                onWorkspaceLevelChange={setIsWorkspaceLevel}
              />
            </Command>
          )}
        </div>
      </div>
    </div>
  );
});

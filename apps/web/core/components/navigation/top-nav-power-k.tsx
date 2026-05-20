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
import type { TPowerKCommandConfig, TPowerKContext } from "@/components/power-k/core/types";
import { ProjectsAppPowerKCommandsList } from "@/components/power-k/ui/modal/commands-list";
import { PowerKModalFooter } from "@/components/power-k/ui/modal/footer";
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

  // store hooks
  const { activeContext, setActivePage, activePage, setTopNavInputRef } = usePowerK();
  const { data: currentUser } = useUser();
  // top bar theme — dropdown matches the frame, not the page
  const topBarTheme = useTopBarTheme();

  const handleOnClose = useCallback(() => {
    setSearchTerm("");
    setActivePage(null);
    setActiveCommand(null);
  }, [setSearchTerm, setActivePage, setActiveCommand]);

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
            "flex h-7 w-full items-center rounded-lg border border-white/10 bg-white/5 p-2 transition-colors duration-200 dark:border-black/10 dark:bg-black/5",
            {
              "bg-white/10 dark:bg-black/10": isOpen,
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
          <SearchIcon className="mr-2 size-3.5 shrink-0 text-white/50 dark:text-black/50" />
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
            className="min-w-0 flex-1 bg-transparent text-13 text-white outline-none placeholder:text-white/50 dark:text-black dark:placeholder:text-black/50"
          />
          {searchTerm ? (
            <button type="button" onClick={handleClear} className="ml-2 shrink-0">
              <CloseIcon className="size-3.5 text-white/60 hover:text-white dark:text-black/60 dark:hover:text-black" />
            </button>
          ) : (
            !isOpen && (
              <kbd className="font-sans ml-2 shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-11 text-white/60 dark:border-black/10 dark:bg-black/5 dark:text-black/60">
                ⌘ K
              </kbd>
            )
          )}
        </div>
      </div>
      <div
        data-theme={topBarTheme}
        className={cn(
          "shadow-lg absolute -top-[6px] left-1/2 z-20 flex -translate-x-1/2 flex-col overflow-hidden rounded-md border border-subtle bg-surface-1 px-0 pt-10 text-primary transition-all duration-300 ease-in-out",
          {
            "max-h-[80vh] w-[574px] opacity-100": isOpen,
            "h-0 w-0 opacity-0": !isOpen,
          }
        )}
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
            {/* We can skip the header input since we have the main input above,
                     but we might need the context indicator if we want that feature.
                     For now, let's just render the list. */}

            <Command.List className="vertical-scrollbar scrollbar-sm max-h-[60vh] overflow-y-auto px-2 pb-4 outline-none">
              <ProjectsAppPowerKCommandsList
                activePage={activePage}
                context={context}
                handleCommandSelect={handleCommandSelect}
                handlePageDataSelection={handlePageDataSelection}
                isWorkspaceLevel={isWorkspaceLevel}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                handleSearchMenuClose={() => closePanel()}
              />
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
  );
});

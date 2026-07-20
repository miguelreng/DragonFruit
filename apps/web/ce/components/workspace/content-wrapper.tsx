/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
import type { TPage } from "@plane/types";
import {
  AgentChatDrawer,
  REPLY_TO_SELECTION_EVENT,
  consumeAtlasComposerFocus,
  requestAtlasComposerFocus,
  setPendingReplyContext,
  type ReplyToSelectionDetail,
  useActiveDocPageId,
} from "@/components/agent-chat";
import { cn } from "@plane/utils";
import { AppRailRoot, MobileRailDrawer } from "@/components/navigation";
import { ScrollShadowController } from "@/components/core/scroll-shadow-controller";
import {
  Calendar,
  Bookmark,
  File as FileIcon,
  FileText,
  Folder,
  GridIconShim,
  LayoutGrid,
  PanelRight,
  StickyNote,
  Whiteboard,
} from "@/components/icons/lucide-shim";
import { ViewsIcon, WorkItemsIcon } from "@/components/icons/propel-shim";
import { isTypingInInput } from "@/components/power-k/core/shortcut-handler";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useProject } from "@/hooks/store/use-project";
import useSize from "@/hooks/use-window-size";
import { useAppRailVisibility } from "@/lib/app-rail";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";

// Matches Tailwind's `md` breakpoint — below this the rail becomes a drawer.
const MOBILE_BREAKPOINT = 768;

export const WorkspaceContentWrapper = observer(function WorkspaceContentWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use the context to determine if app rail should render
  const {
    isEnabled: isAppRailEnabled,
    isMobileDrawerOpen,
    openMobileDrawer,
    closeMobileDrawer,
  } = useAppRailVisibility();
  const {
    agentChatOpen,
    toggleAgentChat,
    atlasSidebarCollapsed,
    toggleAtlasSidebar,
    atlasSidebarExpanded,
    toggleAtlasSidebarExpanded,
  } = useAppTheme();
  const [windowWidth] = useSize();
  const pathname = usePathname();
  const { pageId: routePageId, projectId: routeProjectId } = useParams();
  const activeDocPageId = useActiveDocPageId();
  const projectPages = usePageStore(EPageStoreType.PROJECT);
  const { getProjectById } = useProject();
  const isMobile = windowWidth < MOBILE_BREAKPOINT;
  const currentPageId = routePageId?.toString() ?? activeDocPageId;
  const currentPage = currentPageId ? projectPages.getPageById(currentPageId) : undefined;
  const currentProject = routeProjectId ? getProjectById(routeProjectId.toString()) : undefined;
  const activeView = getActiveViewMeta(pathname, currentPage, currentProject?.name);
  // Full-width focus mode: Atlas becomes the primary workspace. The active
  // content collapses into a single left rail control that restores the split
  // view, rather than rendering an unusably narrow page preview.
  const atlasFull = agentChatOpen && atlasSidebarExpanded && !atlasSidebarCollapsed;
  const desktopAtlasFull = atlasFull && !isMobile;
  const contentPreviewRef = useRef<HTMLDivElement>(null);

  // `inert` removes the hidden content controls from sequential
  // keyboard navigation. The current React type package does not expose the
  // native attribute yet, so set it directly on the DOM element.
  useEffect(() => {
    const contentPreview = contentPreviewRef.current;
    if (!contentPreview) return;
    if (desktopAtlasFull) contentPreview.setAttribute("inert", "");
    else contentPreview.removeAttribute("inert");
  }, [desktopAtlasFull]);

  // Close the drawer whenever the route changes so navigating away dismisses it.
  useEffect(() => {
    if (isMobileDrawerOpen) closeMobileDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Cmd/Ctrl+Shift+A toggles the docked Atlas sidebar.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (typeof event.key !== "string" || isTypingInInput(event.target)) return;

      const isAskAtlasShortcut = (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "a";
      if (!isAskAtlasShortcut) return;

      event.preventDefault();
      // Desktop: Atlas is permanently docked, so the shortcut collapses it to a
      // rail / expands it back. Mobile: it opens the dismissible overlay.
      if (window.innerWidth >= MOBILE_BREAKPOINT) {
        toggleAtlasSidebar();
      } else {
        toggleAgentChat(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleAgentChat, toggleAtlasSidebar]);

  // Focus the Atlas composer when the sidebar becomes visible — opening the
  // drawer or expanding the collapsed rail. Transition-gated (ref tracks the
  // previous value) so a persisted-open sidebar doesn't steal focus from the
  // page on load. On a first-ever open the composer mounts a beat later
  // (sessions load async), so a pending-focus flag is left for it to consume
  // on mount when the direct attempt below finds nothing yet.
  const atlasVisible = agentChatOpen && !(atlasSidebarCollapsed && !isMobile);
  const prevAtlasVisibleRef = useRef(atlasVisible);
  useEffect(() => {
    const wasVisible = prevAtlasVisibleRef.current;
    prevAtlasVisibleRef.current = atlasVisible;
    if (!atlasVisible || wasVisible) return;
    requestAtlasComposerFocus();
    const composer = document.querySelector<HTMLTextAreaElement>("[data-atlas-composer]");
    if (!composer) return; // not mounted yet — the pending flag covers it
    consumeAtlasComposerFocus();
    composer.focus();
  }, [atlasVisible]);

  // Editor → Atlas bridges. The page editor lives in `packages/editor` and
  // can't reach the host stores, so it dispatches window events: "reply to
  // selection" (bubble menu) pins the highlighted passage as context, and the
  // `/agent` slash command just opens Atlas. Both live here (always mounted)
  // because the drawer mounts lazily and would miss the event that opens it.
  useEffect(() => {
    const onReplyToSelection = (event: Event) => {
      const detail = (event as CustomEvent<ReplyToSelectionDetail>).detail;
      if (!detail?.text) return;
      setPendingReplyContext({ text: detail.text, from: detail.from, to: detail.to });
      toggleAgentChat(true);
    };
    const onAgentInvoke = () => toggleAgentChat(true);
    window.addEventListener(REPLY_TO_SELECTION_EVENT, onReplyToSelection);
    window.addEventListener("dragonfruit:agent-invoke", onAgentInvoke);
    return () => {
      window.removeEventListener(REPLY_TO_SELECTION_EVENT, onReplyToSelection);
      window.removeEventListener("dragonfruit:agent-invoke", onAgentInvoke);
    };
  }, [toggleAgentChat]);

  return (
    <div className="bg-gray-200 relative flex size-full gap-2 overflow-hidden p-2 transition-all duration-300 ease-in-out">
      <ScrollShadowController />
      {isAppRailEnabled &&
        (isMobile ? (
          <MobileRailDrawer open={isMobileDrawerOpen} onOpen={openMobileDrawer} onClose={closeMobileDrawer}>
            <AppRailRoot isMobile />
          </MobileRailDrawer>
        ) : (
          <AppRailRoot />
        ))}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative flex size-full min-h-0 gap-0.5 overflow-hidden">
          {/* Full mode preserves the content's place with a single affordance,
              not a miniature, non-functional version of the page. */}
          <div
            ref={contentPreviewRef}
            className={cn(
              "shadow-sm relative min-h-0 flex-grow overflow-hidden rounded-[18px] border border-subtle bg-surface-1 transition-all duration-300 ease-in-out",
              desktopAtlasFull && "md:pointer-events-none md:invisible md:w-0 md:border-0 md:opacity-0"
            )}
            style={desktopAtlasFull ? { flex: "0 0 0" } : undefined}
            aria-hidden={desktopAtlasFull ? true : undefined}
          >
            {children}
          </div>
          {desktopAtlasFull && (
            <ContentPreviewRail
              label={activeView.label}
              icon={activeView.icon}
              onExpand={() => toggleAtlasSidebarExpanded(false)}
            />
          )}
          {agentChatOpen && (
            <div
              className={cn(
                "shadow-sm absolute top-0 right-0 z-30 h-full overflow-hidden rounded-[18px] border border-subtle bg-surface-1 shadow-raised-300",
                "w-[min(560px,calc(100%-24px))]",
                // Desktop: docked sibling of the content. Collapses to a slim
                // rail with the same width curve as the left app rail (250ms,
                // standard ease) — the panel reveals/hides as the width animates.
                // In the expanded tier, Atlas fills the space beside the
                // content rail; the collapsed Atlas rail always wins over it.
                "md:shadow-sm md:relative md:z-auto md:flex-shrink-0 md:transition-[width] md:duration-[250ms] md:ease-[cubic-bezier(0.22,1,0.36,1)]",
                atlasSidebarCollapsed
                  ? "md:w-[3.25rem]"
                  : atlasSidebarExpanded
                    ? "md:min-w-0 md:flex-1"
                    : "md:w-[350px]"
              )}
              data-open="true"
              // Stable hook for focus (zen) mode: globals.css lifts the open
              // drawer above the zen canvas, and the editor's Esc handler
              // skips exiting while focus is inside it.
              data-atlas-drawer="true"
            >
              {/* The drawer stays mounted across collapse, so expanding is a
                  pure width reveal (matching the left rail) with no entrance
                  replay and the chat state preserved. At the default tier it
                  keeps a fixed 350px so it doesn't reflow while the container
                  animates to/from the rail (the rail overlay covers the
                  clipped panel while collapsed); in full mode it tracks the
                  container (w-full) — rail transitions reflow there, which the
                  centered chat column absorbs gracefully. */}
              <div
                className={cn(
                  "h-full w-full md:transition-[width] md:duration-[250ms] md:ease-[cubic-bezier(0.22,1,0.36,1)]",
                  atlasSidebarExpanded ? "md:w-full" : "md:w-[350px]",
                  // Covered by the rail while collapsed — `invisible` also pulls
                  // the chat controls out of the tab order / a11y tree.
                  atlasSidebarCollapsed && !isMobile && "pointer-events-none invisible"
                )}
                aria-hidden={atlasSidebarCollapsed && !isMobile ? true : undefined}
              >
                <AgentChatDrawer
                  dismissible={isMobile}
                  onCollapse={isMobile ? undefined : () => toggleAtlasSidebar(true)}
                  isExpanded={!isMobile && atlasSidebarExpanded}
                  onToggleExpand={isMobile ? undefined : () => toggleAtlasSidebarExpanded()}
                />
              </div>
              {atlasSidebarCollapsed && !isMobile && <AtlasSidebarRail onExpand={() => toggleAtlasSidebar(false)} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Collapsed Atlas sidebar — a slim, full-height rail that expands the panel
 * back on click (accordion-style). The same sidebar-toggle icon used to
 * collapse sits up top; the brand mark anchors the bottom. The whole rail is
 * one large click target.
 */
function AtlasSidebarRail({ onExpand }: { onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label="Expand Atlas"
      title="Expand Atlas"
      className="t-press group absolute inset-0 z-10 flex flex-col items-center bg-surface-1 pb-3 text-tertiary"
    >
      {/* Toggle sits in a 56px zone so its centerline (28px) matches the
          expanded Atlas header baseline — no vertical jump on expand. */}
      <span className="flex h-14 items-center">
        <span className="grid size-7 place-items-center rounded-md transition-colors group-hover:bg-layer-1 group-hover:text-secondary">
          <PanelRight className="size-4" />
        </span>
      </span>
      <span className="mt-auto grid size-9 place-items-center">
        <img src="/atlas-dragon.svg" alt="Atlas" className="size-5 dark:invert" />
      </span>
    </button>
  );
}

/** The full-width Atlas mode keeps one compact path back to the active page. */
function ContentPreviewRail({ label, icon, onExpand }: { label: string; icon: React.ReactNode; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`Show ${label}`}
      title={`Show ${label}`}
      className="t-press group shadow-sm relative flex h-full w-[3.25rem] shrink-0 flex-col items-center rounded-[18px] border border-subtle bg-surface-1 pb-3 text-tertiary"
    >
      <span className="flex h-14 items-center">
        <span className="grid size-7 place-items-center rounded-md transition-colors group-hover:bg-layer-1 group-hover:text-secondary">
          {icon}
        </span>
      </span>
      <span className="font-sans pointer-events-none absolute top-1/2 left-1/2 max-w-[calc(100dvh-8rem)] -translate-x-1/2 -translate-y-1/2 -rotate-90 overflow-hidden text-[12.5px] leading-none font-semibold text-ellipsis whitespace-nowrap text-placeholder opacity-75 transition-[color,opacity] group-hover:text-secondary group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}

function getActiveViewMeta(pathname: string, page: TPage | undefined, projectName: string | undefined) {
  if (page) {
    const pageType = page.page_type ?? "doc";
    const icon =
      pageType === "pdf" ? (
        <FileIcon className="size-4" />
      ) : pageType === "whiteboard" ? (
        <Whiteboard className="size-4" />
      ) : pageType === "sheet" ? (
        <GridIconShim className="size-4" />
      ) : pageType === "folder" ? (
        <Folder className="size-4" />
      ) : (
        <FileText className="size-4" />
      );
    return { label: page.name?.trim() || "Untitled", icon };
  }

  const withProjectName = (label: string) => (projectName ? `${label} - ${projectName}` : label);

  if (pathname.includes("/brief")) return { label: withProjectName("Brief"), icon: <FileText className="size-4" /> };
  if (pathname.includes("/calendar"))
    return { label: withProjectName("Calendar"), icon: <Calendar className="size-4" /> };
  if (pathname.includes("/issues") || pathname.includes("/intake"))
    return { label: withProjectName("Tasks"), icon: <WorkItemsIcon className="size-4" /> };
  if (pathname.includes("/views")) return { label: withProjectName("Views"), icon: <ViewsIcon className="size-4" /> };
  if (pathname.includes("/bookmarks"))
    return { label: withProjectName("Bookmarks"), icon: <Bookmark className="size-4" /> };
  if (pathname.includes("/whiteboards"))
    return { label: withProjectName("Whiteboards"), icon: <Whiteboard className="size-4" /> };
  if (pathname.includes("/stickies"))
    return { label: withProjectName("Stickies"), icon: <StickyNote className="size-4" /> };
  if (pathname.includes("/docs") || pathname.includes("/pages"))
    return { label: withProjectName("Docs"), icon: <FileText className="size-4" /> };
  if (pathname.includes("/projects"))
    return { label: withProjectName("Projects"), icon: <Folder className="size-4" /> };
  return { label: "Workspace", icon: <LayoutGrid className="size-4" /> };
}

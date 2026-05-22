/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { CollaborationState, EditorRefApi } from "@plane/editor";
import type { TDocumentPayload, TPage, TPageVersion, TWebhookConnectionQueryParams } from "@plane/types";
// hooks
import { usePageFallback } from "@/hooks/use-page-fallback";
import { useUnsyncedPageTracker } from "@/hooks/use-unsynced-page-tracker";
// plane web import
import type { PageUpdateHandler, TCustomEventHandlers } from "@/hooks/use-realtime-page-events";
import { PageModals } from "@/plane-web/components/pages";
import { usePagesPaneExtensions, useExtendedEditorProps } from "@/plane-web/hooks/pages";
import type { EPageStoreType } from "@/plane-web/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageNavigationPaneRoot } from "../navigation-pane";
import { PageVersionsOverlay } from "../version";
import { PagesVersionEditor } from "../version/editor";
import { ContentLimitBanner } from "./content-limit-banner";
import type { TEditorBodyConfig, TEditorBodyHandlers } from "./editor-body";
import { PageEditorToolbarRoot } from "./toolbar";

// Lazy-load the two heaviest editor surfaces.
//   - PageEditorBody pulls in Tiptap + lowlight + every registered
//     highlight.js language (~1.3 MB chunk).
//   - TldrawEditor pulls in the tldraw canvas runtime + its CSS
//     (~1.5 MB across two chunks).
// Doc/whiteboard pages are reached from the sidebar; everything else
// (issues list, projects, settings, calendar) shouldn't pay for them
// on first paint.
const PageEditorBody = lazy(() => import("./editor-body").then((m) => ({ default: m.PageEditorBody })));
const TldrawEditor = lazy(() => import("../whiteboard/tldraw-editor").then((m) => ({ default: m.TldrawEditor })));

// HMR (React Refresh + Vite) invalidates and re-evaluates chunks on every
// save. When a chunk that backs a `React.lazy` is invalidated, the lazy
// promise transitions through `pending` during the next refresh — and React
// 18 throws "A component suspended while responding to synchronous input"
// because the refresh path itself is synchronous. Production builds never
// hit this (no HMR), so we just warm both chunks at module-load in dev:
// React Refresh always finds them resolved, Suspense never re-fires, the
// warning never appears.
if (import.meta.env.DEV) {
  void import("./editor-body");
  void import("../whiteboard/tldraw-editor");
}

const EditorFallback = () => (
  <div className="text-sm flex h-full w-full items-center justify-center text-tertiary">Loading editor…</div>
);

export type TPageRootHandlers = {
  create: (payload: Partial<TPage>) => Promise<Partial<TPage> | undefined>;
  fetchAllVersions: (pageId: string) => Promise<TPageVersion[] | undefined>;
  fetchDescriptionBinary: () => Promise<ArrayBuffer>;
  fetchVersionDetails: (pageId: string, versionId: string) => Promise<TPageVersion | undefined>;
  restoreVersion: (pageId: string, versionId: string) => Promise<void>;
  updateDescription: (document: TDocumentPayload) => Promise<void>;
} & TEditorBodyHandlers;

export type TPageRootConfig = TEditorBodyConfig;

type TPageRootProps = {
  config: TPageRootConfig;
  handlers: TPageRootHandlers;
  page: TPageInstance;
  storeType: EPageStoreType;
  webhookConnectionParams: TWebhookConnectionQueryParams;
  projectId?: string;
  workspaceSlug: string;
  customRealtimeEventHandlers?: TCustomEventHandlers;
};

export const PageRoot = observer(function PageRoot(props: TPageRootProps) {
  const {
    config,
    handlers,
    page,
    projectId,
    storeType,
    webhookConnectionParams,
    workspaceSlug,
    customRealtimeEventHandlers,
  } = props;
  // states
  const [editorReady, setEditorReady] = useState(false);
  const [collaborationState, setCollaborationState] = useState<CollaborationState | null>(null);
  const [showContentTooLargeBanner, setShowContentTooLargeBanner] = useState(false);
  // refs
  const editorRef = useRef<EditorRefApi>(null);
  // derived values
  const {
    isContentEditable,
    view_props,
    editor: { setEditorRef },
  } = page;
  const isFocusMode = Boolean(view_props?.focus_mode);
  // page fallback
  const { isFetchingFallbackBinary } = usePageFallback({
    editorRef,
    fetchPageDescription: handlers.fetchDescriptionBinary,
    page,
    collaborationState,
    updatePageDescription: handlers.updateDescription,
  });

  // Track local unsynced edits so the Drafts page can surface them.
  useUnsyncedPageTracker({
    pageId: page.id,
    pageName: page.name,
    workspaceSlug,
    projectId,
    collaborationState,
  });

  const handleEditorReady = useCallback(
    (status: boolean) => {
      setEditorReady(status);
      if (editorRef.current && !page.editor.editorRef) {
        setEditorRef(editorRef.current);
      }
    },
    [page.editor.editorRef, setEditorRef]
  );

  useEffect(() => {
    setTimeout(() => {
      setEditorRef(editorRef.current);
    }, 0);
  }, [isContentEditable, setEditorRef]);

  // Get extensions and navigation logic from hook
  const {
    editorExtensionHandlers,
    navigationPaneExtensions,
    handleOpenNavigationPane,
    handleCloseNavigationPane,
    isNavigationPaneOpen,
  } = usePagesPaneExtensions({
    page,
    editorRef,
  });

  // Type-safe error handler for content too large errors
  const errorHandler: PageUpdateHandler<"error"> = (params) => {
    const { data } = params;

    // Check if it's content too large error
    if (data.error_code === "content_too_large") {
      setShowContentTooLargeBanner(true);
    }

    // Call original error handler if exists
    customRealtimeEventHandlers?.error?.(params);
  };

  const mergedCustomEventHandlers: TCustomEventHandlers = {
    ...customRealtimeEventHandlers,
    error: errorHandler,
  };

  // Get extended editor extensions configuration
  const extendedEditorProps = useExtendedEditorProps({
    workspaceSlug,
    page,
    storeType,
    fetchEntity: handlers.fetchEntity,
    getRedirectionLink: handlers.getRedirectionLink,
    extensionHandlers: editorExtensionHandlers,
    projectId,
  });

  const handleRestoreVersion = useCallback(
    async (descriptionHTML: string) => {
      editorRef.current?.clearEditor();
      editorRef.current?.setEditorValue(descriptionHTML);
    },
    [editorRef]
  );

  // reset editor ref on unmount
  useEffect(
    () => () => {
      setEditorRef(null);
    },
    [setEditorRef]
  );

  // Doc pages get the rich-text toolbar (formatting) and the right-hand
  // navigation pane (Outline / Info / Assets). Whiteboard pages have neither
  // headings nor uploaded assets, so the pane's empty states ("Missing
  // headings", etc.) are noise — skip both surfaces for them.
  const isCanvasPage = page.page_type === "whiteboard";

  return (
    <div className="relative flex size-full overflow-hidden transition-all duration-300 ease-in-out">
      <div className="flex size-full flex-col overflow-hidden">
        <PageVersionsOverlay
          editorComponent={PagesVersionEditor}
          fetchVersionDetails={handlers.fetchVersionDetails}
          handleRestore={handleRestoreVersion}
          pageId={page.id ?? ""}
          restoreEnabled={isContentEditable}
          storeType={storeType}
        />
        {!isCanvasPage && !isFocusMode && (
          <PageEditorToolbarRoot
            handleOpenNavigationPane={handleOpenNavigationPane}
            isNavigationPaneOpen={isNavigationPaneOpen}
            page={page}
          />
        )}
        {showContentTooLargeBanner && <ContentLimitBanner className="px-page-x" />}
        <Suspense fallback={<EditorFallback />}>
          {page.page_type === "whiteboard" ? (
            <TldrawEditor page={page} handlers={handlers} isEditable={isContentEditable} />
          ) : (
            <PageEditorBody
              config={config}
              customRealtimeEventHandlers={mergedCustomEventHandlers}
              editorReady={editorReady}
              editorForwardRef={editorRef}
              handleEditorReady={handleEditorReady}
              handleOpenNavigationPane={handleOpenNavigationPane}
              handlers={handlers}
              isNavigationPaneOpen={isNavigationPaneOpen}
              page={page}
              projectId={projectId}
              storeType={storeType}
              webhookConnectionParams={webhookConnectionParams}
              workspaceSlug={workspaceSlug}
              extendedEditorProps={extendedEditorProps}
              isFetchingFallbackBinary={isFetchingFallbackBinary}
              onCollaborationStateChange={setCollaborationState}
            />
          )}
        </Suspense>
      </div>
      {!isCanvasPage && !isFocusMode && (
        <PageNavigationPaneRoot
          storeType={storeType}
          handleClose={handleCloseNavigationPane}
          isNavigationPaneOpen={isNavigationPaneOpen}
          page={page}
          versionHistory={{
            fetchAllVersions: handlers.fetchAllVersions,
            fetchVersionDetails: handlers.fetchVersionDetails,
          }}
          extensions={navigationPaneExtensions}
        />
      )}
      <PageModals page={page} storeType={storeType} />
    </div>
  );
});

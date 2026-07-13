/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { LIVE_BASE_PATH, LIVE_BASE_URL } from "@plane/constants";
import { CollaborativeDocumentEditorWithRef } from "@plane/editor";
import type {
  CollaborationState,
  EditorRefApi,
  EditorTitleRefApi,
  TAIMenuProps,
  TDisplayConfig,
  TFileHandler,
  TRealtimeConfig,
  TServerHandler,
} from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { Tooltip } from "@plane/propel/tooltip";
import type { TSearchEntityRequestPayload, TSearchResponse, TWebhookConnectionQueryParams } from "@plane/types";
import { ERowVariant, Row } from "@plane/ui";
import { cn, generateRandomColor, hslToHex } from "@plane/utils";
import { Minimize2 } from "@/components/icons/lucide-shim";
// components
import {
  BLOCK_COMMENT_REQUEST_EVENT,
  BlockCommentFloating,
  type BlockCommentRequestDetail,
} from "@/components/editor/comments";
import { EditorMentionsRoot } from "@/components/editor/embeds/mentions";
// hooks
import { useEditorMention } from "@/hooks/editor";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser } from "@/hooks/store/user";
import { normalizeDocFontStyle } from "@/helpers/doc-font";
import { usePageFilters } from "@/hooks/use-page-filters";
import { useParseEditorContent } from "@/hooks/use-parse-editor-content";
import { useDocEmbed } from "@/plane-web/hooks/use-doc-embed";
import { useIssueEmbed } from "@/plane-web/hooks/use-issue-embed";
// plane web imports
import type { TCustomEventHandlers } from "@/hooks/use-realtime-page-events";
import { useRealtimePageEvents } from "@/hooks/use-realtime-page-events";
import { EditorAIMenu } from "@/plane-web/components/pages";
import type { TExtendedEditorExtensionsConfig } from "@/plane-web/hooks/pages";
import type { EPageStoreType } from "@/plane-web/hooks/store";
import { useEditorFlagging } from "@/plane-web/hooks/use-editor-flagging";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageContentLoader } from "../loaders/page-content-loader";
import { PageEditorHeaderRoot } from "./header";
import { PageContentBrowser } from "./summary";

export type TEditorBodyConfig = {
  fileHandler: TFileHandler;
};

export type TEditorBodyHandlers = {
  fetchEntity: (payload: TSearchEntityRequestPayload) => Promise<TSearchResponse>;
  getRedirectionLink: (pageId?: string) => string;
};

type Props = {
  config: TEditorBodyConfig;
  editorReady: boolean;
  editorForwardRef: React.RefObject<EditorRefApi>;
  handleEditorReady: (status: boolean) => void;
  handleOpenNavigationPane: () => void;
  handlers: TEditorBodyHandlers;
  isNavigationPaneOpen: boolean;
  page: TPageInstance;
  webhookConnectionParams: TWebhookConnectionQueryParams;
  projectId?: string;
  workspaceSlug: string;
  storeType: EPageStoreType;
  customRealtimeEventHandlers?: TCustomEventHandlers;
  extendedEditorProps: TExtendedEditorExtensionsConfig;
  isFetchingFallbackBinary?: boolean;
  onCollaborationStateChange?: (state: CollaborationState) => void;
  // Brief view: hide the editable page title, show a fixed label instead, and
  // override the empty-state placeholder.
  chromeless?: boolean;
  headerLabel?: string;
  editorPlaceholder?: string;
};

const DEFAULT_LIVE_BASE_PATH = "/live";

const getLiveServerBaseUrl = () => {
  const configuredUrl = LIVE_BASE_URL?.trim();
  if (configuredUrl) return configuredUrl;

  const currentUrl = new URL(window.location.origin);
  if (currentUrl.hostname.startsWith("app.")) {
    currentUrl.hostname = `live.${currentUrl.hostname.slice(4)}`;
  }

  return currentUrl.toString();
};

const getLiveCollaborationPath = () => {
  const basePath = (LIVE_BASE_PATH?.trim() || DEFAULT_LIVE_BASE_PATH).replace(/\/+$/, "");
  return `${basePath}/collaboration`;
};

export const PageEditorBody = observer(function PageEditorBody(props: Props) {
  const {
    config,
    editorForwardRef,
    handleEditorReady,
    handleOpenNavigationPane,
    handlers,
    isNavigationPaneOpen,
    page,
    storeType,
    webhookConnectionParams,
    projectId,
    workspaceSlug,
    extendedEditorProps,
    isFetchingFallbackBinary,
    onCollaborationStateChange,
    chromeless,
    headerLabel,
    editorPlaceholder,
  } = props;
  // refs
  const titleEditorRef = useRef<EditorTitleRefApi>(null);
  // store hooks
  const { data: currentUser } = useUser();
  const { getWorkspaceBySlug } = useWorkspace();
  const { getUserDetails } = useMember();
  const { getProjectIdentifierById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  // derived values
  const {
    id: pageId,
    isContentEditable,
    view_props,
    editor: { editorRef, updateAssetsList },
    setSyncingStatus,
  } = page;
  // Focus (zen) mode never applies to chromeless embeds (the Brief) — they
  // have no toolbar to toggle it back off from.
  const isFocusMode = Boolean(view_props?.focus_mode) && !chromeless;
  const isDropCapEnabled = Boolean(view_props?.drop_cap);
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  // use editor mention
  const { fetchMentions } = useEditorMention({
    enableAdvancedMentions: true,
    searchEntity: handlers.fetchEntity,
  });
  // use issue embed
  const insertGeneratedSpec = useCallback(
    (doc: object) => {
      editorRef?.setEditorValueAtCursorPosition(doc as Parameters<typeof editorRef.setEditorValueAtCursorPosition>[0]);
    },
    [editorRef]
  );
  const {
    issueEmbedProps,
    renderPicker: renderWorkItemPicker,
    renderTranscriptModal,
  } = useIssueEmbed({
    fetchEmbedSuggestions: handlers.fetchEntity,
    projectId,
    workspaceSlug,
    onInsertGeneratedContent: insertGeneratedSpec,
  });
  const {
    whiteboardEmbedProps,
    stickyEmbedProps,
    taskViewEmbedProps,
    chartEmbedProps,
    renderPicker: renderDocEmbedPicker,
  } = useDocEmbed({
    projectId,
    workspaceSlug,
  });
  const embedConfig = useMemo(
    () => ({
      issue: issueEmbedProps,
      whiteboard: whiteboardEmbedProps,
      sticky: stickyEmbedProps,
      taskView: taskViewEmbedProps,
      chart: chartEmbedProps,
    }),
    [chartEmbedProps, issueEmbedProps, stickyEmbedProps, taskViewEmbedProps, whiteboardEmbedProps]
  );
  // block-level comments — a single floating popover handles both
  // "create a new thread" and "view + reply to an existing thread".
  // We track the marked span (anchor) + its blockId; setting either
  // to null unmounts the popover. When the user opens via bubble
  // menu / slash command we hold the rollback in `cancelRef` so we
  // can drop the orphan mark if they dismiss without posting.
  const [floatingAnchor, setFloatingAnchor] = useState<HTMLElement | null>(null);
  const [floatingBlockId, setFloatingBlockId] = useState<string | null>(null);
  const floatingCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // The bubble menu + slash commands dispatch CustomEvent({
    // bubbles: true }) on the editor DOM. They bubble up to window
    // so we listen here, agnostic of the editor ref shape.
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent<BlockCommentRequestDetail>).detail;
      // The mark lands in the DOM synchronously inside Tiptap's
      // chain().run(), but ProseMirror does its own micro-task batching.
      // Querying on the next animation frame guarantees the span exists.
      const findAnchor = () => document.querySelector<HTMLElement>(`[data-block-comment-id="${detail.commentId}"]`);
      requestAnimationFrame(() => {
        const el = findAnchor();
        if (!el) {
          // Defensive: roll back if we couldn't find the anchor for
          // some reason — don't leave a dangling popover state.
          detail.cancel?.();
          return;
        }
        floatingCancelRef.current = detail.cancel ?? null;
        setFloatingAnchor(el);
        setFloatingBlockId(detail.commentId);
      });
    };
    window.addEventListener(BLOCK_COMMENT_REQUEST_EVENT, onRequest);
    return () => {
      window.removeEventListener(BLOCK_COMMENT_REQUEST_EVENT, onRequest);
    };
  }, []);

  // Open the popover when a user clicks an existing marked span in
  // the doc. The editor renders these as `<span data-block-comment-id="…">`
  // wrappers — we use a delegated click listener so dynamically
  // re-rendered ProseMirror nodes still hit it.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const span = target.closest<HTMLElement>("[data-block-comment-id]");
      if (!span) return;
      const id = span.getAttribute("data-block-comment-id");
      if (!id) return;
      // Existing thread — don't roll back the mark on close.
      floatingCancelRef.current = null;
      setFloatingAnchor(span);
      setFloatingBlockId(id);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const handleFloatingClose = useCallback(() => {
    floatingCancelRef.current = null;
    setFloatingAnchor(null);
    setFloatingBlockId(null);
  }, []);

  const handleFloatingCancelEmpty = useCallback(() => {
    // Roll the BlockComment mark back — if the user opened the
    // composer via "Comment" and never posted, the dotted underline
    // shouldn't linger on the doc.
    floatingCancelRef.current?.();
    floatingCancelRef.current = null;
    setFloatingAnchor(null);
    setFloatingBlockId(null);
  }, []);

  // Focus (zen) mode — stays in the normal layout (the app rail, header and the
  // side-by-side editor + Atlas drawer keep their unfocused positions; see
  // `.page-focus-mode` in globals.css). It's the same scroll container, so we
  // also drive typewriter centering against it. Held in state (callback ref)
  // because the container mounts after the loading early-return — the
  // typewriter effect below must re-run once it exists.
  const [zenScrollEl, setZenScrollEl] = useState<HTMLDivElement | null>(null);
  const [isZenExiting, setIsZenExiting] = useState(false);
  const wasFocusModeRef = useRef(isFocusMode);

  const handleExitFocusMode = useCallback(() => {
    void page.updateViewProps({ focus_mode: false });
  }, [page]);

  // Leaving focus mode plays a short settle animation (`.page-focus-mode-exit`).
  // Layout effect so the class is committed before the first post-exit paint —
  // a passive effect runs after paint, flashing one fully opaque frame before
  // the animation dips to 0.4 and fades back in.
  useLayoutEffect(() => {
    const wasFocusMode = wasFocusModeRef.current;
    wasFocusModeRef.current = isFocusMode;
    if (!wasFocusMode || isFocusMode) return;
    setIsZenExiting(true);
  }, [isFocusMode]);

  useEffect(() => {
    if (!isZenExiting) return;
    const timer = setTimeout(() => setIsZenExiting(false), 350);
    return () => clearTimeout(timer);
  }, [isZenExiting]);

  // Esc exits focus mode — but only as a last resort: skip if something
  // upstream (slash menu, suggestion dropdowns) already consumed the key,
  // and yield to any open surface that Esc should close or collapse first.
  useEffect(() => {
    if (!isFocusMode) return;
    // A dialog only blocks Esc when it's genuinely visible — the mobile rail
    // drawer keeps a `role="dialog"` panel MOUNTED below the md breakpoint
    // (just translated fully off-screen), which must not eat Esc forever.
    const hasOpenDialog = () =>
      Array.from(document.querySelectorAll<HTMLElement>("[role='dialog']")).some((dialog) => {
        if (typeof dialog.checkVisibility === "function" && !dialog.checkVisibility()) return false;
        const rect = dialog.getBoundingClientRect();
        // Zero-sized or fully off-canvas (e.g. translateX(-100%)) → closed.
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.top < window.innerHeight
        );
      });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (hasOpenDialog()) return;
      // Non-collapsed selection in the doc → the text bubble menu is showing.
      // Esc should collapse/leave the selection, not yank the user out of zen
      // mid-selection.
      const selection = document.getSelection();
      const editorContainer = document.getElementById(`editor-container-${pageId}`);
      if (
        selection &&
        !selection.isCollapsed &&
        selection.rangeCount > 0 &&
        editorContainer?.contains(selection.getRangeAt(0).startContainer)
      ) {
        return;
      }
      const active = document.activeElement;
      // Focus sits inside the bubble menu (tippy popper) or its link input /
      // block menu (floating-ui portals) — Esc belongs to those surfaces.
      if (active?.closest("[data-tippy-root], [data-floating-ui-portal]")) return;
      // An editor dropbar (bubble menu, block menu, …) is open — let it
      // handle/close on Esc instead of exiting zen.
      if (editorRef?.isAnyDropbarOpen()) return;
      // The block menu closes itself on a document-level Escape WITHOUT
      // preventDefault and unregisters its dropbar synchronously, so by the
      // time this window listener runs the check above is already false.
      // Its floating-ui portal node is still in the DOM until React commits,
      // though — detect it by its (package-internal) container classes.
      if (document.querySelector("[data-floating-ui-portal] .max-h-60.min-w-\\[7rem\\]")) return;
      // Focus is inside the Atlas chat drawer — Esc is the drawer's to handle.
      if (active?.closest("[data-atlas-drawer]")) return;
      handleExitFocusMode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFocusMode, handleExitFocusMode, editorRef, pageId]);

  // Typewriter scrolling. The caret is tracked from the web side
  // (`selectionchange` + the rendered ProseMirror DOM) so the editor package
  // stays untouched: the scroll container keeps the caret line pinned near the
  // vertical center. No block dimming — every block stays at full strength.
  useEffect(() => {
    if (!isFocusMode || !pageId) return;
    const scrollEl = zenScrollEl;
    if (!scrollEl) return;
    // The doc body's ProseMirror root — the title editor lives in its own
    // `editor-container-${pageId}-title` wrapper, so scope to the doc's.
    const getEditorRoot = () =>
      document.getElementById(`editor-container-${pageId}`)?.querySelector<HTMLElement>(".ProseMirror") ?? null;
    let rafId: number | null = null;
    const update = () => {
      rafId = null;
      const root = getEditorRoot();
      if (!root) return;
      const selection = document.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (!selection || !range || !root.contains(range.startContainer)) return;
      // Typewriter: only recenter a collapsed caret — chasing the focus end
      // of a mouse drag would fight the selection.
      if (!selection.isCollapsed) return;
      let caretRect = range.getBoundingClientRect();
      if (caretRect.width === 0 && caretRect.height === 0) {
        // Collapsed ranges in empty blocks report a zero rect — fall back
        // to the caret's closest element.
        const node = range.startContainer;
        const el = node instanceof HTMLElement ? node : node.parentElement;
        if (!el) return;
        caretRect = el.getBoundingClientRect();
      }
      const scrollRect = scrollEl.getBoundingClientRect();
      const delta = caretRect.top + caretRect.height / 2 - (scrollRect.top + scrollRect.height * 0.42);
      // Same line → zero-ish delta → no scroll; new line → one smooth nudge.
      if (Math.abs(delta) < 2) return;
      scrollEl.scrollTo({ top: scrollEl.scrollTop + delta, behavior: "smooth" });
    };
    const requestUpdate = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(update);
    };
    document.addEventListener("selectionchange", requestUpdate);
    // Recenter on editor transactions too — typing pushes content down, so the
    // caret line should track back toward center without waiting for the next
    // selectionchange.
    const unsubscribeFromEditor = editorRef?.onStateChange(requestUpdate);
    // Center the caret once on entering focus mode.
    requestUpdate();
    return () => {
      document.removeEventListener("selectionchange", requestUpdate);
      unsubscribeFromEditor?.();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isFocusMode, pageId, zenScrollEl, editorRef]);

  // editor flaggings
  const { document: documentEditorExtensions } = useEditorFlagging({
    workspaceSlug,
    projectId,
    storeType,
  });
  // parse content
  const { getEditorMetaData } = useParseEditorContent({
    projectId,
    workspaceSlug,
  });
  // page filters
  const { fontSize, isFullWidth, fontStyle: defaultFontStyle } = usePageFilters();
  // translation
  const { t } = useTranslation();
  // derived values — a per-doc font override wins; otherwise fall back to the
  // user's default document font from Settings → Preferences.
  const displayConfig: TDisplayConfig = useMemo(
    () => ({
      fontSize,
      fontStyle: view_props?.font_style ? normalizeDocFontStyle(view_props.font_style) : defaultFontStyle,
      wideLayout: isFullWidth,
    }),
    [fontSize, isFullWidth, view_props?.font_style, defaultFontStyle]
  );

  // Use the new hook to handle page events
  const { updatePageProperties } = useRealtimePageEvents({
    storeType,
    page,
    getUserDetails,
    handlers,
  });

  // Set syncing status when page changes and reset collaboration state
  useEffect(() => {
    setSyncingStatus("syncing");
    onCollaborationStateChange?.({
      stage: { kind: "connecting" },
      isServerSynced: false,
      isServerDisconnected: false,
    });
  }, [pageId, setSyncingStatus, onCollaborationStateChange]);

  const getAIMenu = useCallback(
    ({ isOpen, onClose }: TAIMenuProps) => (
      <EditorAIMenu
        editorRef={editorRef}
        isOpen={isOpen}
        onClose={onClose}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
      />
    ),
    [editorRef, workspaceId, workspaceSlug]
  );

  const serverHandler: TServerHandler = useMemo(
    () => ({
      onStateChange: (state) => {
        // Pass full state to parent
        onCollaborationStateChange?.(state);

        // Map collaboration stage to UI syncing status.
        // Keep disconnected in "syncing" mode so fallback autosave doesn't get
        // stuck showing a permanent error badge when websocket sync is unavailable.
        if (state.stage.kind === "disconnected") {
          setSyncingStatus("syncing");
        } else if (state.stage.kind === "synced") {
          setSyncingStatus("synced");
        } else {
          // initial, connecting, awaiting-sync, reconnecting → show as syncing
          setSyncingStatus("syncing");
        }
      },
    }),
    [setSyncingStatus, onCollaborationStateChange]
  );

  const realtimeConfig: TRealtimeConfig | undefined = useMemo(() => {
    // Construct the WebSocket Collaboration URL
    try {
      const WS_LIVE_URL = new URL(getLiveServerBaseUrl());
      const isSecureEnvironment = window.location.protocol === "https:";
      WS_LIVE_URL.protocol = isSecureEnvironment ? "wss" : "ws";
      WS_LIVE_URL.pathname = getLiveCollaborationPath();

      // Append query parameters to the URL
      Object.entries(webhookConnectionParams)
        .filter(([_, value]) => value !== undefined && value !== null)
        .forEach(([key, value]) => {
          WS_LIVE_URL.searchParams.set(key, String(value));
        });

      // Construct realtime config
      return {
        url: WS_LIVE_URL.toString(),
      };
    } catch (error) {
      console.error("Error creating realtime config", error);
      return undefined;
    }
  }, [webhookConnectionParams]);

  const userConfig = useMemo(
    () => ({
      id: currentUser?.id ?? "",
      name: currentUser?.display_name ?? "",
      color: hslToHex(generateRandomColor(currentUser?.id ?? "")),
    }),
    [currentUser?.display_name, currentUser?.id]
  );

  const blockWidthClassName = cn(
    "mx-auto block w-full max-w-[720px] bg-transparent transition-all duration-200 ease-in-out",
    {
      "max-w-[1152px]": isFullWidth,
      "max-w-[680px]": isFocusMode,
    }
  );

  const isPageLoading = pageId === undefined || !realtimeConfig;

  if (isPageLoading) return <PageContentLoader className={blockWidthClassName} />;

  return (
    <Row
      ref={setZenScrollEl}
      className={cn(
        "scroll-shadow vertical-scrollbar relative flex scrollbar-md size-full flex-col overflow-x-hidden overflow-y-auto duration-200",
        {
          "page-focus-mode": isFocusMode,
          "page-focus-mode-exit": isZenExiting,
          "page-drop-cap": isDropCapEnabled,
        }
      )}
      variant={ERowVariant.HUGGING}
    >
      {/* Subtle, always-reachable way out of the zen canvas (Esc works too). */}
      {isFocusMode && (
        <div className="fixed top-4 right-4 z-10">
          <Tooltip tooltipContent="Exit focus mode (Esc)" position="left">
            <IconButton
              type="button"
              variant="ghost"
              size="lg"
              icon={Minimize2}
              aria-label="Exit focus mode"
              aria-keyshortcuts="Escape"
              onClick={handleExitFocusMode}
              className="text-tertiary opacity-50 transition-opacity duration-200 hover:opacity-100"
            />
          </Tooltip>
        </div>
      )}
      <div id="page-content-container" className="relative w-full flex-shrink-0">
        {/* table of content */}
        {!isNavigationPaneOpen && !isFocusMode && (
          <div className="page-summary-container absolute top-[64px] right-0 z-[5] h-full">
            <div className="sticky top-[72px]">
              <div className="group/page-toc relative px-page-x">
                <button
                  type="button"
                  className="max-h-[50vh] !cursor-pointer overflow-hidden text-left"
                  aria-label={t("page_navigation_pane.outline_floating_button")}
                  onClick={handleOpenNavigationPane}
                >
                  <PageContentBrowser className="overflow-y-auto" editorRef={editorRef} showOutline />
                </button>
                <div className="vertical-scrollbar pointer-events-none absolute top-0 right-0 scrollbar-sm max-h-[70vh] w-52 translate-x-1/2 overflow-y-scroll rounded-lg bg-surface-2 p-4 whitespace-nowrap opacity-0 transition-all duration-300 group-hover/page-toc:pointer-events-auto group-hover/page-toc:-translate-x-1/4 group-hover/page-toc:opacity-100">
                  <PageContentBrowser className="overflow-y-auto" editorRef={editorRef} />
                </div>
              </div>
            </div>
          </div>
        )}
        <div>
          <div className="page-header-container group/page-header">
            <div className={blockWidthClassName}>
              {chromeless ? (
                headerLabel ? (
                  <h1 className="pt-4 pb-3 text-13 font-medium break-words text-primary">{headerLabel}</h1>
                ) : null
              ) : (
                <PageEditorHeaderRoot page={page} projectId={projectId} />
              )}
            </div>
          </div>
          <CollaborativeDocumentEditorWithRef
            editable={isContentEditable}
            id={pageId}
            placeholder={editorPlaceholder}
            fileHandler={config.fileHandler}
            handleEditorReady={handleEditorReady}
            ref={editorForwardRef}
            titleRef={titleEditorRef}
            containerClassName="h-full p-0 pb-64"
            displayConfig={displayConfig}
            getEditorMetaData={getEditorMetaData}
            mentionHandler={{
              searchCallback: async (query) => {
                const res = await fetchMentions(query);
                if (!res) throw new Error("Failed in fetching mentions");
                return res;
              },
              renderComponent: (mentionProps) => <EditorMentionsRoot {...mentionProps} />,
              getMentionedEntityDetails: (id: string) => {
                const user = getUserDetails(id);
                if (user) return { display_name: user.display_name };
                // Work-item mention: serialize as IDENTIFIER-seq for markdown export.
                const issue = getIssueById(id);
                if (issue?.project_id) {
                  return { display_name: `${getProjectIdentifierById(issue.project_id)}-${issue.sequence_id}` };
                }
                return { display_name: "" };
              },
            }}
            updatePageProperties={updatePageProperties}
            realtimeConfig={realtimeConfig}
            serverHandler={serverHandler}
            user={userConfig}
            disabledExtensions={documentEditorExtensions.disabled}
            flaggedExtensions={documentEditorExtensions.flagged}
            aiHandler={{
              menu: getAIMenu,
            }}
            embedConfig={embedConfig}
            onAssetChange={updateAssetsList}
            extendedEditorProps={extendedEditorProps}
            isFetchingFallbackBinary={isFetchingFallbackBinary}
          />
          {renderWorkItemPicker()}
          {renderDocEmbedPicker()}
          {renderTranscriptModal()}
          {/* One floating widget for both "add comment" and "view
              thread / reply". Anchored to the marked span via Popper. */}
          <BlockCommentFloating
            referenceEl={floatingAnchor}
            blockId={floatingBlockId}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            pageId={pageId}
            onClose={handleFloatingClose}
            onCancelEmpty={handleFloatingCancelEmpty}
          />
        </div>
      </div>
    </Row>
  );
});

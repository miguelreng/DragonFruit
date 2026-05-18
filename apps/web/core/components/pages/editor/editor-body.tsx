/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { TSearchEntityRequestPayload, TSearchResponse, TWebhookConnectionQueryParams } from "@plane/types";
import { ERowVariant, Row } from "@plane/ui";
import { cn, generateRandomColor, hslToHex } from "@plane/utils";
// components
import {
  BLOCK_COMMENT_REQUEST_EVENT,
  BLOCK_COMMENT_TOGGLE_PANEL_EVENT,
  BlockCommentComposer,
  BlockCommentsPanel,
  type BlockCommentRequestDetail,
} from "@/components/editor/comments";
import { EditorMentionsRoot } from "@/components/editor/embeds/mentions";
// hooks
import { useEditorMention } from "@/hooks/editor";
import { useMember } from "@/hooks/store/use-member";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser } from "@/hooks/store/user";
import { usePageFilters } from "@/hooks/use-page-filters";
import { useParseEditorContent } from "@/hooks/use-parse-editor-content";
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
  } = props;
  // refs
  const titleEditorRef = useRef<EditorTitleRefApi>(null);
  // store hooks
  const { data: currentUser } = useUser();
  const { getWorkspaceBySlug } = useWorkspace();
  const { getUserDetails } = useMember();
  // derived values
  const {
    id: pageId,
    isContentEditable,
    editor: { editorRef, updateAssetsList },
    setSyncingStatus,
  } = page;
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
  const embedConfig = useMemo(() => ({ issue: issueEmbedProps }), [issueEmbedProps]);
  // block-level comments — composer + panel are mounted at the end of the editor tree
  const [composerCommentId, setComposerCommentId] = useState<string | null>(null);
  const composerCancelRef = useRef<(() => void) | null>(null);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [commentsRefreshKey, setCommentsRefreshKey] = useState(0);

  useEffect(() => {
    // The slash commands dispatch CustomEvent({ bubbles: true }) on the editor DOM;
    // they bubble up to window, so we listen there to stay agnostic of the editor ref shape.
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent<BlockCommentRequestDetail>).detail;
      composerCancelRef.current = detail.cancel;
      setComposerCommentId(detail.commentId);
    };
    const onTogglePanel = () => setCommentsPanelOpen((v) => !v);
    window.addEventListener(BLOCK_COMMENT_REQUEST_EVENT, onRequest);
    window.addEventListener(BLOCK_COMMENT_TOGGLE_PANEL_EVENT, onTogglePanel);
    return () => {
      window.removeEventListener(BLOCK_COMMENT_REQUEST_EVENT, onRequest);
      window.removeEventListener(BLOCK_COMMENT_TOGGLE_PANEL_EVENT, onTogglePanel);
    };
  }, []);

  const handleComposerSubmit = useCallback(() => {
    composerCancelRef.current = null; // keep the mark
    setComposerCommentId(null);
    setCommentsRefreshKey((k) => k + 1);
    setCommentsPanelOpen(true);
  }, []);

  const handleComposerCancel = useCallback(() => {
    composerCancelRef.current?.();
    composerCancelRef.current = null;
    setComposerCommentId(null);
  }, []);

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
  const { fontSize, fontStyle, isFullWidth } = usePageFilters();
  // translation
  const { t } = useTranslation();
  // derived values
  const displayConfig: TDisplayConfig = useMemo(
    () => ({
      fontSize,
      fontStyle,
      wideLayout: isFullWidth,
    }),
    [fontSize, fontStyle, isFullWidth]
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

        // Map collaboration stage to UI syncing status
        // Stage → UI mapping: disconnected → error | synced → synced | all others → syncing
        if (state.stage.kind === "disconnected") {
          setSyncingStatus("error");
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
      const LIVE_SERVER_BASE_URL = LIVE_BASE_URL?.trim() || window.location.origin;
      const WS_LIVE_URL = new URL(LIVE_SERVER_BASE_URL);
      const isSecureEnvironment = window.location.protocol === "https:";
      WS_LIVE_URL.protocol = isSecureEnvironment ? "wss" : "ws";
      WS_LIVE_URL.pathname = `${LIVE_BASE_PATH}/collaboration`;

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
    }
  );

  const isPageLoading = pageId === undefined || !realtimeConfig;

  if (isPageLoading) return <PageContentLoader className={blockWidthClassName} />;

  return (
    <Row
      className="vertical-scrollbar relative flex scrollbar-md size-full flex-col overflow-x-hidden overflow-y-auto duration-200"
      variant={ERowVariant.HUGGING}
    >
      <div id="page-content-container" className="relative w-full flex-shrink-0">
        {/* table of content */}
        {!isNavigationPaneOpen && (
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
                <div className="vertical-scrollbar pointer-events-none absolute top-0 right-0 scrollbar-sm max-h-[70vh] w-52 translate-x-1/2 overflow-y-scroll rounded-sm bg-surface-2 p-4 whitespace-nowrap opacity-0 transition-all duration-300 group-hover/page-toc:pointer-events-auto group-hover/page-toc:-translate-x-1/4 group-hover/page-toc:opacity-100">
                  <PageContentBrowser className="overflow-y-auto" editorRef={editorRef} />
                </div>
              </div>
            </div>
          </div>
        )}
        <div>
          <div className="page-header-container group/page-header">
            <div className={blockWidthClassName}>
              <PageEditorHeaderRoot page={page} projectId={projectId} />
            </div>
          </div>
          <CollaborativeDocumentEditorWithRef
            editable={isContentEditable}
            id={pageId}
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
              getMentionedEntityDetails: (id: string) => ({ display_name: getUserDetails(id)?.display_name ?? "" }),
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
          {renderTranscriptModal()}
          <BlockCommentComposer
            isOpen={composerCommentId !== null}
            commentId={composerCommentId}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            pageId={pageId}
            onSubmitted={handleComposerSubmit}
            onCancel={handleComposerCancel}
          />
          <BlockCommentsPanel
            isOpen={commentsPanelOpen}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            pageId={pageId}
            onClose={() => setCommentsPanelOpen(false)}
            refreshKey={commentsRefreshKey}
          />
        </div>
      </div>
    </Row>
  );
});

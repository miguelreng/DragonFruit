/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { ArrowUpToLine, CheckSquare, Clipboard, History } from "@/components/icons/lucide-shim";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ToggleSwitch } from "@plane/ui";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
import { usePageFilters } from "@/hooks/use-page-filters";
import { useQueryParams } from "@/hooks/use-query-params";
// services
import { IssueService } from "@/services/issue";

const issueService = new IssueService();
// plane web imports
import type { TPageNavigationPaneTab } from "@/plane-web/components/pages/navigation-pane";
import type { EPageStoreType } from "@/plane-web/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageActions } from "../../dropdowns";
import { PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM } from "../../navigation-pane";

// Lazy-load the Export PDF modal — pulls in @react-pdf/renderer +
// react-pdf-html (with css-tree's MDN data) which is ~540 KB. Most users
// never trigger an export; defer until they actually open the dropdown
// and click it.
const ExportPageModal = lazy(() =>
  import("../../modals/export-page-modal").then((m) => ({ default: m.ExportPageModal }))
);

type Props = {
  page: TPageInstance;
  storeType: EPageStoreType;
};

export const PageOptionsDropdown = observer(function PageOptionsDropdown(props: Props) {
  const { page, storeType } = props;
  // states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  // navigation
  const router = useAppRouter();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  // store values
  const {
    name,
    isContentEditable,
    project_ids,
    editor: { editorRef },
  } = page;
  const docProjectId = project_ids?.[0];
  // page filters
  const { isFullWidth, handleFullWidth, isStickyToolbarEnabled, handleStickyToolbar } = usePageFilters();
  // query params
  const { updateQueryParams } = useQueryParams();
  // menu items list
  const EXTRA_MENU_OPTIONS = useMemo(
    function EXTRA_MENU_OPTIONS(): React.ComponentProps<typeof PageActions>["extraOptions"] {
      return [
        {
          key: "full-screen",
          action: () => handleFullWidth(!isFullWidth),
          customContent: (
            <>
              Full width
              <ToggleSwitch value={isFullWidth} onChange={() => {}} />
            </>
          ),
          className: "flex items-center justify-between gap-2",
        },
        {
          key: "sticky-toolbar",
          action: () => handleStickyToolbar(!isStickyToolbarEnabled),
          customContent: (
            <>
              Sticky toolbar
              <ToggleSwitch value={isStickyToolbarEnabled} onChange={() => {}} />
            </>
          ),
          className: "flex items-center justify-between gap-2",
          shouldRender: isContentEditable,
        },
        {
          key: "copy-markdown",
          action: () => {
            if (!editorRef) return;
            editorRef.copyMarkdownToClipboard();
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: "Success!",
              message: "Markdown copied to clipboard.",
            });
          },
          title: "Copy markdown",
          icon: Clipboard,
          shouldRender: true,
        },
        {
          key: "version-history",
          action: () => {
            // update query param to show info tab in navigation pane
            const updatedRoute = updateQueryParams({
              paramsToAdd: {
                [PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM]: "info" satisfies TPageNavigationPaneTab,
              },
            });
            router.push(updatedRoute);
          },
          title: "Version history",
          icon: History,
          shouldRender: true,
        },
        {
          key: "turn-into-task",
          action: async () => {
            if (!workspaceSlug || !docProjectId || !name || isCreatingTask) return;
            setIsCreatingTask(true);
            try {
              const description_html = editorRef?.getDocument?.()?.html;
              const issue = await issueService.createIssue(workspaceSlug, docProjectId, {
                name,
                description_html,
              });
              setToast({
                type: TOAST_TYPE.SUCCESS,
                title: "Task created",
                message: `“${name}” is now a task.`,
              });
              router.push(`/${workspaceSlug}/projects/${docProjectId}/issues/${issue.id}/`);
            } catch {
              setToast({
                type: TOAST_TYPE.ERROR,
                title: "Couldn't create the task",
                message: "Try again in a moment.",
              });
            } finally {
              setIsCreatingTask(false);
            }
          },
          title: isCreatingTask ? "Creating task…" : "Turn this doc into a task",
          icon: CheckSquare,
          shouldRender: Boolean(workspaceSlug && docProjectId && isContentEditable),
        },
        {
          key: "export",
          action: () => setIsExportModalOpen(true),
          title: "Export",
          icon: ArrowUpToLine,
          shouldRender: true,
        },
      ];
    },
    [
      handleFullWidth,
      isFullWidth,
      handleStickyToolbar,
      isStickyToolbarEnabled,
      isContentEditable,
      editorRef,
      updateQueryParams,
      router,
      setIsExportModalOpen,
      workspaceSlug,
      docProjectId,
      name,
      isCreatingTask,
    ]
  );

  return (
    <>
      {/* Only mount + import the heavy PDF modal once the user has opened it. */}
      {isExportModalOpen && (
        <Suspense fallback={null}>
          <ExportPageModal
            editorRef={editorRef}
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            pageTitle={name ?? ""}
          />
        </Suspense>
      )}
      <PageActions
        extraOptions={EXTRA_MENU_OPTIONS}
        optionsOrder={[
          "full-screen",
          "sticky-toolbar",
          "copy-markdown",
          "version-history",
          "turn-into-task",
          "make-a-copy",
          "save-as-template",
          "archive-restore",
          "delete",
          "toggle-access",
          "export",
        ]}
        page={page}
        storeType={storeType}
      />
    </>
  );
});

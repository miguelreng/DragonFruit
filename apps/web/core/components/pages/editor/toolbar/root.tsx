/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PanelRight } from "@/components/icons/lucide-shim";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
// components
import { PageToolbar } from "@/components/pages/editor/toolbar";
// hooks
import { usePageFilters } from "@/hooks/use-page-filters";
// plane web components
import { PageCollaboratorsList } from "@/plane-web/components/pages/header/collaborators-list";
// store
import type { TPageInstance } from "@/store/pages/base-page";
import { IconButton } from "@plane/propel/icon-button";

type Props = {
  handleOpenNavigationPane: () => void;
  isNavigationPaneOpen: boolean;
  page: TPageInstance;
  showNavigationPaneButton?: boolean;
};

export const PageEditorToolbarRoot = observer(function PageEditorToolbarRoot(props: Props) {
  const { handleOpenNavigationPane, isNavigationPaneOpen, page, showNavigationPaneButton = true } = props;
  // translation
  const { t } = useTranslation();
  // derived values
  const {
    isContentEditable,
    editor: { editorRef },
  } = page;
  // page filters
  const { isFullWidth, isStickyToolbarEnabled } = usePageFilters();
  // derived values
  const shouldHideToolbar = !isStickyToolbarEnabled || !isContentEditable;

  return (
    <>
      <div
        id="page-toolbar-container"
        className={cn("max-h-[52px] overflow-auto transition-all duration-300 ease-linear", {
          "max-h-0 overflow-hidden": shouldHideToolbar,
        })}
      >
        <div
          className={cn(
            "page-toolbar-content relative hidden min-h-[52px] items-center px-page-x transition-all duration-200 ease-in-out md:flex",
            {
              "wide-layout": isFullWidth,
            }
          )}
        >
          <div className="flex w-full max-w-full min-w-0 items-center justify-between">
            <div className="min-w-0 flex-1 overflow-hidden">{editorRef && <PageToolbar editorRef={editorRef} />}</div>
            <div className="flex shrink-0 items-center gap-2">
              <PageCollaboratorsList page={page} />
              {showNavigationPaneButton && !isNavigationPaneOpen && (
                <IconButton
                  variant="ghost"
                  size="base"
                  icon={PanelRight}
                  aria-label="Open navigation pane"
                  onClick={handleOpenNavigationPane}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      {shouldHideToolbar && (
        <div className="absolute top-0 right-0 z-10 flex h-[52px] items-center px-page-x">
          {showNavigationPaneButton && !isNavigationPaneOpen && (
            <Tooltip tooltipContent={t("page_navigation_pane.open_button")}>
              <IconButton
                variant="ghost"
                size="base"
                icon={PanelRight}
                onClick={handleOpenNavigationPane}
                aria-label={t("page_navigation_pane.open_button")}
              />
            </Tooltip>
          )}
        </div>
      )}
    </>
  );
});

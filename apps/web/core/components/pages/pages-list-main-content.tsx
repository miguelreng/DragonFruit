/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useParams, useRouter } from "next/navigation";
import { EUserPermissionsLevel, EPageAccess } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage, TPageNavigationTabs, TPageType } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
// components
import { PageLoader } from "@/components/pages/loaders/page-loader";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";

type Props = {
  children: React.ReactNode;
  contentType?: TPageType;
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
};

export const PagesListMainContent = observer(function PagesListMainContent(props: Props) {
  const { children, contentType = "doc", pageType, storeType } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { currentProjectDetails } = useProject();
  const { isAnyPageAvailable, getCurrentProjectFilteredPageIdsByTab, getCurrentProjectPageIdsByTab, loader } =
    usePageStore(storeType);
  const { allowPermissions } = useUserPermissions();
  const { createPage } = usePageStore(EPageStoreType.PROJECT);
  // states
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  // router
  const router = useRouter();
  const { workspaceSlug } = useParams();
  // derived values
  const pageIds = getCurrentProjectPageIdsByTab(pageType, contentType);
  const filteredPageIds = getCurrentProjectFilteredPageIdsByTab(pageType, contentType);
  const isWhiteboard = contentType === "whiteboard";
  const emptyStateTitle = isWhiteboard ? "No whiteboards yet" : t("project_empty_state.pages.title");
  const emptyStateDescription = isWhiteboard
    ? "Create a whiteboard to sketch ideas, flows, and project plans."
    : t("project_empty_state.pages.description");
  const emptyStateActionLabel = isWhiteboard ? "Add whiteboard" : t("project_empty_state.pages.cta_primary");
  const canPerformEmptyStateActions = allowPermissions(
    [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  // handle page create
  const handleCreatePage = async () => {
    setIsCreatingPage(true);

    const payload: Partial<TPage> = {
      access: pageType === "private" ? EPageAccess.PRIVATE : EPageAccess.PUBLIC,
      page_type: contentType,
    };

    try {
      const res = await createPage(payload);
      if (!res?.id) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "Page was created but could not be opened automatically. Please refresh and open it from the list.",
        });
        return;
      }
      const pageId = `/${workspaceSlug}/projects/${currentProjectDetails?.id}/pages/${res.id}`;
      router.push(pageId);
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.data?.error || "Page could not be created. Please try again.",
      });
    } finally {
      setIsCreatingPage(false);
    }
  };

  if (loader === "init-loader") return <PageLoader />;
  // if no pages exist in the active page type
  if (!isAnyPageAvailable || pageIds?.length === 0) {
    if (!isAnyPageAvailable) {
      return (
        <EmptyStateDetailed
          assetKey={isWhiteboard ? "whiteboard" : "page"}
          title={emptyStateTitle}
          description={emptyStateDescription}
          actions={[
            {
              label: emptyStateActionLabel,
              onClick: () => {
                handleCreatePage();
              },
              variant: "primary",
              disabled: !canPerformEmptyStateActions || isCreatingPage,
            },
          ]}
        />
      );
    }
    if (pageType === "public")
      return (
        <EmptyStateDetailed
          assetKey={isWhiteboard ? "whiteboard" : "page"}
          title={emptyStateTitle}
          description={emptyStateDescription}
          actions={[
            {
              label: emptyStateActionLabel,
              onClick: () => {
                handleCreatePage();
              },
              variant: "primary",
              disabled: !canPerformEmptyStateActions || isCreatingPage,
            },
          ]}
        />
      );
    if (pageType === "private")
      return (
        <EmptyStateDetailed
          assetKey={isWhiteboard ? "whiteboard" : "page"}
          title={emptyStateTitle}
          description={emptyStateDescription}
          actions={[
            {
              label: emptyStateActionLabel,
              onClick: () => {
                handleCreatePage();
              },
              variant: "primary",
              disabled: !canPerformEmptyStateActions || isCreatingPage,
            },
          ]}
        />
      );
    if (pageType === "archived")
      return (
        <EmptyStateDetailed
          assetKey={isWhiteboard ? "whiteboard" : "page"}
          title={t("project_empty_state.archive_pages.title")}
          description={t("project_empty_state.archive_pages.description")}
        />
      );
  }
  // if no pages match the filter criteria
  if (filteredPageIds?.length === 0)
    return (
      <EmptyStateDetailed
        assetKey="search"
        title={t("common_empty_state.search.title")}
        description={t("common_empty_state.search.description")}
      />
    );

  return <div className="h-full w-full overflow-hidden">{children}</div>;
});

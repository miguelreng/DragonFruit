/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { PageIcon } from "@/components/icons/propel-shim";
import type { ICustomSearchSelectOption } from "@plane/types";
import { Breadcrumbs, Header, BreadcrumbNavigationSearchDropdown } from "@plane/ui";
import { getPageName } from "@plane/utils";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageAccessIcon } from "@/components/common/page-access-icon";
import { SwitcherLabel } from "@/components/common/switcher-label";
import { WorkspaceCreateDocButton } from "@/components/docs/workspace-create-doc-button";
import { PageHeaderActions } from "@/components/pages/header/actions";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { PageDetailsHeaderExtraActions } from "@/plane-web/components/pages";
import { EPageStoreType, usePage, usePageStore } from "@/plane-web/hooks/store";

export interface IPagesHeaderProps {
  showButton?: boolean;
}

const storeType = EPageStoreType.PROJECT;

export const PageDetailsHeader = observer(function PageDetailsHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug, pageId, projectId } = useParams();
  // store hooks
  const { loader } = useProject();
  const { canCurrentUserCreatePage, getPageById, getCurrentProjectPageIds } = usePageStore(storeType);
  const page = usePage({
    pageId: pageId?.toString() ?? "",
    storeType,
  });
  // derived values
  const projectPageIds = getCurrentProjectPageIds(projectId?.toString());
  const isWhiteboard = page?.page_type === "whiteboard";
  const collectionLabel = isWhiteboard ? "Whiteboards" : "Docs";
  const collectionPath = isWhiteboard ? "whiteboards" : "pages";

  const switcherOptions = projectPageIds
    .map((id) => {
      const _page = id === pageId ? page : getPageById(id);
      if (!_page) return;
      return {
        value: _page.id,
        query: _page.name,
        content: (
          <div className="flex items-center justify-between gap-2">
            <SwitcherLabel
              logo_props={_page.logo_props}
              name={getPageName(_page.name)}
              LabelIcon={PageIcon}
              className="content-title-font"
            />
            <PageAccessIcon {..._page} />
          </div>
        ),
      };
    })
    .filter((option) => option !== undefined) as ICustomSearchSelectOption[];

  if (!page) return null;

  return (
    <Header>
      <Header.LeftItem>
        <div>
          <Breadcrumbs isLoading={loader === "init-loader"}>
            <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={collectionLabel}
                  href={`/${workspaceSlug}/projects/${projectId}/${collectionPath}/`}
                />
              }
            />

            <Breadcrumbs.Item
              component={
                <div className="content-title-font inline-flex items-center">
                  <BreadcrumbNavigationSearchDropdown
                    selectedItem={pageId?.toString() ?? ""}
                    navigationItems={switcherOptions}
                    onChange={(value: string) => {
                      router.push(`/${workspaceSlug}/projects/${projectId}/pages/${value}`);
                    }}
                    title={getPageName(page?.name)}
                    isLast
                  />
                </div>
              }
            />
          </Breadcrumbs>
        </div>
      </Header.LeftItem>
      <Header.RightItem className="items-center">
        <PageDetailsHeaderExtraActions page={page} storeType={storeType} />
        <PageHeaderActions page={page} storeType={storeType} />
        {canCurrentUserCreatePage && workspaceSlug && projectId && (
          <WorkspaceCreateDocButton
            workspaceSlug={workspaceSlug.toString()}
            lockedProjectId={projectId.toString()}
            showUpload={false}
            buttonVariant="secondary"
          />
        )}
      </Header.RightItem>
    </Header>
  );
});

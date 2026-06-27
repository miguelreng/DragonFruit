/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
// constants
import { EPageAccess } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// plane types
import { Button } from "@plane/propel/button";
import { ListFilter } from "@/components/icons/lucide-shim";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage, TPageType, TPageNavigationTabs } from "@plane/types";
// plane ui
import { Breadcrumbs, Header } from "@plane/ui";
import { calculateTotalFilters } from "@plane/utils";
// helpers
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// components
import { FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { PageFiltersSelection } from "@/components/pages/list/filters";
import { PageOrderByDropdown } from "@/components/pages/list/order-by";
import { PageScopeDropdown } from "@/components/pages/list/scope-dropdown";
import { PageSearchInput } from "@/components/pages/list/search-input";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";

type Props = {
  contentType?: TPageType;
};

type TCreatableHeaderPageType = Exclude<TPageType, "pdf">;

const PAGE_CONTENT_META: Record<TCreatableHeaderPageType, { addLabel: string; breadcrumbLabel: string }> = {
  doc: {
    addLabel: "Create doc",
    breadcrumbLabel: "Docs",
  },
  whiteboard: {
    addLabel: "Create whiteboard",
    breadcrumbLabel: "Whiteboards",
  },
};

const NAV_TABS: TPageNavigationTabs[] = ["all", "public", "private", "archived"];

export const PagesListHeader = observer(function PagesListHeader(props: Props) {
  const { contentType = "doc" } = props;
  const headerContentType: TCreatableHeaderPageType = contentType === "whiteboard" ? "whiteboard" : "doc";
  // states
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  // router
  const router = useRouter();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const rawType = searchParams.get("type");
  const pageType: TPageNavigationTabs = NAV_TABS.includes(rawType as TPageNavigationTabs)
    ? (rawType as TPageNavigationTabs)
    : "all";
  const contentMeta = PAGE_CONTENT_META[headerContentType];
  const basePath = headerContentType === "whiteboard" ? "whiteboards" : "pages";
  // store hooks
  const { currentProjectDetails, loader } = useProject();
  const { canCurrentUserCreatePage, createPage, filters, updateFilters } = usePageStore(EPageStoreType.PROJECT);
  const {
    workspace: { workspaceMemberIds },
  } = useMember();
  // derived values
  const isFiltersApplied = calculateTotalFilters(filters?.filters ?? {}) !== 0;
  // handle page create
  const handleCreatePage = async (kind: TCreatableHeaderPageType = headerContentType) => {
    setIsCreatingPage(true);

    const payload: Partial<TPage> = {
      access: kind === "doc" ? EPageAccess.PRIVATE : pageType === "private" ? EPageAccess.PRIVATE : EPageAccess.PUBLIC,
      page_type: kind,
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

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs isLoading={loader === "init-loader"}>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={contentMeta.breadcrumbLabel}
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/${basePath}/`}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
        <PageScopeDropdown
          workspaceSlug={workspaceSlug?.toString() ?? ""}
          projectId={projectId?.toString() ?? ""}
          pageType={pageType}
          basePath={basePath}
        />
      </Header.LeftItem>
      <Header.RightItem className="items-center">
        <PageSearchInput
          searchQuery={filters.searchQuery}
          updateSearchQuery={(val) => updateFilters("searchQuery", val)}
        />
        <PageOrderByDropdown
          sortBy={filters.sortBy}
          sortKey={filters.sortKey}
          onChange={(val) => {
            if (val.key) updateFilters("sortKey", val.key);
            if (val.order) updateFilters("sortBy", val.order);
          }}
        />
        <FiltersDropdown
          icon={<ListFilter className="h-3 w-3" />}
          title={t("common.filters")}
          placement="bottom-end"
          isFiltersApplied={isFiltersApplied}
        >
          <PageFiltersSelection
            filters={filters}
            handleFiltersUpdate={updateFilters}
            memberIds={workspaceMemberIds ?? undefined}
          />
        </FiltersDropdown>
        {canCurrentUserCreatePage && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => handleCreatePage(headerContentType)}
            loading={isCreatingPage}
            className="bg-[#e548a5] hover:bg-[#d93d9a] active:bg-[#c9368e]"
          >
            {isCreatingPage ? "Creating" : contentMeta.addLabel}
          </Button>
        )}
      </Header.RightItem>
    </Header>
  );
});

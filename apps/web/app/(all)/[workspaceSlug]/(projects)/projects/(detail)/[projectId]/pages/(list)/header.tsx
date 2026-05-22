/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Menu } from "@headlessui/react";
// constants
import { EPageAccess } from "@plane/constants";
// plane types
import { Button } from "@plane/propel/button";
import { PageIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage, TPageType } from "@plane/types";
// plane ui
import { Breadcrumbs, Header } from "@plane/ui";
import { ChevronDown, FileText, PenTool } from "@/components/icons/lucide-shim";
// helpers
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useProject } from "@/hooks/store/use-project";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";

export const PagesListHeader = observer(function PagesListHeader() {
  // states
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  // router
  const router = useRouter();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const pageType = searchParams.get("type");
  // store hooks
  const { currentProjectDetails, loader } = useProject();
  const { canCurrentUserCreatePage, createPage } = usePageStore(EPageStoreType.PROJECT);
  // handle page create
  const handleCreatePage = async (kind: TPageType = "doc") => {
    setIsCreatingPage(true);

    const payload: Partial<TPage> = {
      access: pageType === "private" ? EPageAccess.PRIVATE : EPageAccess.PUBLIC,
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
                label="Pages"
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/pages/`}
                icon={<PageIcon className="h-4 w-4 text-tertiary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      {canCurrentUserCreatePage && (
        <Header.RightItem>
          <Menu as="div" className="relative">
            <div className="flex items-stretch">
              <Button
                variant="primary"
                size="lg"
                onClick={() => handleCreatePage("doc")}
                loading={isCreatingPage}
                className="rounded-r-none bg-accent-primary hover:bg-accent-primary-hover active:bg-accent-primary-active"
              >
                {isCreatingPage ? "Adding" : "Add page"}
              </Button>
              <Menu.Button
                aria-label="Add page menu"
                className="flex items-center rounded-r-md bg-accent-primary px-1.5 text-on-color hover:bg-accent-primary-hover active:bg-accent-primary-active"
              >
                <ChevronDown className="size-4" />
              </Menu.Button>
            </div>
            <Menu.Items className="shadow-lg absolute right-0 z-30 mt-1 w-48 rounded-md border border-subtle-1 bg-canvas py-1 outline-none">
              <Menu.Item>
                <button
                  type="button"
                  onClick={() => handleCreatePage("doc")}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-12 hover:bg-layer-1-hover"
                >
                  <FileText className="size-4" /> Doc
                </button>
              </Menu.Item>
              <Menu.Item>
                <button
                  type="button"
                  onClick={() => handleCreatePage("whiteboard")}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-12 hover:bg-layer-1-hover"
                >
                  <PenTool className="size-4" /> Whiteboard
                </button>
              </Menu.Item>
            </Menu.Items>
          </Menu>
        </Header.RightItem>
      )}
    </Header>
  );
});

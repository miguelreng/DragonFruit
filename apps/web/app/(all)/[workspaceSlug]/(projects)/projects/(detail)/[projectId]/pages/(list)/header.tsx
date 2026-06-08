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
// plane types
import { Button } from "@plane/propel/button";
import { PageIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage, TPageType } from "@plane/types";
// plane ui
import { Breadcrumbs, Header } from "@plane/ui";
import { Whiteboard } from "@/components/icons/lucide-shim";
// helpers
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
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
    breadcrumbLabel: "Pages",
  },
  whiteboard: {
    addLabel: "Create whiteboard",
    breadcrumbLabel: "Whiteboards",
  },
};

export const PagesListHeader = observer(function PagesListHeader(props: Props) {
  const { contentType = "doc" } = props;
  const headerContentType: TCreatableHeaderPageType = contentType === "whiteboard" ? "whiteboard" : "doc";
  // states
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  // router
  const router = useRouter();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const pageType = searchParams.get("type");
  const contentMeta = PAGE_CONTENT_META[headerContentType];
  const HeaderIcon = headerContentType === "whiteboard" ? Whiteboard : PageIcon;
  // store hooks
  const { currentProjectDetails, loader } = useProject();
  const { canCurrentUserCreatePage, createPage } = usePageStore(EPageStoreType.PROJECT);
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
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/${
                  headerContentType === "whiteboard" ? "whiteboards" : "pages"
                }/`}
                icon={<HeaderIcon className="h-4 w-4 text-tertiary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      {canCurrentUserCreatePage && (
        <Header.RightItem>
          <Button
            variant="primary"
            size="lg"
            onClick={() => handleCreatePage(headerContentType)}
            loading={isCreatingPage}
            className="bg-[#e548a5] hover:bg-[#d93d9a] active:bg-[#c9368e]"
          >
            {isCreatingPage ? "Creating" : contentMeta.addLabel}
          </Button>
        </Header.RightItem>
      )}
    </Header>
  );
});

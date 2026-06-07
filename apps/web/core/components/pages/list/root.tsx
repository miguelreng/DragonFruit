/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// types
import type { TPageNavigationTabs, TPageType } from "@plane/types";
// components
import { ListLayout } from "@/components/core/list";
// plane web hooks
import type { EPageStoreType } from "@/plane-web/hooks/store";
import { usePageStore } from "@/plane-web/hooks/store";
// local imports
import { BRIEF_PAGE_NAME } from "@/components/project/brief/constants";
import { PageListBlock } from "./block";

type TPagesListRoot = {
  contentType?: TPageType;
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
};

export const PagesListRoot = observer(function PagesListRoot(props: TPagesListRoot) {
  const { contentType, pageType, storeType } = props;
  // store hooks
  const { getCurrentProjectFilteredPageIdsByTab, getPageById } = usePageStore(storeType);
  // derived values — hide the hidden, per-project "Brief" backing page
  const filteredPageIds = getCurrentProjectFilteredPageIdsByTab(pageType, contentType)?.filter(
    (pageId) => (getPageById(pageId)?.name ?? "").trim() !== BRIEF_PAGE_NAME
  );

  if (!filteredPageIds) return <></>;
  return (
    <ListLayout>
      {filteredPageIds.map((pageId) => (
        <PageListBlock key={pageId} pageId={pageId} storeType={storeType} />
      ))}
    </ListLayout>
  );
});

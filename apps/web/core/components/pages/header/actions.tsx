/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { EditorCapabilitiesGuide } from "@/components/editor/editor-capabilities-guide";
// plane web components
import { PageLockControl } from "@/plane-web/components/pages/header/lock-control";
import { PageMoveControl } from "@/plane-web/components/pages/header/move-control";
import { PageShareControl } from "@/plane-web/components/pages/header/share-control";
// plane web hooks
import type { EPageStoreType } from "@/plane-web/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageOptionsDropdown } from "../editor/toolbar";
import { PageArchivedBadge } from "./archived-badge";
import { PageCopyLinkControl } from "./copy-link-control";
import { PageFavoriteControl } from "./favorite-control";
import { PageLastSaved } from "./last-saved";
import { PageOfflineBadge } from "./offline-badge";
import { PageTagsControl } from "./tags-control";

type Props = {
  page: TPageInstance;
  storeType: EPageStoreType;
};

export const PageHeaderActions = observer(function PageHeaderActions(props: Props) {
  const { page, storeType } = props;

  return (
    <div className="flex items-center gap-1">
      <PageLastSaved page={page} />
      <PageArchivedBadge page={page} />
      <PageOfflineBadge page={page} />
      <PageLockControl page={page} />
      {/* The guide documents the rich-text editor — skip it on whiteboards/PDFs
          (same condition page-root.tsx uses for shouldShowToolbar). */}
      {page.page_type === "doc" && <EditorCapabilitiesGuide />}
      <PageMoveControl page={page} />
      <PageCopyLinkControl page={page} />
      <PageFavoriteControl page={page} />
      <PageTagsControl page={page} />
      <PageShareControl page={page} storeType={storeType} />
      <PageOptionsDropdown page={page} storeType={storeType} />
    </div>
  );
});

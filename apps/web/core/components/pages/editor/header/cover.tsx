/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local
import { getPageCoverSrc, readPageCoverId } from "./cover-options";
import { PageCoverPicker } from "./cover-picker";

type Props = {
  page: TPageInstance;
};

/**
 * Renders the chosen cover image as a banner above the page header. Reads
 * the cover identifier out of `view_props.cover` so we don't need a new DB
 * column — the existing JSONField is enough.
 *
 * When a cover is set the "Change cover" affordance lives as a small overlay
 * pinned to the cover's bottom-right corner (Notion-style) — fades in on
 * page-header hover — so we don't have to reserve a 48px action row above
 * the title just to hold the button.
 */
export const PageCover = observer(function PageCover({ page }: Props) {
  const coverId = readPageCoverId(page.view_props);
  const src = getPageCoverSrc(coverId);
  if (!src) return null;

  return (
    <div className="relative mb-2 h-[180px] w-full overflow-hidden rounded-md">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${src})` }}
        role="img"
        aria-label={`Cover: ${coverId}`}
      />
      <div className="absolute right-2 bottom-2 opacity-0 transition-opacity duration-150 group-hover/page-header:opacity-100">
        <div className="rounded-md bg-black/40 px-1 backdrop-blur-sm">
          <PageCoverPicker page={page} variant="overlay" />
        </div>
      </div>
    </div>
  );
});

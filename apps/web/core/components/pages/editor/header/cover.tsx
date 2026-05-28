/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local
import { getPageCoverOption, getPageCoverStyle, readPageCoverId } from "./cover-options";
import { PageCoverPicker } from "./cover-picker";

type Props = {
  page: TPageInstance;
  logoOverlay?: ReactNode;
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
 *
 * When a logo is also selected we can optionally render it as a floating
 * overlay on the bottom-left edge of the cover so it visually anchors to the
 * banner instead of dropping into the whitespace below it.
 */
export const PageCover = observer(function PageCover({ page, logoOverlay }: Props) {
  const coverId = readPageCoverId(page.view_props);
  const cover = getPageCoverOption(coverId);
  const coverStyle = getPageCoverStyle(coverId);
  if (!cover || !coverStyle) return null;

  return (
    <div className="relative mb-2 h-[180px] w-full">
      <div
        className="absolute inset-0 overflow-hidden rounded-lg"
        style={coverStyle}
        role="img"
        aria-label={`Cover: ${cover.label}`}
      />
      {logoOverlay ? <div className="absolute bottom-0 left-4 z-50 translate-y-1/2">{logoOverlay}</div> : null}
      <div className="absolute right-2 bottom-2 z-50 opacity-0 transition-opacity duration-150 group-hover/page-header:opacity-100">
        <div className="rounded-lg bg-black/40 px-1 backdrop-blur-sm">
          <PageCoverPicker page={page} variant="overlay" />
        </div>
      </div>
    </div>
  );
});

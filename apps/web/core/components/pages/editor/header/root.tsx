/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { SmilePlus } from "@/components/icons/lucide-shim";
// plane imports
import { EmojiPicker, EmojiIconPickerTypes } from "@plane/propel/emoji-icon-picker";
import { cn } from "@plane/utils";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageCover } from "./cover";
import { PageCoverPicker } from "./cover-picker";
import { readPageCoverId } from "./cover-options";
import { PageEditorHeaderLogoPicker } from "./logo-picker";

type Props = {
  page: TPageInstance;
  projectId?: string;
};

export const PageEditorHeaderRoot = observer(function PageEditorHeaderRoot(props: Props) {
  const { page } = props;
  // states
  const [isLogoPickerOpen, setIsLogoPickerOpen] = useState(false);
  // derived values
  const { isContentEditable, logo_props, name, updatePageLogo } = page;
  const isLogoSelected = !!logo_props?.in_use;
  const isTitleEmpty = !name || name.trim() === "";
  const hasCover = !!readPageCoverId(page.view_props);
  // Icon + Cover action buttons sit on the same row. Both fade in on header
  // hover unless the title is empty (then they're visible to nudge the user).
  const showActionsByDefault = isTitleEmpty;

  // Action row height collapses to 0 when there's nothing it has to hold:
  // logo set + cover set (cover-picker moves to an overlay on the banner)
  // and the title isn't empty (so the empty-state nudge isn't needed). This
  // keeps the cover close to the title instead of a dead 48px gap below.
  const showActionRow = !isLogoSelected || !hasCover || showActionsByDefault;
  const showIconButtonInRow = !isLogoSelected;
  // Cover picker stays inline in the row only when no cover is set yet —
  // once a cover exists, the "Change cover" affordance lives as an overlay
  // on the banner itself, freeing up the action row.
  const showCoverButtonInRow = !hasCover;

  return (
    <>
      <PageCover page={page} />
      {showActionRow && (
        <div className="flex h-[48px] items-end gap-1 text-left">
          {showIconButtonInRow && (
            <div
              className={cn("opacity-0 transition-all duration-200 group-hover/page-header:opacity-100", {
                "opacity-100": showActionsByDefault,
              })}
            >
              <EmojiPicker
                isOpen={isLogoPickerOpen}
                handleToggle={(val) => setIsLogoPickerOpen(val)}
                className="flex items-center justify-center"
                buttonClassName="flex items-center justify-center"
                label={
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1 rounded-sm p-1 text-13 font-medium text-tertiary transition-colors outline-none hover:bg-layer-1",
                      {
                        "bg-layer-1": isLogoPickerOpen,
                      }
                    )}
                  >
                    <SmilePlus className="size-4 flex-shrink-0" />
                    Icon
                  </button>
                }
                onChange={updatePageLogo}
                defaultIconColor={
                  logo_props?.in_use && logo_props.in_use === "icon" ? logo_props?.icon?.color : undefined
                }
                defaultOpen={
                  logo_props?.in_use && logo_props?.in_use === "emoji"
                    ? EmojiIconPickerTypes.EMOJI
                    : EmojiIconPickerTypes.ICON
                }
                disabled={!isContentEditable}
              />
            </div>
          )}
          {showCoverButtonInRow && (
            <div
              className={cn("opacity-0 transition-all duration-200 group-hover/page-header:opacity-100", {
                "opacity-100": showActionsByDefault,
              })}
            >
              <PageCoverPicker page={page} />
            </div>
          )}
        </div>
      )}
      <PageEditorHeaderLogoPicker className="mt-2 flex w-full flex-shrink-0" page={page} />
    </>
  );
});

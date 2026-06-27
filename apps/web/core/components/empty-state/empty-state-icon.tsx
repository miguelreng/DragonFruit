/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Bookmark, Checklist, DocumentText, RulerCrossPen, StickerSquare } from "@solar-icons/react/ssr";
import { cn } from "@plane/utils";

// An empty tab echoes the same Solar glyph its sidebar/nav entry uses, so a blank
// surface reads as "this is the <feature> page" rather than a generic
// illustration. Rendered duotone + a subtle gray to match the duotone document
// glyph already used on the docs cards (see workspace-docs-root DocCard).
const EMPTY_STATE_ICONS = {
  docs: DocumentText,
  tasks: Checklist,
  bookmarks: Bookmark,
  whiteboards: RulerCrossPen,
  stickies: StickerSquare,
} as const;

export type TEmptyStateIconName = keyof typeof EMPTY_STATE_ICONS;

type Props = {
  name: TEmptyStateIconName;
  className?: string;
};

export const EmptyStateIcon = ({ name, className }: Props) => {
  const Icon = EMPTY_STATE_ICONS[name];
  return <Icon weight="BoldDuotone" className={cn("size-16 text-tertiary", className)} />;
};

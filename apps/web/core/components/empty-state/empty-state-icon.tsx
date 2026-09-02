/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {
  Bookmark,
  Box,
  ChartSquare,
  Checklist,
  DocumentText,
  Eye,
  Flag,
  Folder,
  Gallery,
  GraphUp,
  History,
  InboxIn,
  Letter,
  LinkBrokenMinimalistic,
  ListCheck,
  Lock,
  Magnifer,
  PenNewSquare,
  QuestionCircle,
  Restart,
  Routing,
  RulerCrossPen,
  ServerSquare,
  StickerSquare,
  Tag,
  UsersGroupTwoRounded,
  Widget,
} from "@solar-icons/react/ssr";
import { cn } from "@dragonfruit/utils";

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
  workflows: Routing,
  search: Magnifer,
  activity: History,
  widgets: Widget,
  cycles: Restart,
  modules: Box,
  views: Eye,
  intake: InboxIn,
  projects: Folder,
  members: UsersGroupTwoRounded,
  labels: Tag,
  priority: Flag,
  charts: ChartSquare,
  progress: GraphUp,
  drafts: PenNewSquare,
  invitations: Letter,
  assets: Gallery,
  outline: ListCheck,
  "no-access": Lock,
  "invalid-link": LinkBrokenMinimalistic,
  maintenance: ServerSquare,
  "not-found": QuestionCircle,
} as const;

export type TEmptyStateIconName = keyof typeof EMPTY_STATE_ICONS;

export const EMPTY_STATE_ICON_NAMES = Object.keys(EMPTY_STATE_ICONS) as TEmptyStateIconName[];

type Props = {
  name: TEmptyStateIconName;
  className?: string;
};

export const EmptyStateIcon = ({ name, className }: Props) => {
  const Icon = EMPTY_STATE_ICONS[name];
  return <Icon aria-hidden="true" weight="BoldDuotone" className={cn("size-16 text-tertiary", className)} />;
};

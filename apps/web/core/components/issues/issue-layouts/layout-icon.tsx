/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { SVGProps } from "react";
// Direct Solar glyphs, one distinct icon per layout. (The previous propel
// composites routed board AND spreadsheet through the same mingcute glyph,
// so two view-switcher buttons rendered identically.)
import type { IconWeight } from "@solar-icons/react";
import { List, Widget, Calendar, ServerSquare, SortHorizontal } from "@solar-icons/react/ssr";
import { EIssueLayoutTypes } from "@plane/types";

const LAYOUT_ICON: Record<EIssueLayoutTypes, typeof List> = {
  [EIssueLayoutTypes.LIST]: List,
  [EIssueLayoutTypes.KANBAN]: Widget,
  [EIssueLayoutTypes.CALENDAR]: Calendar,
  [EIssueLayoutTypes.SPREADSHEET]: ServerSquare,
  [EIssueLayoutTypes.GANTT]: SortHorizontal,
};

export function IssueLayoutIcon({
  layout,
  size,
  weight,
  ...props
}: { layout: EIssueLayoutTypes; size?: number; weight?: IconWeight } & SVGProps<SVGSVGElement>) {
  const Icon = LAYOUT_ICON[layout];
  if (!Icon) return null;
  return <Icon weight={weight ?? "Linear"} {...props} {...(size ? { width: size, height: size } : {})} />;
}

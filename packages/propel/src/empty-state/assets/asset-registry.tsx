/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import {
  ArchiveMinimalistic,
  Bolt,
  Box,
  Calculator,
  ChartSquare,
  Checklist,
  ClockCircle,
  Copy,
  DangerTriangle,
  DocumentText,
  Export,
  Eye,
  Flag,
  Flag2,
  Folder,
  History,
  Inbox,
  InboxIn,
  Key,
  LinkBrokenMinimalistic,
  LinkRound,
  Lock,
  Magnifer,
  PenNewSquare,
  QuestionCircle,
  Refresh,
  Restart,
  RulerCrossPen,
  ServerSquare,
  Settings,
  StickerSquare,
  Tag,
  Target,
  UsersGroupRounded,
  UsersGroupTwoRounded,
} from "@solar-icons/react/ssr";
import { cn } from "../../utils/classname";
import type {
  CompactAssetType,
  DetailedAssetType,
  HorizontalStackAssetType,
  IllustrationAssetType,
  VerticalStackAssetType,
} from "./asset-types";

type TSolarIcon = React.ComponentType<{
  weight?: string;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

// Empty states render the feature's Solar glyph (duotone, subtle gray) instead of
// an illustration, so a blank surface reads as "this is the <feature> page".
// Mirrors the app-side EmptyStateIcon convention (size-16 detailed, size-12 compact).
const createIconAsset = (Icon: TSolarIcon, orientation: "compact" | "detailed") =>
  function IconAsset({ className }: { className?: string }) {
    return (
      <Icon
        aria-hidden="true"
        weight="BoldDuotone"
        data-empty-state-orientation={orientation}
        className={cn(orientation === "detailed" ? "size-16" : "size-12", "shrink-0 text-tertiary", className)}
      />
    );
  };

// Horizontal Stack Asset Registry
export const HORIZONTAL_STACK_ASSETS: Record<HorizontalStackAssetType, React.ComponentType<{ className?: string }>> = {
  customer: createIconAsset(UsersGroupRounded, "compact"),
  epic: createIconAsset(Bolt, "compact"),
  estimate: createIconAsset(Calculator, "compact"),
  export: createIconAsset(Export, "compact"),
  intake: createIconAsset(InboxIn, "compact"),
  label: createIconAsset(Tag, "compact"),
  link: createIconAsset(LinkRound, "compact"),
  members: createIconAsset(UsersGroupTwoRounded, "compact"),
  note: createIconAsset(StickerSquare, "compact"),
  priority: createIconAsset(Flag, "compact"),
  project: createIconAsset(Folder, "compact"),
  settings: createIconAsset(Settings, "compact"),
  state: createIconAsset(Target, "compact"),
  template: createIconAsset(Copy, "compact"),
  token: createIconAsset(Key, "compact"),
  unknown: createIconAsset(QuestionCircle, "compact"),
  update: createIconAsset(Refresh, "compact"),
  webhook: createIconAsset(LinkRound, "compact"),
  "work-item": createIconAsset(Checklist, "compact"),
  worklog: createIconAsset(ClockCircle, "compact"),
};

// Vertical Stack Asset Registry
export const VERTICAL_STACK_ASSETS: Record<VerticalStackAssetType, React.ComponentType<{ className?: string }>> = {
  "archived-cycle": createIconAsset(ArchiveMinimalistic, "detailed"),
  "archived-module": createIconAsset(ArchiveMinimalistic, "detailed"),
  "archived-work-item": createIconAsset(ArchiveMinimalistic, "detailed"),
  changelog: createIconAsset(History, "detailed"),
  customer: createIconAsset(UsersGroupRounded, "detailed"),
  cycle: createIconAsset(Restart, "detailed"),
  dashboard: createIconAsset(ChartSquare, "detailed"),
  draft: createIconAsset(PenNewSquare, "detailed"),
  epic: createIconAsset(Bolt, "detailed"),
  "error-404": createIconAsset(DangerTriangle, "detailed"),
  initiative: createIconAsset(Flag2, "detailed"),
  "invalid-link": createIconAsset(LinkBrokenMinimalistic, "detailed"),
  module: createIconAsset(Box, "detailed"),
  "no-access": createIconAsset(Lock, "detailed"),
  page: createIconAsset(DocumentText, "detailed"),
  project: createIconAsset(Folder, "detailed"),
  "server-error": createIconAsset(ServerSquare, "detailed"),
  teamspace: createIconAsset(UsersGroupRounded, "detailed"),
  view: createIconAsset(Eye, "detailed"),
  whiteboard: createIconAsset(RulerCrossPen, "detailed"),
  "work-item": createIconAsset(Checklist, "detailed"),
};

// Illustration Asset Registry
export const ILLUSTRATION_ASSETS: Record<IllustrationAssetType, React.ComponentType<{ className?: string }>> = {
  inbox: createIconAsset(Inbox, "compact"),
  search: createIconAsset(Magnifer, "compact"),
};

// Helper functions to get assets
export const getCompactAsset = (assetKey: CompactAssetType, className?: string): React.ReactNode => {
  const AssetComponent =
    (HORIZONTAL_STACK_ASSETS[assetKey as HorizontalStackAssetType] as React.ComponentType<{ className?: string }>) ||
    ILLUSTRATION_ASSETS[assetKey as IllustrationAssetType];

  if (!AssetComponent) {
    console.warn(`Asset "${assetKey}" not found in compact asset registry`);
    return null;
  }

  return <AssetComponent className={className} />;
};

export const getDetailedAsset = (assetKey: DetailedAssetType, className?: string): React.ReactNode => {
  const AssetComponent =
    (VERTICAL_STACK_ASSETS[assetKey as VerticalStackAssetType] as React.ComponentType<{ className?: string }>) ||
    ILLUSTRATION_ASSETS[assetKey as IllustrationAssetType];

  if (!AssetComponent) {
    console.warn(`Asset "${assetKey}" not found in detailed asset registry`);
    return null;
  }

  return <AssetComponent className={className} />;
};

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type {
  CompactAssetType,
  DetailedAssetType,
  HorizontalStackAssetType,
  IllustrationAssetType,
  VerticalStackAssetType,
} from "./asset-types";

const createSketchAsset = (assetKey: CompactAssetType | DetailedAssetType, orientation: "compact" | "detailed") =>
  function SketchAsset({ className }: { className?: string }) {
    return (
      <img
        src={`/empty-state/renaissance-sketch/${assetKey}.png`}
        alt=""
        aria-hidden="true"
        className={className}
        data-empty-state-orientation={orientation}
        draggable={false}
      />
    );
  };

// Horizontal Stack Asset Registry
export const HORIZONTAL_STACK_ASSETS: Record<HorizontalStackAssetType, React.ComponentType<{ className?: string }>> = {
  customer: createSketchAsset("customer", "compact"),
  epic: createSketchAsset("epic", "compact"),
  estimate: createSketchAsset("estimate", "compact"),
  export: createSketchAsset("export", "compact"),
  intake: createSketchAsset("intake", "compact"),
  label: createSketchAsset("label", "compact"),
  link: createSketchAsset("link", "compact"),
  members: createSketchAsset("members", "compact"),
  note: createSketchAsset("note", "compact"),
  priority: createSketchAsset("priority", "compact"),
  project: createSketchAsset("project", "compact"),
  settings: createSketchAsset("settings", "compact"),
  state: createSketchAsset("state", "compact"),
  template: createSketchAsset("template", "compact"),
  token: createSketchAsset("token", "compact"),
  unknown: createSketchAsset("unknown", "compact"),
  update: createSketchAsset("update", "compact"),
  webhook: createSketchAsset("webhook", "compact"),
  "work-item": createSketchAsset("work-item", "compact"),
  worklog: createSketchAsset("worklog", "compact"),
};

// Vertical Stack Asset Registry
export const VERTICAL_STACK_ASSETS: Record<VerticalStackAssetType, React.ComponentType<{ className?: string }>> = {
  "archived-cycle": createSketchAsset("archived-cycle", "detailed"),
  "archived-module": createSketchAsset("archived-module", "detailed"),
  "archived-work-item": createSketchAsset("archived-work-item", "detailed"),
  changelog: createSketchAsset("changelog", "detailed"),
  customer: createSketchAsset("customer", "detailed"),
  cycle: createSketchAsset("cycle", "detailed"),
  dashboard: createSketchAsset("dashboard", "detailed"),
  draft: createSketchAsset("draft", "detailed"),
  epic: createSketchAsset("epic", "detailed"),
  "error-404": createSketchAsset("error-404", "detailed"),
  initiative: createSketchAsset("initiative", "detailed"),
  "invalid-link": createSketchAsset("invalid-link", "detailed"),
  module: createSketchAsset("module", "detailed"),
  "no-access": createSketchAsset("no-access", "detailed"),
  page: createSketchAsset("page", "detailed"),
  project: createSketchAsset("project", "detailed"),
  "server-error": createSketchAsset("server-error", "detailed"),
  teamspace: createSketchAsset("teamspace", "detailed"),
  view: createSketchAsset("view", "detailed"),
  whiteboard: createSketchAsset("whiteboard", "detailed"),
  "work-item": createSketchAsset("work-item", "detailed"),
};

// Illustration Asset Registry
export const ILLUSTRATION_ASSETS: Record<IllustrationAssetType, React.ComponentType<{ className?: string }>> = {
  inbox: createSketchAsset("inbox", "compact"),
  search: createSketchAsset("search", "compact"),
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

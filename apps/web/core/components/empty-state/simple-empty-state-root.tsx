/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// utils
import { cn } from "@plane/utils";
import { EmptyStateIcon, type TEmptyStateIconName } from "./empty-state-icon";

type EmptyStateSize = "sm" | "lg";

type Props = {
  title: string;
  description?: string;
  assetPath?: string;
  visual?: { type: "icon"; name: TEmptyStateIconName } | { type: "asset"; path: string; alt?: string };
  size?: EmptyStateSize;
};

const sizeConfig = {
  sm: {
    container: "size-24",
    dimensions: 78,
  },
  lg: {
    container: "size-28",
    dimensions: 96,
  },
} as const;

const getTitleClassName = (hasDescription: boolean) =>
  cn("font-medium whitespace-pre-line", {
    "text-13 text-placeholder": !hasDescription,
    "text-16 text-tertiary": hasDescription,
  });

export const SimpleEmptyState = observer(function SimpleEmptyState(props: Props) {
  const { title, description, size = "sm", assetPath, visual } = props;
  const resolvedVisual = visual ?? (assetPath ? { type: "asset" as const, path: assetPath, alt: title } : undefined);

  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      {resolvedVisual && (
        <div className={cn(sizeConfig[size].container, "grid place-items-center")}>
          {resolvedVisual.type === "icon" ? (
            <EmptyStateIcon name={resolvedVisual.name} />
          ) : (
            <img src={resolvedVisual.path} alt={resolvedVisual.alt ?? ""} className="h-full w-full object-contain" />
          )}
        </div>
      )}

      <h3 className={getTitleClassName(!!description)}>{title}</h3>

      {description && <p className="text-14 font-medium whitespace-pre-line text-placeholder">{description}</p>}
    </div>
  );
});

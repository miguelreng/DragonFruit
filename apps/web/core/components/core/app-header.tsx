/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
// plane imports
import { Row } from "@plane/ui";
// components
import { cn } from "@plane/utils";
import { ExtendedAppHeader } from "@/plane-web/components/common/extended-app-header";

export interface AppHeaderProps {
  header: ReactNode;
  mobileHeader?: ReactNode;
  className?: string;
  rowClassName?: string;
  showContentEdgeFade?: boolean;
}

export const AppHeader = observer(function AppHeader(props: AppHeaderProps) {
  const { header, mobileHeader, className, rowClassName, showContentEdgeFade = false } = props;

  return (
    <div
      className={cn(
        "relative z-[18] flex-shrink-0",
        showContentEdgeFade &&
          "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-[-24px] after:h-6 after:bg-gradient-to-b after:from-surface-1 after:via-surface-1/45 after:to-transparent after:content-['']",
        className
      )}
    >
      {/* Shared page-header baseline: a 56px (min-h-14) row, content vertically
          centered → centerline 28px, matching the project tab band, the Atlas
          header, and the sidebar switcher. Symmetric centering (no asymmetric
          padding) lets the folder-tab band match while its tabs stay fused to
          the body below. */}
      <Row className={cn("flex min-h-14 w-full items-center gap-2 bg-surface-1", rowClassName)}>
        <ExtendedAppHeader header={header} />
      </Row>
      {mobileHeader}
    </div>
  );
});

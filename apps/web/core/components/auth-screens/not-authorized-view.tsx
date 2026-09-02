/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { cn } from "@plane/utils";
// components
import { EmptyStateIcon } from "@/components/empty-state/empty-state-icon";
// layouts
import DefaultLayout from "@/layouts/default-layout";

type Props = {
  actionButton?: React.ReactNode;
  section?: "settings" | "general";
  isProjectView?: boolean;
  className?: string;
};

export const NotAuthorizedView = observer(function NotAuthorizedView(props: Props) {
  const { actionButton, className } = props;

  return (
    <DefaultLayout className={cn("bg-surface-1", className)}>
      <div className="flex h-full w-full flex-col items-center justify-center gap-y-5 text-center">
        <EmptyStateIcon name="no-access" />
        <h1 className="text-18 font-medium text-primary">Oops! You are not authorized to view this page</h1>
        {actionButton}
      </div>
    </DefaultLayout>
  );
});

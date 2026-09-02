/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// layouts
import DefaultLayout from "@/layouts/default-layout";
// components
import { EmptyStateIcon } from "@/components/empty-state/empty-state-icon";
import { MaintenanceMessage } from "@/plane-web/components/instance";

export function MaintenanceView() {
  return (
    <DefaultLayout>
      <div className="relative container mx-auto flex h-full w-full max-w-xl flex-col items-center justify-center gap-2 gap-y-6 bg-surface-1 text-center">
        <EmptyStateIcon name="maintenance" className="mx-auto" />
        <div className="relative mt-4 flex w-full flex-col gap-4">
          <MaintenanceMessage />
        </div>
      </div>
    </DefaultLayout>
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { useTranslation } from "@dragonfruit/i18n";
// components
import { EmptyStateIcon } from "@/components/empty-state/empty-state-icon";

export function PageNavigationPaneOutlineTabEmptyState() {
  // translation
  const { t } = useTranslation();

  return (
    <div className="grid size-full place-items-center">
      <div className="flex flex-col items-center gap-y-6 text-center">
        <EmptyStateIcon name="outline" className="size-12" />
        <div className="space-y-2.5">
          <h4 className="text-14 font-medium">{t("page_navigation_pane.tabs.outline.empty_state.title")}</h4>
          <p className="text-13 font-medium text-secondary">
            {t("page_navigation_pane.tabs.outline.empty_state.description")}
          </p>
        </div>
      </div>
    </div>
  );
}

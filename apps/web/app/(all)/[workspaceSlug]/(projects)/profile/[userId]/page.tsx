/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { useTranslation } from "@dragonfruit/i18n";
import { ContentWrapper } from "@dragonfruit/ui";
// components
import { PageHead } from "@/components/core/page-title";
import { MyTasksSection } from "@/components/home/sections/my-tasks-section";
import type { Route } from "./+types/page";

export default function ProfileOverviewPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, userId } = params;

  const { t } = useTranslation();

  return (
    <>
      <PageHead title={t("profile.page_label")} />
      <ContentWrapper className="space-y-8">
        <MyTasksSection userId={userId} hideHeader />
      </ContentWrapper>
    </>
  );
}

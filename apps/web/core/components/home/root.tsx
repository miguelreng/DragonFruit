/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, type ReactNode } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { ContentWrapper } from "@plane/ui";
// hooks
import { useHomePreferences } from "@/hooks/use-home-preferences";
import { useUserProfile } from "@/hooks/store/user";
// components
import { AppHeader } from "@/components/core/app-header";
// plane web imports
import { HomePeekOverviewsRoot } from "@/plane-web/components/home";
import { TourRoot } from "@/plane-web/components/onboarding/tour/root";
// local imports
import { FavoritesSection, MyTasksSection, RecentActivitySection, RecentDocsSection } from "./sections";

type WorkspaceHomeViewProps = {
  /** Optional greeting that scrolls with the rest of the home content. */
  header?: ReactNode;
};

export const WorkspaceHomeView = observer(function WorkspaceHomeView({ header }: WorkspaceHomeViewProps = {}) {
  const { data: currentUserProfile, updateTourCompleted } = useUserProfile();
  const { workspaceSlug } = useParams();
  const { preferences } = useHomePreferences(workspaceSlug?.toString());

  const handleTourCompleted = async () => {
    try {
      await updateTourCompleted();
    } catch (error) {
      console.error("Error updating tour completed", error);
    }
  };

  // Per-section enabled state. The home is a single flat column now; only
  // `is_enabled` controls whether a section renders (sort_order is ignored).
  const enabledKeys = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of preferences ?? []) map.set(row.key, row.is_enabled !== false);
    return (key: string) => map.get(key) ?? true;
  }, [preferences]);

  return (
    <>
      {currentUserProfile && !currentUserProfile.is_tour_completed && (
        <div className="fixed top-0 left-0 z-20 grid h-full w-full place-items-center overflow-y-auto bg-backdrop transition-opacity">
          <TourRoot onComplete={handleTourCompleted} />
        </div>
      )}
      <HomePeekOverviewsRoot />
      {/* Top chrome only carries the sidebar/app-rail toggles, and only while
          they're collapsed. Shrink the row to its content so an empty header
          adds no spacing (no ghost bar) yet the toggles still surface when shown. */}
      <AppHeader header={null} rowClassName="min-h-0 pt-0 pb-0" />
      <ContentWrapper className="scrollbar-hide gap-0 bg-surface-1 !px-0 !py-0">
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-10 px-page-x pt-10 pb-16">
          {header}
          <div className="flex flex-col gap-8">
            {enabledKeys("recent_docs") && <RecentDocsSection />}
            {enabledKeys("my_tasks") && <MyTasksSection flat />}
            {enabledKeys("favorites") && <FavoritesSection />}
            {enabledKeys("recent_activity") && <RecentActivitySection />}
          </div>
        </div>
      </ContentWrapper>
    </>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, type ReactNode } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { ContentWrapper, Sortable } from "@plane/ui";
// icons
import { GripVertical } from "@/components/icons/lucide-shim";
// hooks
import { useHomePreferences } from "@/hooks/use-home-preferences";
import { useUserProfile } from "@/hooks/store/user";
// plane web imports
import { HomePeekOverviewsRoot } from "@/plane-web/components/home";
import { TourRoot } from "@/plane-web/components/onboarding/tour/root";
// services
import type { THomePreference } from "@/services/home-preferences.service";
// local imports
import { AgentCostSection, FavoritesSection, InboxSection, OnMyPlateSection } from "./sections";

/**
 * Registry of section components keyed by the same string used in
 * `WorkspaceHomePreference.key`. The backend auto-seeds rows for these
 * keys on first load; any key the registry doesn't know about is just
 * skipped (lets us ship a new section without breaking older clients
 * that still have a row for a key we removed, and lets legacy widget
 * keys like `quick_links` coexist without rendering).
 */
const SECTION_RENDERERS: Record<string, () => ReactNode> = {
  inbox: () => <InboxSection />,
  on_my_plate: () => <OnMyPlateSection />,
  favorites: () => <FavoritesSection />,
  agent_cost: () => <AgentCostSection />,
};

export const WorkspaceHomeView = observer(function WorkspaceHomeView() {
  const { data: currentUserProfile, updateTourCompleted } = useUserProfile();
  const { workspaceSlug } = useParams();
  const { preferences, reorder } = useHomePreferences(workspaceSlug?.toString());

  const handleTourCompleted = async () => {
    try {
      await updateTourCompleted();
    } catch (error) {
      console.error("Error updating tour completed", error);
    }
  };

  // Drop preference rows whose key has no renderer (legacy widget keys
  // like `quick_links`, `recents`, `my_stickies` end up here and are
  // skipped quietly).
  const renderable = useMemo(
    () => (preferences ?? []).filter((p) => p.is_enabled !== false && SECTION_RENDERERS[p.key] !== undefined),
    [preferences]
  );

  const handleReorder = (newData: THomePreference[]) => {
    void reorder(newData.map((row) => row.key));
  };

  return (
    <>
      {currentUserProfile && !currentUserProfile.is_tour_completed && (
        <div className="fixed top-0 left-0 z-20 grid h-full w-full place-items-center overflow-y-auto bg-backdrop transition-opacity">
          <TourRoot onComplete={handleTourCompleted} />
        </div>
      )}
      <HomePeekOverviewsRoot />
      <ContentWrapper className="mx-auto scrollbar-hide gap-6 bg-surface-1 px-page-x">
        <div className="mx-auto flex w-full max-w-[800px] flex-col gap-6 pt-2 pb-12">
          {/*
            Sortable wraps each child in a Draggable. Hover a section
            and the grip icon fades in at the top-right; users can grab
            anywhere on the section to reorder. Drop persists via the
            useHomePreferences `reorder` helper (optimistic + PATCH per
            row whose sort_order changed).

            Fallback render: until preferences load (or if the API is
            unreachable) we show the sections in their hardcoded default
            order so the home page never appears empty on first paint.
          */}
          {renderable.length === 0 ? (
            <DefaultSections />
          ) : (
            <Sortable<THomePreference>
              id="home-sections"
              data={renderable}
              keyExtractor={(row) => row.key}
              onChange={handleReorder}
              render={(row) => (
                <div className="group relative">
                  <div className="pointer-events-none absolute top-3 right-3 z-10 text-tertiary opacity-0 transition-opacity group-hover:opacity-100">
                    <GripVertical className="size-4" />
                  </div>
                  {SECTION_RENDERERS[row.key]?.()}
                </div>
              )}
            />
          )}
        </div>
      </ContentWrapper>
    </>
  );
});

function DefaultSections() {
  return (
    <>
      <InboxSection />
      <OnMyPlateSection />
      <FavoritesSection />
      <AgentCostSection />
    </>
  );
}

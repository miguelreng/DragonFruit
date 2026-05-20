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
import { cn } from "@plane/utils";
// hooks
import { useHomePreferences } from "@/hooks/use-home-preferences";
import { useUserProfile } from "@/hooks/store/user";
// plane web imports
import { HomePeekOverviewsRoot } from "@/plane-web/components/home";
import { TourRoot } from "@/plane-web/components/onboarding/tour/root";
// services
import type { THomePreference } from "@/services/home-preferences.service";
// local imports
import {
  ActivityHeatmapSection,
  AgentCostSection,
  FavoritesSection,
  InboxSection,
  OnMyPlateSection,
} from "./sections";

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
  activity: () => <ActivityHeatmapSection />,
  agent_cost: () => <AgentCostSection />,
};

type WorkspaceHomeViewProps = {
  /** Optional hero/header that scrolls with the rest of the home content. */
  header?: ReactNode;
};

export const WorkspaceHomeView = observer(function WorkspaceHomeView({ header }: WorkspaceHomeViewProps = {}) {
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
      <ContentWrapper className={cn("scrollbar-hide gap-6 bg-surface-1", header ? "!py-0 !px-0" : "px-page-x")}>
        {header}
        <div className={cn("mx-auto flex w-full max-w-[800px] flex-col gap-6 pb-12", header ? "pt-6" : "pt-2", header && "px-page-x")}>
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
                /*
                  Drag handle visibility:
                  • Appears only when the cursor is over the section TITLE row
                    (every section's first child is its `<div>` header strip)
                    or over the handle itself / the bridge zone next to it.
                  • The bridge is an invisible 24×40 div that fills the empty
                    space between the icon (at `-left-6`) and the section's
                    left edge, so cursor travel from title → icon never loses
                    hover. Bridge has no `bg`, no `pointer-events-none` (it
                    must accept hover), and sits below the icon's z-index.
                  • Title hover detection uses `:has(> section > div:first-child:hover)`
                    so we don't have to thread a class through every section.
                */
                <div className="group/handle relative">
                  <div aria-hidden className="absolute -left-5 top-0 z-0 h-10 w-5" />
                  <div
                    className={cn(
                      "absolute -left-5 top-3 z-10 text-tertiary opacity-0 transition-opacity",
                      "hover:opacity-100",
                      "group-has-[>div:hover]/handle:opacity-100",
                      "group-has-[>section>div:first-child:hover]/handle:opacity-100"
                    )}
                  >
                    <DragDotsIcon className="size-4" />
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

function DragDotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="6" cy="5" r="1.25" />
      <circle cx="10" cy="5" r="1.25" />
      <circle cx="6" cy="11" r="1.25" />
      <circle cx="10" cy="11" r="1.25" />
    </svg>
  );
}

function DefaultSections() {
  return (
    <>
      <InboxSection />
      <OnMyPlateSection />
      <FavoritesSection />
      <ActivityHeatmapSection />
      <AgentCostSection />
    </>
  );
}

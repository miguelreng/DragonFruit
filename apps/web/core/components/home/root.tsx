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
import { cn } from "@plane/utils";
// hooks
import { useHomePreferences } from "@/hooks/use-home-preferences";
import { useUserProfile } from "@/hooks/store/user";
// plane web imports
import { HomePeekOverviewsRoot } from "@/plane-web/components/home";
import { TourRoot } from "@/plane-web/components/onboarding/tour/root";
// local imports
import { ActivityHeatmapSection, AgentCostSection, FavoritesSection, InboxSection, OnMyPlateSection } from "./sections";

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
  const { preferences } = useHomePreferences(workspaceSlug?.toString());

  const handleTourCompleted = async () => {
    try {
      await updateTourCompleted();
    } catch (error) {
      console.error("Error updating tour completed", error);
    }
  };

  // Per-section enabled state. Layout is now a fixed grid, so we don't
  // honor `sort_order` — only is_enabled controls whether a cell renders.
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
      <ContentWrapper className={cn("scrollbar-hide gap-6 bg-surface-1", header ? "!px-0 !py-0" : "px-page-x")}>
        {header}
        <div
          className={cn(
            "mx-auto grid w-full max-w-[1100px] grid-cols-2 gap-x-6 gap-y-6 pb-12",
            header ? "pt-6" : "pt-2",
            header && "px-page-x"
          )}
        >
          {enabledKeys("activity") && SECTION_RENDERERS.activity()}
          {enabledKeys("inbox") && SECTION_RENDERERS.inbox()}
          {enabledKeys("agent_cost") && SECTION_RENDERERS.agent_cost()}
          {enabledKeys("on_my_plate") && SECTION_RENDERERS.on_my_plate()}
          {enabledKeys("favorites") && <div className="col-span-2">{SECTION_RENDERERS.favorites()}</div>}
        </div>
      </ContentWrapper>
    </>
  );
});

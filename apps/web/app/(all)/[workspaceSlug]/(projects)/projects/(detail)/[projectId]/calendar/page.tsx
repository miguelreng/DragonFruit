/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane constants
import { EIssueFilterType, ISSUE_DISPLAY_FILTERS_BY_PAGE, PROJECT_VIEW_TRACKER_ELEMENTS } from "@plane/constants";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
// components
import { PageHead } from "@/components/core/page-title";
import { CalendarLayout } from "@/components/issues/issue-layouts/calendar/roots/project-root";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectCalendarPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store
  const { getProjectById } = useProject();
  const { issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  // derived values
  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project.name} - Calendar` : undefined;
  const workItemFilters = issuesFilter?.getIssueFilters(projectId);
  const previousTaskLayoutRef = useRef<EIssueLayoutTypes | null>(null);
  const calendarWorkItemFilters = useMemo(
    () =>
      workItemFilters
        ? {
            ...workItemFilters,
            displayFilters: {
              ...workItemFilters.displayFilters,
              layout: EIssueLayoutTypes.CALENDAR,
            },
          }
        : undefined,
    [workItemFilters]
  );

  useSWR(
    workspaceSlug && projectId ? `PROJECT_CALENDAR_ISSUES_${workspaceSlug}_${projectId}` : null,
    async () => {
      if (workspaceSlug && projectId) {
        await issuesFilter?.fetchFilters(workspaceSlug, projectId);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  useEffect(() => {
    if (!workspaceSlug || !projectId || !workItemFilters) return;
    const currentLayout = workItemFilters.displayFilters?.layout;
    if (currentLayout !== EIssueLayoutTypes.CALENDAR && previousTaskLayoutRef.current === null) {
      previousTaskLayoutRef.current = currentLayout ?? EIssueLayoutTypes.SPREADSHEET;
    }
    if (currentLayout === EIssueLayoutTypes.CALENDAR) return;

    issuesFilter?.updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_FILTERS, {
      layout: EIssueLayoutTypes.CALENDAR,
    });
  }, [workspaceSlug, projectId, workItemFilters, issuesFilter]);

  useEffect(
    () => () => {
      const previousTaskLayout = previousTaskLayoutRef.current;
      if (!workspaceSlug || !projectId || !previousTaskLayout || previousTaskLayout === EIssueLayoutTypes.CALENDAR)
        return;

      issuesFilter?.updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_FILTERS, {
        layout: previousTaskLayout,
      });
    },
    [workspaceSlug, projectId, issuesFilter]
  );

  if (!workspaceSlug || !projectId || !workItemFilters) return <></>;

  return (
    <>
      <PageHead title={pageTitle} />
      <IssuesStoreContext.Provider value={EIssuesStoreType.PROJECT}>
        <ProjectLevelWorkItemFiltersHOC
          enableSaveView
          entityType={EIssuesStoreType.PROJECT}
          entityId={projectId}
          filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.filters}
          initialWorkItemFilters={calendarWorkItemFilters}
          updateFilters={issuesFilter?.updateFilterExpression.bind(issuesFilter, workspaceSlug, projectId)}
          projectId={projectId}
          workspaceSlug={workspaceSlug}
        >
          {({ filter: projectWorkItemsFilter }) => (
            <div className="relative flex h-full w-full flex-col overflow-hidden">
              {projectWorkItemsFilter && (
                <WorkItemFiltersRow
                  filter={projectWorkItemsFilter}
                  trackerElements={{
                    saveView: PROJECT_VIEW_TRACKER_ELEMENTS.PROJECT_HEADER_SAVE_AS_VIEW_BUTTON,
                  }}
                />
              )}
              <div className="relative h-full w-full overflow-auto bg-surface-1">
                <CalendarLayout />
              </div>
              <IssuePeekOverview />
            </div>
          )}
        </ProjectLevelWorkItemFiltersHOC>
      </IssuesStoreContext.Provider>
    </>
  );
}

export default observer(ProjectCalendarPage);

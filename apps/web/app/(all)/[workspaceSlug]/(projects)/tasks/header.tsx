/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { TBaseIssue } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { MyTasksFilterPills } from "@/components/home/sections/my-tasks-filter-pills";
import { MyTasksSearch } from "@/components/home/sections/my-tasks-search";
import { isOpenIssue, useMyTasksData } from "@/components/home/sections/use-my-tasks";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUser } from "@/hooks/store/user";

export const MyTasksHeader = observer(function MyTasksHeader() {
  const { workspaceSlug } = useParams();
  const { data: currentUser } = useUser();
  const { getStateById } = useProjectState();

  const slug = workspaceSlug?.toString();
  const userId = currentUser?.id;

  // Open-task count, shared with the My tasks list via the same SWR cache.
  const { data: myTasks } = useMyTasksData(slug, userId);
  const openTaskCount = (Array.isArray(myTasks?.results) ? (myTasks!.results as TBaseIssue[]) : []).filter((issue) =>
    isOpenIssue(issue, getStateById)
  ).length;

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-1.5">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink label="My tasks" disableTooltip />
              }
            />
          </Breadcrumbs>
          {openTaskCount > 0 && (
            <span className="rounded-full bg-layer-2 px-1.5 py-px text-11 font-medium text-tertiary">
              {openTaskCount}
            </span>
          )}
          {/* Label pills can wrap and crowd the bar — keep them off small screens. */}
          <div className="hidden items-center md:flex">
            <MyTasksFilterPills slug={slug} userId={userId} className="ml-2" />
          </div>
        </div>
      </Header.LeftItem>
      <Header.RightItem>
        <MyTasksSearch />
      </Header.RightItem>
    </Header>
  );
});

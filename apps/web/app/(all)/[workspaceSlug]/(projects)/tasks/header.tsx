/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { TBaseIssue } from "@dragonfruit/types";
import { Breadcrumbs, Header } from "@dragonfruit/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { MyTasksFilterPills } from "@/components/home/sections/my-tasks-filter-pills";
import { MyTasksSearch } from "@/components/home/sections/my-tasks-search";
import { isOpenIssue, useMyTasksData } from "@/components/home/sections/use-my-tasks";
import { GridIconShim, List } from "@/components/icons/lucide-shim";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUser } from "@/hooks/store/user";
import useLocalStorage from "@/hooks/use-local-storage";
import { cn } from "@dragonfruit/utils";
import { IconButton } from "@dragonfruit/propel/icon-button";

/** List/Table switcher — same segmented icon-toggle treatment as the Docs header. */
function MyTasksLayoutToggle({ slug }: { slug: string }) {
  const { storedValue, setValue } = useLocalStorage<"list" | "table">(`my-tasks-layout:${slug}`, "list");
  const layout = storedValue ?? "list";
  const options: Array<{ value: "list" | "table"; Icon: typeof List; label: string }> = [
    { value: "list", Icon: List, label: "List view" },
    { value: "table", Icon: GridIconShim, label: "Table view" },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-subtle p-0.5" role="group">
      {options.map(({ value, Icon, label }) => {
        const isActive = layout === value;
        return (
          <IconButton
            variant="ghost"
            size="base"
            icon={Icon}
            key={value}
            aria-label={label}
            title={label}
            aria-pressed={isActive}
            onClick={() => setValue(value)}
          />
        );
      })}
    </div>
  );
}

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
            <span className="rounded-full bg-layer-1 px-1.5 py-px text-11 font-medium text-tertiary">
              {openTaskCount}
            </span>
          )}
          {/* Label pills can wrap and crowd the bar — keep them off small screens. */}
          <div className="hidden items-center md:flex">
            <MyTasksFilterPills slug={slug} userId={userId} className="ml-2" />
          </div>
        </div>
      </Header.LeftItem>
      <Header.RightItem className="items-center">
        <MyTasksLayoutToggle slug={slug ?? "default"} />
        <MyTasksSearch />
      </Header.RightItem>
    </Header>
  );
});

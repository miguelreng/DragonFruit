/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import { observer } from "mobx-react";
import { ContentWrapper } from "@dragonfruit/ui";
// components
import { PageHead } from "@/components/core/page-title";
import { MyTasksSection } from "@/components/home/sections/my-tasks-section";
import useLocalStorage from "@/hooks/use-local-storage";
import { cn } from "@dragonfruit/utils";
// plane web imports
import { HomePeekOverviewsRoot } from "@/plane-web/components/home";

function MyTasksPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "default";
  const { storedValue } = useLocalStorage<"list" | "table">(`my-tasks-layout:${slug}`, "list");
  const layout = storedValue ?? "list";

  return (
    <>
      <PageHead title="My tasks" />
      {/* Mounts the task detail peek so a row's "Open" affordance has somewhere to render. */}
      <HomePeekOverviewsRoot />
      <ContentWrapper className="flex flex-col">
        {/* List keeps its reading measure; Table uses the full workspace width. */}
        <div className={cn("flex min-h-0 w-full flex-1 flex-col", layout === "list" && "max-w-xl")}>
          <MyTasksSection hideHeader groupByProject flat fullHeight layout={layout} />
        </div>
      </ContentWrapper>
    </>
  );
}

export default observer(MyTasksPage);

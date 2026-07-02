/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ContentWrapper } from "@plane/ui";
// components
import { PageHead } from "@/components/core/page-title";
import { MyTasksSection } from "@/components/home/sections/my-tasks-section";
// plane web imports
import { HomePeekOverviewsRoot } from "@/plane-web/components/home";

function MyTasksPage() {
  return (
    <>
      <PageHead title="My tasks" />
      {/* Mounts the task detail peek so a row's "Open" affordance has somewhere to render. */}
      <HomePeekOverviewsRoot />
      <ContentWrapper className="flex flex-col">
        {/* Cap the reading width so each task's title + inline metadata stay close together. */}
        <div className="flex min-h-0 w-full max-w-xl flex-1 flex-col">
          <MyTasksSection hideHeader groupByProject flat fullHeight />
        </div>
      </ContentWrapper>
    </>
  );
}

export default observer(MyTasksPage);

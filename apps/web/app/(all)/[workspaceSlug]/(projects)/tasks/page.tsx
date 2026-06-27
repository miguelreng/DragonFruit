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

function MyTasksPage() {
  return (
    <>
      <PageHead title="My tasks" />
      <ContentWrapper className="space-y-8">
        {/* Cap the reading width so each task's title + inline metadata stay close together. */}
        <div className="w-full max-w-xl">
          <MyTasksSection hideHeader groupByProject flat />
        </div>
      </ContentWrapper>
    </>
  );
}

export default observer(MyTasksPage);

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { WorkflowsRoot } from "@/components/workflows";

function WorkflowsPage() {
  return (
    <>
      <PageHead title="Workflows" />
      <WorkflowsRoot />
    </>
  );
}

export default observer(WorkflowsPage);

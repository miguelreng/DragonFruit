/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { PageHead } from "@/components/core/page-title";
// StickiesInfinite reads projectId from the route and scopes to this project.
import { StickiesInfinite } from "@/components/stickies/layout/stickies-infinite";

export default function ProjectStickiesPage() {
  return (
    <>
      <PageHead title="Stickies" />
      <div className="relative h-full w-full overflow-hidden overflow-y-auto">
        <StickiesInfinite />
      </div>
    </>
  );
}

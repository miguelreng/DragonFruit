/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
// Reuse the stickies header — useStickyOperations auto-scopes to this project.
import { WorkspaceStickyHeader } from "../../../../../stickies/header";

export default function ProjectStickiesListLayout() {
  return (
    <>
      <AppHeader header={<WorkspaceStickyHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}

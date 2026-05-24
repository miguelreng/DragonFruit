/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { BookmarkBoard } from "@/components/bookmarks";
import { PageHead } from "@/components/core/page-title";
import type { Route } from "./+types/page";

function WorkspaceBookmarksPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;

  return (
    <>
      <PageHead title="Bookmarks" />
      <BookmarkBoard workspaceSlug={workspaceSlug} mode="workspace" />
    </>
  );
}

export default observer(WorkspaceBookmarksPage);

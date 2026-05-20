/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// hooks
import { useUser } from "@/hooks/store/user";
// local imports
import { HomeHeroHeader } from "./home-hero-header";

export const WorkspaceDashboardHeader = observer(function WorkspaceDashboardHeader() {
  const { data: currentUser } = useUser();
  if (!currentUser) return null;
  return <HomeHeroHeader user={currentUser} />;
});

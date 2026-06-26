/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// hooks
import { useUser } from "@/hooks/store/user";
// local imports
import { HomeGreeting } from "./home-greeting";

export const WorkspaceDashboardHeader = observer(function WorkspaceDashboardHeader() {
  const { data: currentUser } = useUser();
  if (!currentUser) return null;
  return <HomeGreeting user={currentUser} />;
});

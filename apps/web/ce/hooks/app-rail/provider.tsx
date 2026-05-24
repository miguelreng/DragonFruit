/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { AppRailVisibilityProvider as CoreProvider } from "@/lib/app-rail";

interface AppRailVisibilityProviderProps {
  children: React.ReactNode;
}

/**
 * CE AppRailVisibilityProvider
 * Keeps the DragonFruit rail enabled as the primary app chrome.
 */
export const AppRailVisibilityProvider = observer(function AppRailVisibilityProvider({
  children,
}: AppRailVisibilityProviderProps) {
  return <CoreProvider isEnabled>{children}</CoreProvider>;
});

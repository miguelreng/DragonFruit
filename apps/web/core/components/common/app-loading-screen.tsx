/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import LogoBlack from "@/app/assets/plane-logos/logo-black.svg?url";
import { LogoSpinner } from "@/components/common/logo-spinner";

// Legacy login/logout flows still write this before a full-page navigation.
// Clear it so old values do not linger now that the loader no longer varies by intent.
const LOADING_INTENT_KEY = "df-loading-intent";

export function AppLoadingScreen() {
  useEffect(() => {
    window.sessionStorage.removeItem(LOADING_INTENT_KEY);
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-white px-6 text-primary dark:bg-black">
      <div className="flex flex-col items-center gap-5">
        <img src={LogoBlack} alt="DragonFruit" className="h-8 w-auto opacity-80 dark:invert" draggable={false} />
        <LogoSpinner />
      </div>
    </div>
  );
}

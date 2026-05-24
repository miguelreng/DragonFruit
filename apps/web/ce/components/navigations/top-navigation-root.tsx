/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { observer } from "mobx-react";
import { TopNavPowerK } from "@/components/navigation";

export const TopNavigationRoot = observer(function TopNavigationRoot() {
  return (
    <div className="z-[27] flex min-h-10 w-full items-center justify-center bg-surface-2 px-3.5 text-secondary transition-all duration-300">
      <div className="shrink-0">
        <TopNavPowerK />
      </div>
    </div>
  );
});

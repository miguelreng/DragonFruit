/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { IconButton } from "@plane/propel/icon-button";
import { PanelRight } from "@/components/icons/lucide-shim";
import { useAppTheme } from "@/hooks/store/use-app-theme";

export const SidebarHamburgerToggle = observer(function SidebarHamburgerToggle() {
  // store hooks
  const { toggleSidebar } = useAppTheme();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleSidebar();
  };

  return (
    <IconButton
      variant="ghost"
      size="lg"
      icon={PanelRight}
      aria-label="Toggle sidebar"
      iconClassName="text-secondary transition-all group-hover:text-primary"
      onClick={handleClick}
    />
  );
});

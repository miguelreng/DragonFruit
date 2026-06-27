/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { Outlet } from "react-router";
// components
import { getAccountActivePath } from "@/components/settings/helper";
import { SettingsMobileNav } from "@/components/settings/mobile/nav";
import { SettingsSidebarRoot } from "@/components/settings/sidebar/root";

// Account (personal) settings share the unified settings sidebar with workspace
// settings, but unlike workspace settings they are not role-gated — any member of
// the workspace (including guests) can manage their own account.
const AccountSettingLayout = observer(function AccountSettingLayout() {
  // next hooks
  const pathname = usePathname();

  return (
    <>
      <SettingsMobileNav hamburgerContent={SettingsSidebarRoot} activePath={getAccountActivePath(pathname) || ""} />
      <div className="inset-y-0 flex h-full w-full flex-row">
        <div className="relative flex size-full">
          <div className="hidden h-full md:block">
            <SettingsSidebarRoot />
          </div>
          <Outlet />
        </div>
      </div>
    </>
  );
});

export default AccountSettingLayout;

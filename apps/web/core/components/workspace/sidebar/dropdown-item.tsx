/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Menu } from "@headlessui/react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { IWorkspace } from "@plane/types";
import { cn, getUserRole } from "@plane/utils";
// plane web imports
import { SubscriptionPill } from "@/plane-web/components/common/subscription/subscription-pill";
// components
import { WorkspaceLogo } from "../logo";

type TProps = {
  workspace: IWorkspace;
  activeWorkspace: IWorkspace | null;
  handleItemClick: () => void;
  handleWorkspaceNavigation: (workspace: IWorkspace) => void;
};
const SidebarDropdownItem = observer(function SidebarDropdownItem(props: TProps) {
  const { workspace, activeWorkspace, handleItemClick, handleWorkspaceNavigation } = props;
  // router
  const { workspaceSlug } = useParams();
  // hooks
  const { t } = useTranslation();

  return (
    <Link
      key={workspace.id}
      href={`/${workspace.slug}`}
      onClick={() => {
        handleWorkspaceNavigation(workspace);
        handleItemClick();
      }}
      className="w-full"
      id={workspace.id}
    >
      <Menu.Item
        as="div"
        className={cn("px-2 py-1.5", {
          "bg-layer-transparent-active": workspace.id === activeWorkspace?.id,
          "hover:bg-layer-transparent-hover": workspace.id !== activeWorkspace?.id,
        })}
      >
        <div className="flex items-center justify-between gap-1 rounded-lg text-13 text-primary">
          <div className="relative flex min-w-0 flex-1 items-center justify-start gap-2">
            <WorkspaceLogo
              logo={workspace?.logo_url}
              name={workspace?.name}
              workspaceId={workspace?.id}
              classNames="size-7 rounded-md border border-subtle"
            />
            <div className="min-w-0 flex-1">
              <div
                className={`truncate text-left text-13 font-medium text-ellipsis ${workspaceSlug === workspace.slug ? "" : "text-secondary"}`}
              >
                {workspace.name}
              </div>
              <div className="flex w-fit gap-1.5 text-12 text-tertiary capitalize">
                <span>{getUserRole(workspace.role)?.toLowerCase() || "guest"}</span>
                <div className="m-auto h-0.5 w-0.5 rounded-full bg-layer-1/50" />
                <span className="capitalize">{t("member", { count: workspace.total_members || 0 })}</span>
              </div>
            </div>
          </div>
          {workspace.id !== activeWorkspace?.id && <SubscriptionPill workspace={workspace} />}
        </div>
      </Menu.Item>
    </Link>
  );
});

export default SidebarDropdownItem;

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
import type { IWorkspace } from "@plane/types";
import { cn } from "@plane/utils";
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
        className={cn("px-1.5 py-1", {
          "bg-layer-transparent-active": workspace.id === activeWorkspace?.id,
          "hover:bg-layer-transparent-hover": workspace.id !== activeWorkspace?.id,
        })}
      >
        <div className="flex h-8 items-center justify-between gap-2 rounded-lg text-13 text-primary">
          <div className="relative flex min-w-0 flex-1 items-center justify-start gap-2">
            <WorkspaceLogo
              logo={workspace?.logo_url}
              name={workspace?.name}
              workspaceId={workspace?.id}
              classNames="size-6 rounded-lg border border-subtle"
            />
            <span
              className={cn("min-w-0 flex-1 truncate text-left text-13 font-medium", {
                "text-secondary": workspaceSlug !== workspace.slug,
              })}
            >
              {workspace.name}
            </span>
          </div>
          {workspace.id !== activeWorkspace?.id && <SubscriptionPill workspace={workspace} />}
        </div>
      </Menu.Item>
    </Link>
  );
});

export default SidebarDropdownItem;

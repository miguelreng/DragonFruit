/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Settings, UserPlus } from "@/components/icons/lucide-shim";
import { Menu } from "@headlessui/react";
// plane imports
import { EUserPermissions } from "@plane/constants";
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
  handleClose: () => void;
};
const SidebarDropdownItem = observer(function SidebarDropdownItem(props: TProps) {
  const { workspace, activeWorkspace, handleItemClick, handleWorkspaceNavigation, handleClose } = props;
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
        className={cn("px-2 py-2", {
          "bg-layer-transparent-active": workspace.id === activeWorkspace?.id,
          "hover:bg-layer-transparent-hover": workspace.id !== activeWorkspace?.id,
        })}
      >
        <div className="flex items-center justify-between gap-1 rounded-sm p-1 text-13 text-primary">
          <div className="relative flex min-w-0 flex-1 items-center justify-start gap-2.5">
            <WorkspaceLogo
              logo={workspace?.logo_url}
              name={workspace?.name}
              workspaceId={workspace?.id}
              classNames="size-8 rounded-md border border-subtle"
            />
            <div className="min-w-0 flex-1">
              <div
                className={`truncate text-left text-13 font-medium text-ellipsis ${workspaceSlug === workspace.slug ? "" : "text-secondary"}`}
              >
                {workspace.name}
              </div>
              <div className="flex w-fit gap-2 text-13 text-tertiary capitalize">
                <span>{getUserRole(workspace.role)?.toLowerCase() || "guest"}</span>
                <div className="m-auto h-1 w-1 rounded-full bg-layer-1/50" />
                <span className="capitalize">{t("member", { count: workspace.total_members || 0 })}</span>
              </div>
            </div>
          </div>
          {workspace.id === activeWorkspace?.id ? (
            <div className="flex flex-shrink-0 items-center gap-0.5">
              {[EUserPermissions.ADMIN, EUserPermissions.MEMBER].includes(workspace?.role) && (
                <Link
                  href={`/${workspace.slug}/settings`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                  }}
                  aria-label={t("settings")}
                  className="flex size-7 items-center justify-center rounded-sm text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
                >
                  <Settings className="size-3.5" />
                </Link>
              )}
              {[EUserPermissions.ADMIN].includes(workspace?.role) && (
                <Link
                  href={`/${workspace.slug}/settings/members`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                  }}
                  aria-label={t("project_settings.members.invite_members.title")}
                  className="flex size-7 items-center justify-center rounded-sm text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
                >
                  <UserPlus className="size-3.5" />
                </Link>
              )}
            </div>
          ) : (
            <SubscriptionPill workspace={workspace} />
          )}
        </div>
      </Menu.Item>
    </Link>
  );
});

export default SidebarDropdownItem;

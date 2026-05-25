/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { MembersPropertyIcon } from "@plane/propel/icons";
// plane ui
import type { IUserLite } from "@plane/types";
import { Avatar, AvatarGroup } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import type { LucideIcon } from "@/components/icons/lucide-shim";
// hooks
import { useMember } from "@/hooks/store/use-member";

type AvatarProps = {
  showTooltip: boolean;
  userIds: string | string[] | null;
  icon?: LucideIcon;
  iconClassName?: string;
  size?: "sm" | "md" | "base" | "lg" | number;
  /**
   * Optional override so the dropdown wrapper can resolve identifiers the
   * workspace member store doesn't know about (e.g. agents).
   */
  getUserDetails?: (userId: string) => IUserLite | undefined;
};

export const ButtonAvatars = observer(function ButtonAvatars(props: AvatarProps) {
  const { showTooltip, userIds, icon: Icon, iconClassName, size = "md", getUserDetails: getUserDetailsProp } = props;
  // store hooks
  const { getUserDetails: getMemberDetails } = useMember();
  const getUserDetails = getUserDetailsProp ?? getMemberDetails;

  if (Array.isArray(userIds)) {
    if (userIds.length > 0)
      return (
        <AvatarGroup size={size} showTooltip={!showTooltip}>
          {userIds.map((userId) => {
            const userDetails = getUserDetails(userId);

            if (!userDetails) return;
            return <Avatar key={userId} src={getFileURL(userDetails.avatar_url)} name={userDetails.display_name} />;
          })}
        </AvatarGroup>
      );
  } else {
    if (userIds) {
      const userDetails = getUserDetails(userIds);
      return (
        <Avatar
          src={getFileURL(userDetails?.avatar_url ?? "")}
          name={userDetails?.display_name}
          size={size}
          showTooltip={!showTooltip}
        />
      );
    }
  }

  return Icon ? (
    <Icon className={cn("h-3 w-3 flex-shrink-0", iconClassName)} />
  ) : (
    <MembersPropertyIcon className={cn("mx-[4px] h-3 w-3 flex-shrink-0", iconClassName)} />
  );
});

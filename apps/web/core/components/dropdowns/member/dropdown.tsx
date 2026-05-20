/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import type { IUserLite } from "@plane/types";
import type { LucideIcon } from "@/components/icons/lucide-shim";
// hooks
import { useAgent } from "@/hooks/store/use-agent";
import { useMember } from "@/hooks/store/use-member";
// local imports
import { MemberDropdownBase } from "./base";
import type { MemberDropdownProps } from "./types";

type TMemberDropdownProps = {
  icon?: LucideIcon;
  memberIds?: string[];
  onClose?: () => void;
  optionsClassName?: string;
  projectId?: string;
  renderByDefault?: boolean;
} & MemberDropdownProps;

export const MemberDropdown = observer(function MemberDropdown(props: TMemberDropdownProps) {
  const { memberIds: propsMemberIds, projectId, includeAgents } = props;
  // router params
  const { workspaceSlug } = useParams();
  // store hooks
  const {
    getUserDetails,
    project: { getProjectMemberIds, fetchProjectMembers },
    workspace: { workspaceMemberIds },
  } = useMember();
  const agentStore = useAgent();

  const slug = workspaceSlug?.toString();
  const agentBotUserIds = includeAgents && slug ? agentStore.getEnabledAgentBotUserIds(slug) : [];

  const baseMemberIds = propsMemberIds
    ? propsMemberIds
    : projectId
      ? getProjectMemberIds(projectId, false)
      : workspaceMemberIds;

  // Append agents after humans so the trigger avatar group stays stable
  // when an agent is added or removed from the workspace.
  const memberIds = includeAgents
    ? [...(baseMemberIds ?? []), ...agentBotUserIds.filter((id) => !(baseMemberIds ?? []).includes(id))]
    : (baseMemberIds ?? []);

  const onDropdownOpen = () => {
    if (!baseMemberIds && projectId && slug) fetchProjectMembers(slug, projectId);
    if (includeAgents && slug && !agentStore.fetchedWorkspaces[slug]) {
      void agentStore.fetchAgents(slug).catch(() => {
        // Soft-fail: the dropdown still works for human members.
      });
    }
  };

  const resolveUserDetails = useCallback(
    (userId: string): IUserLite | undefined =>
      getUserDetails(userId) ?? (includeAgents ? agentStore.getAgentAsUserLite(userId) : undefined),
    [getUserDetails, agentStore, includeAgents]
  );

  return (
    <MemberDropdownBase
      {...props}
      getUserDetails={resolveUserDetails}
      memberIds={memberIds}
      onDropdownOpen={onDropdownOpen}
    />
  );
});

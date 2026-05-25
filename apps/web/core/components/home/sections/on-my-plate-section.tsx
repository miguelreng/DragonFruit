/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { PriorityIcon, StateGroupIcon, YourWorkIcon } from "@plane/propel/icons";
import type { TBaseIssue, TIssuesResponse } from "@plane/types";
import { ChevronRight } from "@/components/icons/lucide-shim";
import { useUser } from "@/hooks/store/user";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { UserService } from "@/services/user.service";

const PREVIEW_COUNT = 5;
const userService = new UserService();

export const OnMyPlateSection = observer(function OnMyPlateSection() {
  const { workspaceSlug } = useParams();
  const { data: currentUser } = useUser();
  const { getStateById } = useProjectState();
  const { getProjectIdentifierById } = useProject();

  const slug = workspaceSlug?.toString();
  const userId = currentUser?.id;

  const { data, isLoading } = useSWR<TIssuesResponse | null>(
    slug && userId ? `HOME_ON_MY_PLATE_${slug}_${userId}` : null,
    slug && userId
      ? () =>
          userService.getUserProfileIssues(slug, userId, {
            assignees: userId,
            per_page: PREVIEW_COUNT,
          })
      : null,
    { revalidateOnFocus: false }
  );

  const issues: TBaseIssue[] = Array.isArray(data?.results) ? data!.results : [];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <YourWorkIcon className="size-4 text-tertiary" />
          <h3 className="text-14 font-semibold text-secondary">What's on my plate</h3>
          {typeof data?.total_count === "number" && data.total_count > 0 && (
            <span className="rounded-full bg-layer-2 px-1.5 py-px text-11 font-medium text-tertiary">
              {data.total_count}
            </span>
          )}
        </div>
        {userId && (
          <Link
            href={`/${slug}/profile/${userId}`}
            className="flex items-center gap-1 text-12 font-medium text-tertiary hover:text-secondary"
          >
            View all
            <ChevronRight className="size-3" />
          </Link>
        )}
      </div>
      <div className="rounded-[18px] border border-subtle bg-surface-1">
        {isLoading ? (
          <div className="px-3 py-6 text-center text-12 text-placeholder">Loading…</div>
        ) : issues.length === 0 ? (
          <div className="px-3 py-6 text-center text-12 text-placeholder">Nothing on your plate. Enjoy the calm.</div>
        ) : (
          <ul className="divide-y divide-subtle">
            {issues.slice(0, PREVIEW_COUNT).map((issue) => {
              const state = issue.state_id ? getStateById(issue.state_id) : undefined;
              const projectIdentifier = getProjectIdentifierById(issue.project_id) ?? "";
              const href = `/${slug}/browse/${projectIdentifier}-${issue.sequence_id}/`;
              return (
                <li key={issue.id}>
                  <Link href={href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-layer-transparent-hover">
                    <StateGroupIcon
                      stateGroup={state?.group ?? "backlog"}
                      color={state?.color}
                      className="size-4 flex-shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-13 text-secondary">{issue.name}</span>
                    {projectIdentifier && issue.sequence_id != null && (
                      <span className="flex-shrink-0 text-11 font-medium text-placeholder">
                        {projectIdentifier}-{issue.sequence_id}
                      </span>
                    )}
                    <PriorityIcon priority={issue.priority} withContainer size={12} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
});

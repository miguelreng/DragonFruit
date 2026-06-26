/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import type { IUser } from "@plane/types";
// components
import { WorkspaceCreateDocButton } from "@/components/docs/workspace-create-doc-button";
// hooks
import { useCurrentTime } from "@/hooks/use-current-time";

interface Props {
  user: IUser;
}

export function HomeGreeting({ user }: Props) {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { currentTime } = useCurrentTime();

  const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(currentTime);
  const weekDay = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(currentTime);
  const name = user.first_name?.trim() || user.display_name?.trim() || "there";

  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-22 font-semibold text-primary">Welcome back, {name}</h1>
        <p className="mt-1 text-13 text-tertiary">
          {weekDay}, {date}
        </p>
      </div>
      {slug && (
        <div className="flex-shrink-0">
          <WorkspaceCreateDocButton workspaceSlug={slug} defaultType="doc" />
        </div>
      )}
    </header>
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
// types
import type { TPageNavigationTabs } from "@plane/types";
// helpers
import { cn } from "@plane/utils";

type TPageTabNavigation = {
  workspaceSlug: string;
  projectId: string;
  pageType: TPageNavigationTabs;
  basePath?: string;
};

export function PageTabNavigation(props: TPageTabNavigation) {
  const { workspaceSlug, projectId, pageType, basePath = "pages" } = props;
  const primaryLabel = basePath === "whiteboards" ? "All whiteboards" : "All docs";
  const pageTabs: { key: TPageNavigationTabs; label: string }[] = [
    {
      key: "all",
      label: primaryLabel,
    },
    {
      key: "public",
      label: "Public",
    },
    {
      key: "private",
      label: "Private",
    },
    {
      key: "archived",
      label: "Archived",
    },
  ];

  const handleTabClick = (e: React.MouseEvent<HTMLAnchorElement>, tabKey: TPageNavigationTabs) => {
    if (tabKey === pageType) e.preventDefault();
  };

  return (
    <div className="flex h-full items-center gap-1.5">
      {pageTabs.map((tab) => {
        const isActive = tab.key === pageType;
        return (
          <Link
            key={tab.key}
            href={`/${workspaceSlug}/projects/${projectId}/${basePath}?type=${tab.key}`}
            onClick={(e) => handleTabClick(e, tab.key)}
            className={cn("rounded-full px-2.5 py-0.5 text-12 font-medium transition-colors", {
              "bg-accent-subtle text-accent-primary": isActive,
              "bg-layer-1 text-tertiary hover:text-secondary": !isActive,
            })}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

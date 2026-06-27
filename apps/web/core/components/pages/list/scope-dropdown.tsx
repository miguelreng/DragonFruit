/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRouter } from "next/navigation";
import { ChevronDown } from "@/components/icons/lucide-shim";
// plane imports
import { getButtonStyling } from "@plane/propel/button";
import { CheckIcon } from "@/components/icons/propel-shim";
import type { TPageNavigationTabs } from "@plane/types";
import { CustomMenu } from "@plane/ui";

type Props = {
  workspaceSlug: string;
  projectId: string;
  pageType: TPageNavigationTabs;
  basePath?: string;
};

/**
 * Compact privacy/scope selector for the docs & whiteboards list bar — the
 * dropdown counterpart to the All / Public / Private / Archived pills, so the
 * control row stays on a single level (matching the Docs header).
 */
export function PageScopeDropdown(props: Props) {
  const { workspaceSlug, projectId, pageType, basePath = "pages" } = props;
  const router = useRouter();
  const primaryLabel = basePath === "whiteboards" ? "All whiteboards" : "All docs";
  const options: { key: TPageNavigationTabs; label: string }[] = [
    { key: "all", label: primaryLabel },
    { key: "public", label: "Public" },
    { key: "private", label: "Private" },
    { key: "archived", label: "Archived" },
  ];
  const active = options.find((option) => option.key === pageType) ?? options[0];

  return (
    <CustomMenu
      customButton={
        <div className={getButtonStyling("secondary", "lg")}>
          {active.label}
          <ChevronDown className="size-3" />
        </div>
      }
      placement="bottom-start"
      closeOnSelect
    >
      {options.map((option) => (
        <CustomMenu.MenuItem
          key={option.key}
          className="flex items-center justify-between gap-2"
          onClick={() => router.push(`/${workspaceSlug}/projects/${projectId}/${basePath}?type=${option.key}`)}
        >
          {option.label}
          {pageType === option.key && <CheckIcon className="h-3 w-3" />}
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
}

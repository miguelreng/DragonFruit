/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPartialProject } from "@/plane-web/types";
// plane propel imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { ChevronDownIcon } from "@/components/icons/propel-shim";
import { Tooltip } from "@plane/propel/tooltip";

type TProjectHeaderButtonProps = {
  project: TPartialProject;
};

export function ProjectHeaderButton({ project }: TProjectHeaderButtonProps) {
  return (
    <Tooltip tooltipContent={project.name} position="bottom">
      <div className="flex max-w-48 items-center gap-1.5 text-left select-none">
        <Logo logo={project.logo_props} size={16} />
        <span className="truncate text-13 font-semibold text-secondary">{project.name}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-tertiary opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
      </div>
    </Tooltip>
  );
}

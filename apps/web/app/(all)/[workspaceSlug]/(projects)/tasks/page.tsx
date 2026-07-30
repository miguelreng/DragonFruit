/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import { observer } from "mobx-react";
import { ContentWrapper } from "@plane/ui";
// components
import { PageHead } from "@/components/core/page-title";
import { MyTasksSection } from "@/components/home/sections/my-tasks-section";
import { GridIconShim, List } from "@/components/icons/lucide-shim";
import useLocalStorage from "@/hooks/use-local-storage";
import { cn } from "@plane/utils";
// plane web imports
import { HomePeekOverviewsRoot } from "@/plane-web/components/home";

function MyTasksPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "default";
  const { storedValue, setValue } = useLocalStorage<"list" | "table">(`my-tasks-layout:${slug}`, "list");
  const layout = storedValue ?? "list";

  return (
    <>
      <PageHead title="My tasks" />
      {/* Mounts the task detail peek so a row's "Open" affordance has somewhere to render. */}
      <HomePeekOverviewsRoot />
      <ContentWrapper className="flex flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-18 font-semibold text-primary">My tasks</h1>
          <div className="flex items-center rounded-lg border border-subtle bg-surface-1 p-0.5" role="group">
            {[
              { value: "list" as const, label: "List", Icon: List },
              { value: "table" as const, label: "Table", Icon: GridIconShim },
            ].map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={layout === value}
                onClick={() => setValue(value)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-2 text-11 font-medium text-tertiary transition-colors",
                  layout === value ? "bg-layer-2 text-primary shadow-raised-100" : "hover:text-secondary"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
        {/* List keeps its reading measure; Table uses the full workspace width. */}
        <div className={cn("flex min-h-0 w-full flex-1 flex-col", layout === "list" && "max-w-xl")}>
          <MyTasksSection hideHeader groupByProject flat fullHeight layout={layout} />
        </div>
      </ContentWrapper>
    </>
  );
}

export default observer(MyTasksPage);

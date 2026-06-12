/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { HugeiconsIcon } from "@hugeicons/react";
import { StickyNote02Icon } from "@hugeicons/core-free-icons";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { Button } from "@plane/propel/button";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { ViewModeToggle, type ViewMode } from "@/components/core/view-mode-toggle";
import { STICKIES_VIEW_MODE_STORAGE_KEY } from "@/components/stickies/layout/stickies-list";
import { StickySearch } from "@/components/stickies/modal/search";
import { useStickyOperations } from "@/components/stickies/sticky/use-operations";
// hooks
import useLocalStorage from "@/hooks/use-local-storage";
import { useSticky } from "@/hooks/use-stickies";

export const WorkspaceStickyHeader = observer(function WorkspaceStickyHeader() {
  const { workspaceSlug } = useParams();
  // hooks
  const { creatingSticky, toggleShowNewSticky } = useSticky();
  const { stickyOperations } = useStickyOperations({ workspaceSlug: workspaceSlug?.toString() });
  // view mode (read by the stickies layout via the shared local storage key)
  const { storedValue: storedViewMode, setValue: setViewMode } = useLocalStorage<ViewMode>(
    STICKIES_VIEW_MODE_STORAGE_KEY,
    "grid"
  );
  const viewMode: ViewMode = storedViewMode ?? "grid";

  return (
    <>
      <Header>
        <Header.LeftItem>
          <div className="flex items-center gap-2.5">
            <Breadcrumbs>
              <Breadcrumbs.Item
                component={
                  <BreadcrumbLink
                    label={`Stickies`}
                    icon={
                      <HugeiconsIcon
                        icon={StickyNote02Icon}
                        className="size-4 text-secondary"
                        color="currentColor"
                        strokeWidth={1.5}
                      />
                    }
                  />
                }
              />
            </Breadcrumbs>
          </div>
        </Header.LeftItem>

        <Header.RightItem>
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          <StickySearch />
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              toggleShowNewSticky(true);
              stickyOperations.create();
            }}
            loading={creatingSticky}
          >
            Add sticky
          </Button>
        </Header.RightItem>
      </Header>
    </>
  );
});

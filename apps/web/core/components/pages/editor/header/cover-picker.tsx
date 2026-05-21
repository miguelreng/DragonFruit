/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment } from "react";
import { observer } from "mobx-react";
import { Popover, Transition } from "@headlessui/react";
import { Image, X } from "@/components/icons/lucide-shim";
// plane imports
import { cn } from "@plane/utils";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local
import { PAGE_COVER_OPTIONS, readPageCoverId, type TPageCoverId } from "./cover-options";

type Props = {
  page: TPageInstance;
  /**
   * `inline` (default): renders as a normal action button matching the "Icon"
   * button styling — used when no cover is set, in the action row above the
   * title. `overlay`: renders as a compact white-on-dark chip pinned to the
   * cover image's bottom-right corner — used when a cover is set.
   */
  variant?: "inline" | "overlay";
};

/**
 * Picker for the doc cover image. Currently offers the three public-domain
 * Renaissance paintings already used on the home hero. Selection is stored
 * in `view_props.cover` via the standard page update flow — no new column.
 */
export const PageCoverPicker = observer(function PageCoverPicker({ page, variant = "inline" }: Props) {
  const currentId = readPageCoverId(page.view_props);

  const select = (next: TPageCoverId | null) => {
    // `updateViewProps` does the optimistic write + PATCH for us. Passing
    // `undefined` for `cover` makes the store drop the key from the JSON
    // payload, which is how we "remove" a cover.
    void page.updateViewProps({ cover: next ?? undefined });
  };

  return (
    <Popover className="relative">
      {({ open }) => (
        <>
          <Popover.Button
            type="button"
            disabled={!page.isContentEditable}
            className={cn(
              "flex items-center gap-1 rounded-sm text-13 font-medium transition-colors outline-none",
              variant === "inline" && [
                "p-1 text-tertiary hover:bg-layer-1",
                { "bg-layer-1": open },
              ],
              variant === "overlay" && [
                "px-2 py-1 text-white/90 hover:bg-white/10",
                { "bg-white/10": open },
              ]
            )}
          >
            <Image className="size-4 flex-shrink-0" />
            {currentId ? "Change cover" : "Cover"}
          </Popover.Button>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="opacity-0 translate-y-1"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-in duration-75"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-1"
          >
            <Popover.Panel className="absolute left-0 z-20 mt-1 w-80 rounded-md border border-subtle bg-surface-1 p-2 shadow-md">
              <div className="flex flex-col gap-1">
                {PAGE_COVER_OPTIONS.map((opt) => {
                  const isActive = currentId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => select(opt.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-sm p-1.5 text-left transition-colors hover:bg-layer-1",
                        { "bg-layer-1": isActive }
                      )}
                    >
                      <div
                        className="h-10 w-16 shrink-0 rounded-sm bg-cover bg-center"
                        style={{ backgroundImage: `url(${opt.src})` }}
                        aria-hidden
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-12 font-medium text-primary">{opt.label}</span>
                        <span className="truncate text-11 text-tertiary">{opt.artist}</span>
                      </div>
                    </button>
                  );
                })}
                {currentId && (
                  <>
                    <div className="my-1 border-t border-subtle" />
                    <button
                      type="button"
                      onClick={() => select(null)}
                      className="flex items-center gap-2 rounded-sm p-1.5 text-left text-12 text-danger-primary transition-colors hover:bg-layer-1"
                    >
                      <X className="size-3.5 flex-shrink-0" />
                      Remove cover
                    </button>
                  </>
                )}
              </div>
            </Popover.Panel>
          </Transition>
        </>
      )}
    </Popover>
  );
});

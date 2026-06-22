/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "react-router";
import { useOutsideClickDetector } from "@plane/hooks";
import { SearchIcon, CloseIcon } from "@/components/icons/propel-shim";
import { IconButton } from "@plane/propel/icon-button";
import { cn } from "@plane/utils";

/**
 * Expanding header search for the My tasks list — mirrors the search affordance
 * on other list pages. The query is kept in the `?q=` URL param so the list
 * (`MyTasksSection`) can read it across the header/page boundary.
 */
export const MyTasksSearch = observer(function MyTasksSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  // Local source of truth for the input so typing stays snappy (no per-keystroke
  // router round-trip lag); the URL is updated alongside for the list to read.
  const [value, setValue] = useState(urlQuery);
  const [isOpen, setIsOpen] = useState(urlQuery.trim() !== "");
  const inputRef = useRef<HTMLInputElement>(null);

  const writeQuery = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("q", next);
        else params.delete("q");
        return params;
      },
      { replace: true }
    );
  };

  const handleChange = (next: string) => {
    setValue(next);
    writeQuery(next);
  };

  const handleClear = () => {
    setValue("");
    writeQuery("");
    setIsOpen(false);
  };

  useOutsideClickDetector(inputRef, () => {
    if (isOpen && value.trim() === "") setIsOpen(false);
  });

  return (
    <div className="flex items-center">
      {!isOpen && (
        <IconButton
          variant="ghost"
          size="lg"
          className="-mr-1"
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          icon={SearchIcon}
        />
      )}
      <div
        className={cn(
          "ml-auto flex w-0 items-center justify-start gap-1 overflow-hidden rounded-lg border border-transparent bg-surface-1 text-placeholder opacity-0 transition-[width] ease-linear",
          { "w-44 border-subtle px-2.5 py-1.5 opacity-100 sm:w-64": isOpen }
        )}
      >
        <SearchIcon className="h-3.5 w-3.5 flex-shrink-0" />
        <input
          ref={inputRef}
          className="w-full min-w-0 border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
          placeholder="Search"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (value.trim() !== "") handleChange("");
              else {
                setIsOpen(false);
                inputRef.current?.blur();
              }
            }
          }}
        />
        {isOpen && (
          <button type="button" className="grid flex-shrink-0 place-items-center" onClick={handleClear}>
            <CloseIcon className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
});

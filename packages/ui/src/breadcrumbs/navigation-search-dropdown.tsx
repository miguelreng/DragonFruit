/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { useState } from "react";
import { Tooltip } from "@plane/propel/tooltip";
import type { ICustomSearchSelectOption } from "@plane/types";
import { CustomSearchSelect } from "../dropdowns";
import { cn } from "../utils";
import { Breadcrumbs } from "./breadcrumbs";

const BreadcrumbIconWrapper = React.memo(function BreadcrumbIconWrapper({ icon }: { icon: React.ReactNode }) {
  return <div className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden !text-16">{icon}</div>;
});

BreadcrumbIconWrapper.displayName = "BreadcrumbIconWrapper";

const BreadcrumbLabelWrapper = React.memo(function BreadcrumbLabelWrapper({
  label,
  className = "",
}: {
  label: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative inline-flex max-w-[150px] items-center truncate overflow-hidden leading-none text-primary",
        className
      )}
    >
      {label}
    </div>
  );
});

BreadcrumbLabelWrapper.displayName = "BreadcrumbLabelWrapper";

const BreadcrumbContent = React.memo(function BreadcrumbContent({
  icon,
  label,
}: {
  icon?: React.ReactNode;
  label?: React.ReactNode;
}) {
  if (!icon && !label) return null;

  return (
    <div className="inline-flex items-center gap-1.5 leading-none">
      {icon && <BreadcrumbIconWrapper icon={icon} />}
      {label && <BreadcrumbLabelWrapper label={label} />}
    </div>
  );
});

BreadcrumbContent.displayName = "BreadcrumbContent";

type TBreadcrumbNavigationSearchDropdownProps = {
  icon?: React.ReactNode;
  title?: string;
  selectedItem: string;
  navigationItems: ICustomSearchSelectOption[];
  onChange?: (value: string) => void;
  navigationDisabled?: boolean;
  isLast?: boolean;
  handleOnClick?: () => void;
  disableRootHover?: boolean;
  shouldTruncate?: boolean;
  titleClassName?: string;
};

export function BreadcrumbNavigationSearchDropdown(props: TBreadcrumbNavigationSearchDropdownProps) {
  const {
    icon,
    title,
    selectedItem,
    navigationItems,
    onChange,
    navigationDisabled = false,
    isLast = false,
    handleOnClick,
    shouldTruncate = false,
    titleClassName = "",
  } = props;
  // state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <CustomSearchSelect
      onOpen={() => {
        setIsDropdownOpen(true);
      }}
      onClose={() => {
        setIsDropdownOpen(false);
      }}
      options={navigationItems}
      value={selectedItem}
      onChange={(value: string) => {
        if (value !== selectedItem) {
          onChange?.(value);
        }
      }}
      customButton={
        <>
          <Tooltip tooltipContent={title} position="bottom">
            {/* span, not button: CustomSearchSelect already wraps customButton in its own
                <button>, so a nested <button> here is invalid DOM. Click handling still works
                on a span (the event bubbles; stopPropagation blocks the outer toggle). */}
            <span
              className={cn(
                "group flex h-full cursor-pointer items-center gap-2 rounded-lg rounded-r-none px-1.5 py-1 text-13 font-medium text-tertiary",
                {
                  "hover:bg-layer-1 hover:text-primary": !isLast,
                }
              )}
              {...(isLast
                ? {}
                : {
                    role: "button",
                    tabIndex: 0,
                    onClick: (e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleOnClick?.();
                    },
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        handleOnClick?.();
                      }
                    },
                  })}
            >
              {shouldTruncate && <div className="flex text-tertiary @4xl:hidden">...</div>}
              <div className={cn("flex items-center leading-none", { "hidden @4xl:flex": shouldTruncate })}>
                <BreadcrumbContent
                  icon={icon}
                  label={<BreadcrumbLabelWrapper label={title} className={titleClassName} />}
                />
              </div>
            </span>
          </Tooltip>
          <Breadcrumbs.Separator
            className={cn("rounded-r-sm", {
              "bg-layer-1": isDropdownOpen && !isLast,
              "hover:bg-layer-1": !isLast,
            })}
            containerClassName="p-0"
            iconClassName={cn("group-hover:rotate-90 hover:text-primary", {
              "text-primary": isDropdownOpen,
              "rotate-90": isDropdownOpen || isLast,
            })}
            showDivider={!isLast}
          />
        </>
      }
      disabled={navigationDisabled}
      className="h-full rounded-lg"
      customButtonClassName={cn(
        "group flex h-full cursor-pointer items-center gap-0.5 rounded-lg outline-none hover:bg-surface-2",
        {
          "bg-surface-2": isDropdownOpen,
        }
      )}
    />
  );
}

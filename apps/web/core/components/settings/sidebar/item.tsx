/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import Link from "next/link";
// plane imports
import { cn } from "@plane/utils";

export type SettingsSidebarIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;
export type SettingsSidebarIconPair = {
  icon: SettingsSidebarIcon;
  activeIcon: SettingsSidebarIcon;
};

type Props = {
  isActive: boolean;
  label: string;
} & ({ as: "button"; onClick: () => void } | { as: "link"; href: string }) &
  (
    | {
        icon: SettingsSidebarIcon;
        activeIcon?: SettingsSidebarIcon;
      }
    | { iconNode: React.ReactElement }
  );

export function SettingsSidebarItem(props: Props) {
  const { as, isActive, label } = props;
  // common class
  const className = cn(
    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-13 leading-5 font-medium text-secondary transition-colors",
    {
      "!bg-layer-1-active !text-primary": isActive,
      "hover:bg-layer-2-hover hover:text-primary active:bg-layer-2-active dark:hover:bg-white/[0.04] dark:active:bg-white/[0.08]":
        !isActive,
    }
  );
  // common content
  const content = (
    <>
      {"icon" in props ? (
        <span className="grid size-4 shrink-0 place-items-center">
          {(() => {
            const Icon = isActive && props.activeIcon ? props.activeIcon : props.icon;
            return <Icon className="size-3.5" />;
          })()}
        </span>
      ) : (
        props.iconNode
      )}
      <span className="truncate">{label}</span>
    </>
  );

  if (as === "button") {
    return (
      <button type="button" className={className} onClick={props.onClick}>
        {content}
      </button>
    );
  }

  return (
    <Link className={className} href={props.href}>
      {content}
    </Link>
  );
}

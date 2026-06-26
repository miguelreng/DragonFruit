/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
import type { IconProps } from "@solar-icons/react";

type LucideIcon = ComponentType<IconProps>;

export type TSidebarMenuItem = {
  Icon: LucideIcon | React.ComponentType<{ className?: string }>;
  name: string;
  description: string;
  href: string;
};

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
// helpers
import { Button } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
// types
import { usePlatformOS } from "@/hooks/use-platform-os";
import { BACKGROUND_BUTTON_VARIANTS, BORDER_BUTTON_VARIANTS } from "./constants";
import type { TButtonVariants } from "./types";

export type DropdownButtonProps = {
  children: React.ReactNode;
  className?: string;
  isActive: boolean;
  tooltipContent?: string | React.ReactNode | null;
  tooltipHeading: string;
  showTooltip: boolean;
  variant: TButtonVariants;
  renderToolTipByDefault?: boolean;
};

type ButtonProps = {
  children: React.ReactNode;
  className?: string;
  isActive: boolean;
  tooltipContent?: string | React.ReactNode | null;
  tooltipHeading: string;
  showTooltip: boolean;
  renderToolTipByDefault?: boolean;
};

export function DropdownButton(props: DropdownButtonProps) {
  const {
    children,
    className,
    isActive,
    tooltipContent,
    renderToolTipByDefault = true,
    tooltipHeading,
    showTooltip,
    variant,
  } = props;
  const ButtonToRender: React.FC<ButtonProps> = BORDER_BUTTON_VARIANTS.includes(variant)
    ? BorderButton
    : BACKGROUND_BUTTON_VARIANTS.includes(variant)
      ? BackgroundButton
      : TransparentButton;

  return (
    <ButtonToRender
      className={className}
      isActive={isActive}
      tooltipContent={tooltipContent}
      tooltipHeading={tooltipHeading}
      showTooltip={showTooltip}
      renderToolTipByDefault={renderToolTipByDefault}
    >
      {children}
    </ButtonToRender>
  );
}

function BorderButton(props: ButtonProps) {
  const { children, className, isActive, tooltipContent, renderToolTipByDefault, tooltipHeading, showTooltip } = props;
  const { isMobile } = usePlatformOS();

  return (
    <Tooltip
      tooltipHeading={tooltipHeading}
      tooltipContent={<>{tooltipContent}</>}
      disabled={!showTooltip}
      isMobile={isMobile}
      renderByDefault={renderToolTipByDefault}
    >
      {/* DragonFruit: flat redesign of Plane's bordered property pill.
       *
       * Previously: `border-[0.5px] border-strong` — a hairline rectangle
       * around every chip (state, priority, date, assignee, label, etc.),
       * which made each row read as 5–6 boxed buttons.
       *
       * Now: borderless. The icon + text carry the meaning; a soft hover
       * background reveals the click affordance on demand. Linear/Notion
       * vocabulary — the row feels quieter and the actual task data leads.
       * The variant name (`border-with-text` / `border-without-text`) is
       * preserved for backwards compatibility so call-sites don't churn,
       * but the visual is no longer literally bordered. */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "flex h-full w-full items-center justify-start gap-1.5 rounded-lg border-[0.5px] border-transparent transition-colors hover:bg-layer-1",
          {
            "bg-layer-1": isActive,
          },
          className
        )}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

function BackgroundButton(props: ButtonProps) {
  const { children, className, tooltipContent, tooltipHeading, renderToolTipByDefault, showTooltip } = props;
  const { isMobile } = usePlatformOS();
  return (
    <Tooltip
      tooltipHeading={tooltipHeading}
      tooltipContent={<>{tooltipContent}</>}
      disabled={!showTooltip}
      isMobile={isMobile}
      renderByDefault={renderToolTipByDefault}
    >
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "flex h-full w-full items-center justify-between gap-1.5 bg-layer-3 hover:bg-layer-1-hover",
          className
        )}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

function TransparentButton(props: ButtonProps) {
  const { children, className, isActive, tooltipContent, tooltipHeading, renderToolTipByDefault, showTooltip } = props;
  const { isMobile } = usePlatformOS();
  return (
    <Tooltip
      tooltipHeading={tooltipHeading}
      tooltipContent={<>{tooltipContent}</>}
      disabled={!showTooltip}
      isMobile={isMobile}
      renderByDefault={renderToolTipByDefault}
    >
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "flex h-full w-full items-center justify-between gap-1.5",
          {
            "bg-layer-transparent-active": isActive,
          },
          className
        )}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

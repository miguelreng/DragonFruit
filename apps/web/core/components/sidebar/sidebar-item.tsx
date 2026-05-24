/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import Link from "next/link";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";

// ============================================================================
// TYPES
// ============================================================================

interface AppSidebarItemData {
  href?: string;
  label?: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  showLabel?: boolean;
  isInline?: boolean;
}

interface AppSidebarItemProps {
  variant?: "link" | "button";
  item?: AppSidebarItemData;
}

interface AppSidebarItemLabelProps {
  highlight?: boolean;
  label?: string;
  isInline?: boolean;
}

interface AppSidebarItemIconProps {
  icon?: React.ReactNode;
  highlight?: boolean;
  isInline?: boolean;
}

interface AppSidebarLinkItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  children: React.ReactNode;
  className?: string;
  isInline?: boolean;
  isActive?: boolean;
  tooltipContent?: string;
  tooltipDisabled?: boolean;
}

interface AppSidebarButtonItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  isInline?: boolean;
  isActive?: boolean;
  tooltipContent?: string;
  tooltipDisabled?: boolean;
}

interface AppSidebarTooltipProps {
  children: React.ReactElement;
  disabled?: boolean;
  tooltipContent?: string;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  base: "group flex flex-col gap-0.5 items-center justify-center text-tertiary dark:text-white/65",
  baseInline:
    "group relative flex w-fit max-w-full cursor-pointer items-center rounded-md px-2 py-1 outline-none text-tertiary dark:text-white/70 !justify-start gap-1.5",
  icon: "flex items-center justify-center gap-2 size-8 rounded-md text-icon-tertiary dark:text-white/55 [&_svg]:size-5 [&_svg]:text-current",
  iconActive: "bg-white/55 !text-secondary dark:!bg-layer-1 dark:!text-accent-primary",
  iconInactive:
    "group-hover:text-icon-secondary group-hover:bg-layer-transparent-hover !text-icon-tertiary dark:!text-white/55 dark:group-hover:!text-white/85 dark:group-hover:bg-white/[0.08]",
  iconInline: "flex size-5 flex-shrink-0 items-center justify-center [&_svg]:size-4 [&_svg]:text-current",
  iconInlineActive: "!text-current",
  iconInlineInactive: "text-icon-tertiary dark:text-white/55",
  label: "text-11 font-medium",
  labelInline: "flex h-5 items-center text-13 leading-5 font-medium",
  labelActive: "text-secondary dark:text-white",
  labelInactive: "group-hover:text-secondary text-tertiary dark:text-white/65 dark:group-hover:text-white/90",
  inlineActive: "!bg-white/55 !text-primary dark:!bg-layer-1 dark:!text-accent-primary",
  inlineInactive:
    "text-secondary hover:bg-layer-transparent-hover active:bg-layer-transparent-selected dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white dark:active:bg-white/[0.12]",
} as const;

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function AppSidebarTooltip({ children, disabled = false, tooltipContent }: AppSidebarTooltipProps) {
  if (!tooltipContent || disabled) return children;

  return (
    <Tooltip tooltipContent={tooltipContent} position="right">
      {children}
    </Tooltip>
  );
}

function AppSidebarItemLabel({ highlight = false, label, isInline }: AppSidebarItemLabelProps) {
  if (!label) return null;

  return (
    <span
      className={cn(isInline ? styles.labelInline : styles.label, {
        [styles.labelActive]: !isInline && highlight,
        [styles.labelInactive]: !isInline && !highlight,
      })}
    >
      {label}
    </span>
  );
}

function AppSidebarItemIcon({ icon, highlight, isInline }: AppSidebarItemIconProps) {
  if (!icon) return null;

  return (
    <div
      className={cn(isInline ? styles.iconInline : styles.icon, {
        [styles.iconActive]: !isInline && highlight,
        [styles.iconInactive]: !isInline && !highlight,
        [styles.iconInlineActive]: isInline && highlight,
        [styles.iconInlineInactive]: isInline && !highlight,
      })}
    >
      {icon}
    </div>
  );
}

const AppSidebarLinkItem = React.forwardRef<HTMLAnchorElement, AppSidebarLinkItemProps>(function AppSidebarLinkItem(
  { href, children, className, isInline, isActive, tooltipContent, tooltipDisabled, ...linkProps },
  ref
) {
  if (!href) return null;

  const linkContent = (
    <Link
      ref={ref}
      href={href}
      className={cn(isInline ? styles.baseInline : styles.base, className, {
        [styles.inlineActive]: isInline && isActive,
        [styles.inlineInactive]: isInline && !isActive,
      })}
      {...linkProps}
    >
      {children}
    </Link>
  );

  const tooltipTrigger = <span className={cn("inline-flex max-w-full", { "w-fit": isInline })}>{linkContent}</span>;

  return (
    <AppSidebarTooltip tooltipContent={tooltipContent} disabled={tooltipDisabled}>
      {tooltipTrigger}
    </AppSidebarTooltip>
  );
});

const AppSidebarButtonItem = React.forwardRef<HTMLButtonElement, AppSidebarButtonItemProps>(
  function AppSidebarButtonItem(
    {
      children,
      onClick,
      disabled = false,
      className,
      isInline,
      isActive,
      tooltipContent,
      tooltipDisabled,
      type = "button",
      ...buttonProps
    },
    ref
  ) {
    const buttonContent = (
      <button
        ref={ref}
        className={cn(isInline ? styles.baseInline : styles.base, className, {
          [styles.inlineActive]: isInline && isActive,
          [styles.inlineInactive]: isInline && !isActive,
        })}
        onClick={onClick}
        disabled={disabled}
        type={type}
        {...buttonProps}
      >
        {children}
      </button>
    );

    return (
      <AppSidebarTooltip tooltipContent={tooltipContent} disabled={tooltipDisabled}>
        {buttonContent}
      </AppSidebarTooltip>
    );
  }
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export type AppSidebarItemComponent = React.FC<AppSidebarItemProps> & {
  Label: React.FC<AppSidebarItemLabelProps>;
  Icon: React.FC<AppSidebarItemIconProps>;
  Link: typeof AppSidebarLinkItem;
  Button: typeof AppSidebarButtonItem;
  Tooltip: typeof AppSidebarTooltip;
};

function AppSidebarItem({ variant = "link", item }: AppSidebarItemProps) {
  if (!item) return null;

  const { icon, isActive, isInline, label, href, onClick, disabled, showLabel = true } = item;
  const tooltipContent = label || undefined;

  const commonItems = (
    <>
      <AppSidebarItemIcon icon={icon} highlight={isActive} isInline={isInline} />
      {showLabel && <AppSidebarItemLabel highlight={isActive} label={label} isInline={isInline} />}
    </>
  );

  if (variant === "link") {
    return (
      <AppSidebarLinkItem
        href={href}
        isInline={isInline}
        isActive={isActive}
        aria-label={label}
        tooltipContent={tooltipContent}
      >
        {commonItems}
      </AppSidebarLinkItem>
    );
  }

  return (
    <AppSidebarButtonItem
      onClick={onClick}
      disabled={disabled}
      isInline={isInline}
      isActive={isActive}
      aria-label={label}
      tooltipContent={tooltipContent}
    >
      {commonItems}
    </AppSidebarButtonItem>
  );
}

// ============================================================================
// COMPOUND COMPONENT ASSIGNMENT
// ============================================================================

AppSidebarItem.Label = AppSidebarItemLabel;
AppSidebarItem.Icon = AppSidebarItemIcon;
AppSidebarItem.Link = AppSidebarLinkItem;
AppSidebarItem.Button = AppSidebarButtonItem;
AppSidebarItem.Tooltip = AppSidebarTooltip;

export { AppSidebarItem, AppSidebarTooltip };
export type { AppSidebarItemData, AppSidebarItemProps };

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { observer } from "mobx-react";
// plane helpers
import { useOutsideClickDetector } from "@plane/hooks";
// i18n
import { useTranslation } from "@plane/i18n";
import { LabelPropertyIcon } from "@/components/icons/propel-shim";
// types
import { Tooltip } from "@plane/propel/tooltip";
import type { IIssueLabel } from "@plane/types";
// ui
// hooks
import { cn } from "@plane/utils";
import { useLabel } from "@/hooks/store/use-label";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { LabelDropdown } from "./label-dropdown";

export interface IIssuePropertyLabels {
  projectId: string | null;
  value: string[];
  defaultOptions?: unknown;
  onChange: (data: string[]) => void;
  disabled?: boolean;
  hideDropdownArrow?: boolean;
  className?: string;
  buttonClassName?: string;
  optionsClassName?: string;
  placement?: Placement;
  maxRender?: number;
  noLabelBorder?: boolean;
  placeholderText?: string;
  /** Drop the leading tag icon on the empty-state placeholder. */
  hidePlaceholderIcon?: boolean;
  /** Override the empty-state placeholder text styling (e.g. to match a row's font). */
  placeholderClassName?: string;
  onClose?: () => void;
  renderByDefault?: boolean;
  fullWidth?: boolean;
  fullHeight?: boolean;
}

type NoLabelProps = {
  isMobile: boolean;
  noLabelBorder: boolean;
  fullWidth: boolean;
  placeholderText?: string;
  hideIcon?: boolean;
  placeholderClassName?: string;
};

const NoLabel = observer(function NoLabel({
  isMobile,
  noLabelBorder,
  fullWidth,
  placeholderText,
  hideIcon = false,
  placeholderClassName,
}: NoLabelProps) {
  const { t } = useTranslation();

  return (
    <Tooltip
      position="top"
      tooltipHeading={t("common.labels")}
      tooltipContent="None"
      isMobile={isMobile}
      renderByDefault={false}
    >
      <div
        className={cn(
          "flex h-full items-center justify-center gap-2 rounded-lg px-2.5 py-1 text-caption-sm-regular hover:bg-layer-1",
          noLabelBorder ? "rounded-lg" : "border-[0.5px] border-strong",
          fullWidth && "w-full justify-start",
          placeholderClassName
        )}
      >
        {!hideIcon && <LabelPropertyIcon className="h-3.5 w-3.5" />}
        {placeholderText}
      </div>
    </Tooltip>
  );
});

type LabelItemProps = {
  label: IIssueLabel;
  isMobile: boolean;
  renderByDefault: boolean;
  disabled?: boolean;
  fullWidth: boolean;
  noLabelBorder: boolean;
};

const LabelItem = observer(function LabelItem({
  label,
  isMobile,
  renderByDefault,
  disabled,
  fullWidth,
}: LabelItemProps) {
  const { t } = useTranslation();

  return (
    <Tooltip
      position="top"
      tooltipHeading={t("common.labels")}
      tooltipContent={label?.name ?? ""}
      isMobile={isMobile}
      renderByDefault={renderByDefault}
    >
      <div
        className={cn(
          "flex h-5 max-w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-full px-2 text-12 font-medium",
          !disabled && "cursor-pointer",
          fullWidth && "max-w-fit justify-start"
        )}
        // Filled pill tinted with the label color (no leading dot).
        style={{ backgroundColor: `${label?.color ?? "#6b7280"}1f`, color: label?.color ?? undefined }}
      >
        <div className="line-clamp-1 inline-block max-w-[200px] truncate">{label?.name}</div>
      </div>
    </Tooltip>
  );
});

export const IssuePropertyLabels = observer(function IssuePropertyLabels(props: IIssuePropertyLabels) {
  const {
    projectId,
    value,
    defaultOptions = [],
    onChange,
    onClose,
    disabled,
    hideDropdownArrow = false,
    buttonClassName = "",
    placement,
    maxRender = 2,
    noLabelBorder = false,
    placeholderText,
    hidePlaceholderIcon = false,
    placeholderClassName,
    renderByDefault = true,
    fullWidth = false,
    fullHeight = false,
  } = props;
  // states
  const [isOpen, setIsOpen] = useState(false);
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // store hooks
  const { getProjectLabels } = useLabel();
  const { isMobile } = usePlatformOS();
  const storeLabels = getProjectLabels(projectId);

  const handleClose = () => {
    if (!isOpen) return;
    setIsOpen(false);
    if (onClose) onClose();
  };

  useOutsideClickDetector(dropdownRef, handleClose);

  useEffect(() => {
    if (isOpen && inputRef.current && !isMobile) {
      inputRef.current.focus();
    }
  }, [isOpen, isMobile]);

  let projectLabels: IIssueLabel[] = defaultOptions as IIssueLabel[];
  if (storeLabels && storeLabels.length > 0) projectLabels = storeLabels;

  return (
    <>
      {value.length > 0 ? (
        // One dropdown for the whole cell (like the priority/state cells): the
        // trigger shows the label pills inline, clicking anywhere opens the picker.
        <LabelDropdown
          projectId={projectId}
          value={value}
          onChange={onChange}
          className={fullWidth ? "w-full" : ""}
          buttonClassName={buttonClassName}
          placement={placement}
          hideDropdownArrow={hideDropdownArrow}
          fullWidth={fullWidth}
          fullHeight={fullHeight}
          label={
            <div className="flex items-center gap-1 overflow-hidden">
              {projectLabels
                ?.filter((l) => value.includes(l?.id))
                .slice(0, maxRender)
                .map((label) => (
                  <LabelItem
                    key={label.id}
                    label={label}
                    isMobile={isMobile}
                    renderByDefault={renderByDefault}
                    disabled={disabled}
                    fullWidth={false}
                    noLabelBorder={noLabelBorder}
                  />
                ))}
              {value.length > maxRender && (
                <span className="flex h-5 flex-shrink-0 items-center rounded-full bg-layer-1 px-2 text-12 font-medium text-secondary">
                  +{value.length - maxRender}
                </span>
              )}
            </div>
          }
        />
      ) : (
        <LabelDropdown
          projectId={projectId}
          value={value}
          onChange={onChange}
          className={fullWidth ? "w-full" : ""}
          hideDropdownArrow={hideDropdownArrow}
          buttonClassName={buttonClassName}
          placement={placement}
          fullWidth={fullWidth}
          fullHeight={fullHeight}
          label={
            <NoLabel
              isMobile={isMobile}
              noLabelBorder={noLabelBorder}
              fullWidth={fullWidth}
              placeholderText={placeholderText}
              hideIcon={hidePlaceholderIcon}
              placeholderClassName={placeholderClassName}
            />
          }
        />
      )}
    </>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useRef, useState } from "react";
import { observer } from "mobx-react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { CalendarCheck, CalendarDays, X } from "@/components/icons/lucide-shim";
import { Combobox } from "@headlessui/react";
// ui
import type { Matcher } from "@plane/propel/calendar";
import { Calendar } from "@plane/propel/calendar";
import { CloseIcon } from "@/components/icons/propel-shim";
import { ComboDropDown } from "@plane/ui";
import { cn, renderFormattedDate, getDate } from "@plane/utils";
// helpers
// hooks
import { useUserProfile } from "@/hooks/store/user";
import { useDropdown } from "@/hooks/use-dropdown";
// components
import { DropdownButton } from "./buttons";
// constants
import { BUTTON_VARIANTS_WITH_TEXT } from "./constants";
// types
import type { TDropdownProps } from "./types";

type Props = TDropdownProps & {
  clearIconClassName?: string;
  defaultOpen?: boolean;
  optionsClassName?: string;
  icon?: React.ReactNode;
  isClearable?: boolean;
  minDate?: Date;
  maxDate?: Date;
  onChange: (val: Date | null) => void;
  onClose?: () => void;
  value: Date | string | null;
  closeOnSelect?: boolean;
  formatToken?: string;
  renderByDefault?: boolean;
  labelClassName?: string;
};

export const DateDropdown = observer(function DateDropdown(props: Props) {
  const {
    buttonClassName = "",
    buttonContainerClassName,
    buttonVariant,
    className = "",
    clearIconClassName = "",
    defaultOpen = false,
    optionsClassName = "",
    closeOnSelect = true,
    disabled = false,
    hideIcon = false,
    icon = <CalendarDays className="h-3 w-3 flex-shrink-0" />,
    isClearable = true,
    minDate,
    maxDate,
    onChange,
    onClose,
    placeholder = "Date",
    placement,
    showTooltip = false,
    tabIndex,
    value,
    formatToken,
    renderByDefault = true,
    labelClassName = "",
  } = props;
  // states
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [typed, setTyped] = useState("");
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  // hooks
  const { data } = useUserProfile();
  const startOfWeek = data?.start_of_the_week;
  // popper-js refs
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  // popper-js init
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [
      {
        name: "preventOverflow",
        options: {
          padding: 12,
        },
      },
    ],
  });

  const isDateSelected = value && value.toString().trim() !== "";

  const onOpen = () => {
    if (referenceElement) referenceElement.focus();
  };

  const { handleClose, handleKeyDown, handleOnClick } = useDropdown({
    dropdownRef,
    isOpen,
    onClose,
    onOpen,
    setIsOpen,
  });

  const dropdownOnChange = (val: Date | null) => {
    onChange(val);
    setTyped("");
    if (closeOnSelect) {
      handleClose();
      referenceElement?.blur();
    }
  };

  const disabledDays: Matcher[] = [];
  if (minDate) disabledDays.push({ before: minDate });
  if (maxDate) disabledDays.push({ after: maxDate });

  // Notion-style quick options (Today / Tomorrow / Next week / No date).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + (((8 - today.getDay()) % 7) || 7));
  const weekday = (d: Date) => new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d);
  const fullDay = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(d);

  const quickOptions: { label: string; hint: string; date: Date | null; Icon: typeof CalendarDays; tone: string }[] = [
    { label: "Today", hint: weekday(today), date: today, Icon: CalendarCheck, tone: "text-secondary" },
    { label: "Tomorrow", hint: weekday(tomorrow), date: tomorrow, Icon: CalendarDays, tone: "text-secondary" },
    { label: "Next week", hint: fullDay(nextMonday), date: nextMonday, Icon: CalendarDays, tone: "text-secondary" },
    { label: "No date", hint: "", date: null, Icon: X, tone: "text-secondary" },
  ];

  const commitTyped = () => {
    const parsed = new Date(typed);
    if (typed.trim() && !isNaN(parsed.getTime())) dropdownOnChange(parsed);
  };

  const comboButton = (
    <button
      type="button"
      className={cn(
        "clickable block h-full max-w-full outline-none",
        {
          "cursor-not-allowed text-secondary": disabled,
          "cursor-pointer": !disabled,
        },
        buttonContainerClassName
      )}
      ref={setReferenceElement}
      onClick={handleOnClick}
      disabled={disabled}
    >
      <DropdownButton
        className={buttonClassName}
        isActive={isOpen}
        tooltipHeading={placeholder}
        tooltipContent={value ? renderFormattedDate(value, formatToken) : "None"}
        showTooltip={showTooltip}
        variant={buttonVariant}
        renderToolTipByDefault={renderByDefault}
      >
        {!hideIcon && icon}
        {BUTTON_VARIANTS_WITH_TEXT.includes(buttonVariant) && (
          <span className={cn("flex-grow truncate text-left text-body-xs-medium", labelClassName)}>
            {value ? renderFormattedDate(value, formatToken) : placeholder}
          </span>
        )}
        {isClearable && !disabled && isDateSelected && (
          <CloseIcon
            className={cn("h-2.5 w-2.5 flex-shrink-0", clearIconClassName)}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onChange(null);
            }}
          />
        )}
      </DropdownButton>
    </button>
  );

  return (
    <ComboDropDown
      as="div"
      role="group"
      ref={dropdownRef}
      tabIndex={tabIndex}
      className={cn("h-full", className)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          if (!isOpen) handleKeyDown(e);
        } else handleKeyDown(e);
      }}
      button={comboButton}
      disabled={disabled}
      renderByDefault={renderByDefault}
    >
      {isOpen &&
        createPortal(
          <Combobox.Options data-prevent-outside-click static>
            <div
              className={cn(
                "z-30 my-1 w-72 overflow-hidden rounded-lg border-[0.5px] border-strong bg-surface-1 shadow-raised-200",
                optionsClassName
              )}
              ref={setPopperElement}
              style={styles.popper}
              {...attributes.popper}
            >
              {/* Free-text date entry */}
              <div className="p-2">
                <input
                  type="text"
                  autoFocus
                  value={typed}
                  placeholder="Enter a date"
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitTyped();
                    }
                  }}
                  className="w-full rounded-md border-[0.5px] border-subtle bg-surface-1 px-3 py-2 text-13 text-secondary outline-none placeholder:text-placeholder focus:border-accent-primary"
                />
              </div>
              {/* Quick options */}
              <div className="px-1 pb-1">
                {quickOptions.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => dropdownOnChange(opt.date)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-13 transition-colors hover:bg-layer-1"
                  >
                    <span className={cn("flex items-center gap-2 font-medium", opt.tone)}>
                      <opt.Icon className="size-4 flex-shrink-0" />
                      {opt.label}
                    </span>
                    {opt.hint && <span className="text-tertiary">{opt.hint}</span>}
                  </button>
                ))}
              </div>
              <div className="border-t border-subtle">
                <Calendar
                  className="p-3"
                  captionLayout="dropdown"
                  selected={getDate(value)}
                  defaultMonth={getDate(value)}
                  onSelect={(date: Date | undefined) => {
                    dropdownOnChange(date ?? null);
                  }}
                  showOutsideDays
                  disabled={disabledDays}
                  mode="single"
                  fixedWeeks
                  weekStartsOn={startOfWeek}
                />
              </div>
            </div>
          </Combobox.Options>,
          document.body
        )}
    </ComboDropDown>
  );
});

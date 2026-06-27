/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { usePopper } from "react-popper";
import { ArrowRight, FireMinimalistic, MinusCircle, ShieldWarning, Snowflake } from "@solar-icons/react/ssr";
import {
  Check as CheckIcon,
  ChevronDown as ChevronDownIcon,
  Search as SearchIcon,
} from "@/components/icons/lucide-shim";
import { Combobox } from "@headlessui/react";
import { ISSUE_PRIORITIES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// types
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssuePriorities } from "@plane/types";
// ui
import { ComboDropDown } from "@plane/ui";
// helpers
import { cn } from "@plane/utils";
// hooks
import { useDropdown } from "@/hooks/use-dropdown";
import { usePlatformOS } from "@/hooks/use-platform-os";
// constants
import { BACKGROUND_BUTTON_VARIANTS, BORDER_BUTTON_VARIANTS, BUTTON_VARIANTS_WITHOUT_TEXT } from "./constants";
// types
import type { TDropdownProps } from "./types";

const PRIORITY_SIGNAL_STYLES: Record<
  TIssuePriorities,
  {
    badge: string;
    icon: string;
    text: string;
  }
> = {
  urgent: {
    badge: "bg-[color-mix(in_srgb,var(--priority-urgent)_28%,transparent)]",
    icon: "text-[color-mix(in_srgb,var(--priority-urgent)_78%,black)]",
    text: "text-[color-mix(in_srgb,var(--priority-urgent)_78%,black)]",
  },
  high: {
    badge: "bg-[color-mix(in_srgb,var(--priority-high)_28%,transparent)]",
    icon: "text-[color-mix(in_srgb,var(--priority-high)_68%,black)]",
    text: "text-[color-mix(in_srgb,var(--priority-high)_68%,black)]",
  },
  medium: {
    badge: "bg-[color-mix(in_srgb,var(--priority-medium)_28%,transparent)]",
    icon: "text-[color-mix(in_srgb,var(--priority-medium)_55%,black)]",
    text: "text-[color-mix(in_srgb,var(--priority-medium)_55%,black)]",
  },
  low: {
    badge: "bg-[color-mix(in_srgb,var(--priority-low)_28%,transparent)]",
    icon: "text-[color-mix(in_srgb,var(--priority-low)_78%,black)]",
    text: "text-[color-mix(in_srgb,var(--priority-low)_78%,black)]",
  },
  none: {
    badge: "bg-[color-mix(in_srgb,var(--text-color-primary)_12%,transparent)]",
    icon: "text-secondary",
    text: "text-secondary",
  },
};

type Props = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  highlightUrgent?: boolean;
  onChange: (val: TIssuePriorities) => void;
  onClose?: () => void;
  value: TIssuePriorities | undefined | null;
  renderByDefault?: boolean;
};

type ButtonProps = {
  className?: string;
  dropdownArrow: boolean;
  dropdownArrowClassName: string;
  hideIcon?: boolean;
  hideText?: boolean;
  isActive?: boolean;
  highlightUrgent: boolean;
  placeholder: string;
  priority: TIssuePriorities | undefined;
  showTooltip: boolean;
  renderToolTipByDefault?: boolean;
};

function PrioritySignalIcon(props: { className?: string; priority: TIssuePriorities }) {
  const { className, priority } = props;

  const icons = {
    urgent: ShieldWarning,
    high: FireMinimalistic,
    medium: ArrowRight,
    low: Snowflake,
    none: MinusCircle,
  };

  const Icon = icons[priority];
  // BoldDuotone for the priority label/pill icon (per the priority-label rule).
  return <Icon className={className} weight="BoldDuotone" aria-hidden />;
}

function PrioritySignalValue(props: {
  hideIcon?: boolean;
  hideText?: boolean;
  placeholder: string;
  priority: TIssuePriorities | undefined;
}) {
  const { hideIcon = false, hideText = false, placeholder, priority } = props;
  const resolvedPriority = priority ?? "none";
  const priorityDetails = ISSUE_PRIORITIES.find((p) => p.key === resolvedPriority);
  const styles = PRIORITY_SIGNAL_STYLES[resolvedPriority];

  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-0 items-center gap-1 rounded-lg px-1.5",
        hideText ? "size-5 justify-center px-0" : "max-w-full",
        styles.badge
      )}
    >
      {!hideIcon && (
        <PrioritySignalIcon priority={resolvedPriority} className={cn("size-3 shrink-0 stroke-2", styles.icon)} />
      )}
      {!hideText && (
        <span className={cn("min-w-0 truncate text-body-xs-regular leading-5", styles.text)}>
          {priorityDetails?.title ?? placeholder}
        </span>
      )}
    </span>
  );
}

function BorderButton(props: ButtonProps) {
  const {
    className,
    dropdownArrow,
    dropdownArrowClassName,
    hideIcon = false,
    hideText = false,
    placeholder,
    priority,
    showTooltip,
    renderToolTipByDefault = true,
  } = props;

  const priorityDetails = ISSUE_PRIORITIES.find((p) => p.key === priority);

  const { isMobile } = usePlatformOS();
  const { t } = useTranslation();

  return (
    <Tooltip
      tooltipHeading={t("priority")}
      tooltipContent={priorityDetails?.title ?? t("common.none")}
      disabled={!showTooltip}
      isMobile={isMobile}
      renderByDefault={renderToolTipByDefault}
    >
      <div
        className={cn(
          "flex h-full items-center gap-1.5 rounded-lg border-[0.5px] border-transparent px-1.5 py-0.5 transition-colors hover:bg-layer-1",
          { "px-0.5": hideText },
          className
        )}
      >
        <PrioritySignalValue hideIcon={hideIcon} hideText={hideText} placeholder={placeholder} priority={priority} />
        {dropdownArrow && (
          <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
        )}
      </div>
    </Tooltip>
  );
}

function BackgroundButton(props: ButtonProps) {
  const {
    className,
    dropdownArrow,
    dropdownArrowClassName,
    hideIcon = false,
    hideText = false,
    placeholder,
    priority,
    showTooltip,
    renderToolTipByDefault = true,
  } = props;

  const priorityDetails = ISSUE_PRIORITIES.find((p) => p.key === priority);

  const { isMobile } = usePlatformOS();
  const { t } = useTranslation();

  return (
    <Tooltip
      tooltipHeading={t("priority")}
      tooltipContent={t(priorityDetails?.key ?? "none")}
      disabled={!showTooltip}
      isMobile={isMobile}
      renderByDefault={renderToolTipByDefault}
    >
      <div
        className={cn(
          "flex h-full items-center gap-1.5 rounded-lg bg-layer-2 px-1.5 py-0.5 transition-colors hover:bg-layer-1",
          { "px-0.5": hideText },
          className
        )}
      >
        <PrioritySignalValue
          hideIcon={hideIcon}
          hideText={hideText}
          placeholder={t("common.priority") ?? placeholder}
          priority={priority}
        />
        {dropdownArrow && (
          <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
        )}
      </div>
    </Tooltip>
  );
}

function TransparentButton(props: ButtonProps) {
  const {
    className,
    dropdownArrow,
    dropdownArrowClassName,
    hideIcon = false,
    hideText = false,
    isActive = false,
    placeholder,
    priority,
    showTooltip,
    renderToolTipByDefault = true,
  } = props;

  const priorityDetails = ISSUE_PRIORITIES.find((p) => p.key === priority);

  const { isMobile } = usePlatformOS();
  const { t } = useTranslation();

  return (
    <Tooltip
      tooltipHeading={t("priority")}
      tooltipContent={priorityDetails?.title ?? t("common.none")}
      disabled={!showTooltip}
      isMobile={isMobile}
      renderByDefault={renderToolTipByDefault}
    >
      <div
        className={cn(
          "flex h-full w-full items-center gap-1.5 rounded-lg px-1.5 transition-colors hover:bg-layer-transparent-hover",
          {
            "px-0.5": hideText,
            "bg-layer-1": isActive,
          },
          className
        )}
      >
        <PrioritySignalValue
          hideIcon={hideIcon}
          hideText={hideText}
          placeholder={t("common.priority") ?? placeholder}
          priority={priority}
        />
        {dropdownArrow && (
          <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
        )}
      </div>
    </Tooltip>
  );
}

export function PriorityDropdown(props: Props) {
  //hooks
  const { t } = useTranslation();
  const {
    button,
    buttonClassName,
    buttonContainerClassName,
    buttonVariant,
    className = "",
    disabled = false,
    dropdownArrow = false,
    dropdownArrowClassName = "",
    hideIcon = false,
    highlightUrgent = true,
    onChange,
    onClose,
    placeholder = t("common.priority"),
    placement,
    showTooltip = false,
    tabIndex,
    value = "none",
    renderByDefault = true,
  } = props;
  // states
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  const options = ISSUE_PRIORITIES.map((priority) => ({
    value: priority.key,
    query: priority.key,
    content: (
      <div className="flex items-center gap-2">
        <PrioritySignalValue placeholder={t("common.priority")} priority={priority.key} />
      </div>
    ),
  }));

  const filteredOptions =
    query === "" ? options : options.filter((o) => o.query.toLowerCase().includes(query.toLowerCase()));

  const dropdownOnChange = (val: TIssuePriorities) => {
    onChange(val);
    handleClose();
  };

  const { handleClose, handleKeyDown, handleOnClick, searchInputKeyDown } = useDropdown({
    dropdownRef,
    inputRef,
    isOpen,
    onClose,
    query,
    setIsOpen,
    setQuery,
  });

  const ButtonToRender = BORDER_BUTTON_VARIANTS.includes(buttonVariant)
    ? BorderButton
    : BACKGROUND_BUTTON_VARIANTS.includes(buttonVariant)
      ? BackgroundButton
      : TransparentButton;

  const comboButton = (
    <>
      {button ? (
        <button
          ref={setReferenceElement}
          type="button"
          className={cn("clickable block h-full w-full outline-none", buttonContainerClassName)}
          onClick={handleOnClick}
          disabled={disabled}
          tabIndex={tabIndex}
        >
          {button}
        </button>
      ) : (
        <button
          ref={setReferenceElement}
          type="button"
          className={cn(
            "clickable block h-full max-w-full outline-none",
            {
              "cursor-not-allowed text-secondary": disabled,
              "cursor-pointer": !disabled,
            },
            buttonContainerClassName
          )}
          onClick={handleOnClick}
          disabled={disabled}
          tabIndex={tabIndex}
        >
          <ButtonToRender
            priority={value ?? undefined}
            className={buttonClassName}
            highlightUrgent={highlightUrgent}
            dropdownArrow={dropdownArrow && !disabled}
            dropdownArrowClassName={dropdownArrowClassName}
            hideIcon={hideIcon}
            placeholder={placeholder}
            showTooltip={showTooltip}
            hideText={BUTTON_VARIANTS_WITHOUT_TEXT.includes(buttonVariant)}
            renderToolTipByDefault={renderByDefault}
          />
        </button>
      )}
    </>
  );

  return (
    <ComboDropDown
      as="div"
      role="presentation"
      ref={dropdownRef}
      className={cn(
        "h-full",
        {
          "bg-layer-1": isOpen,
        },
        className
      )}
      value={value}
      onChange={dropdownOnChange}
      disabled={disabled}
      onKeyDown={handleKeyDown}
      button={comboButton}
      renderByDefault={renderByDefault}
    >
      {isOpen && (
        <Combobox.Options className="fixed z-10" static>
          <div
            className="my-1 w-48 rounded-lg border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-13 shadow-raised-200 focus:outline-none"
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
          >
            <div className="flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-2 px-2">
              <SearchIcon className="h-3.5 w-3.5 text-placeholder" strokeWidth={1.5} />
              <Combobox.Input
                as="input"
                ref={inputRef}
                className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                displayValue={(assigned: any) => assigned?.name}
                onKeyDown={searchInputKeyDown}
              />
            </div>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-scroll">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <Combobox.Option
                    key={option.value}
                    value={option.value}
                    className={({ active, selected }) =>
                      cn(
                        `flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-lg px-1.5 py-1.5 transition-colors select-none ${
                          active ? "bg-layer-transparent-hover" : ""
                        } ${selected ? "text-primary" : "text-secondary"}`
                      )
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className="flex-grow truncate">{option.content}</span>
                        {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0 text-accent-primary" />}
                      </>
                    )}
                  </Combobox.Option>
                ))
              ) : (
                <p className="px-1.5 py-1 text-placeholder italic">{t("no_matching_results")}</p>
              )}
            </div>
          </div>
        </Combobox.Options>
      )}
    </ComboDropDown>
  );
}

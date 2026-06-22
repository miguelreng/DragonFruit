/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Solar shim for @plane/propel/icons. The app standardizes on Solar icons, so
 * every generic propel icon with a Solar equivalent is overridden below.
 *
 * `export * from "@plane/propel/icons"` is kept as a fallback (per ES module
 * spec, the explicit named exports below shadow same-named star exports). This
 * deliberately preserves the icons Solar has no equivalent for: the DragonFruit
 * brand marks (DragonfruitLogo/Lockup), type exports (ISvgIcons, TModuleStatus),
 * and color-coded domain glyphs (priority, cycle, module, layout, property icons).
 */
import type { ComponentType, SVGProps } from "react";
import type { IconWeight } from "@solar-icons/react";
import * as Solar from "@solar-icons/react/ssr";
import { EIconSize } from "@plane/constants";
import { cn } from "@plane/utils";

export * from "@plane/propel/icons";

type SolarIconProps = SVGProps<SVGSVGElement> & { weight?: IconWeight; size?: string | number };

const DEFAULT_WEIGHT: IconWeight = "Linear";

const shim =
  (Icon: ComponentType<SolarIconProps>) =>
  ({ weight, ...props }: SolarIconProps) =>
    <Icon weight={weight ?? DEFAULT_WEIGHT} {...props} />;

// State groups render as a simple filled dot, one unique color per group.
// Overrides the propel domain icon (shadowing the `export *` above).
type TStateGroupKey = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

const STATE_GROUP_DOT_COLOR: Record<TStateGroupKey, string> = {
  backlog: "#A1A1AA", // zinc
  unstarted: "#3B82F6", // blue
  started: "#F59E0B", // amber
  completed: "#22C55E", // green
  cancelled: "#EF4444", // red
};

const STATE_GROUP_DOT_SIZE: Record<EIconSize, string> = {
  [EIconSize.XS]: "7px",
  [EIconSize.SM]: "9px",
  [EIconSize.MD]: "10px",
  [EIconSize.LG]: "12px",
  [EIconSize.XL]: "14px",
};

export const StateGroupIcon = ({
  className = "",
  color,
  stateGroup,
  size = EIconSize.SM,
}: {
  className?: string;
  color?: string;
  stateGroup: TStateGroupKey;
  size?: EIconSize;
  percentage?: number;
}) => {
  const px = STATE_GROUP_DOT_SIZE[size];
  // The per-group palette wins over any color the caller passes (callers send the
  // same grey for backlog AND todo), so each group stays a distinct color.
  return (
    <span
      className={`block flex-shrink-0 rounded-full ${className}`}
      style={{ width: px, height: px, backgroundColor: STATE_GROUP_DOT_COLOR[stateGroup] ?? color }}
    />
  );
};


// Issue property icons — Solar replacements for the old propel domain glyphs
// (start/due date calendars + the label tag). Other files already alias these
// to Solar via lucide-shim; these keep the propel-shim consumers consistent.
export const StartDatePropertyIcon = shim(Solar.Calendar);
export const DueDatePropertyIcon = shim(Solar.CalendarMark);
export const LabelPropertyIcon = shim(Solar.Tag);
// Generic "Priority" property/filter glyph (matches the Solar Chart already used
// for the priority activity icon elsewhere).
export const PriorityPropertyIcon = shim(Solar.Chart);

// Priority icons (Solar), per priority level. On the colored priority label/chip
// (withContainer) the icon is BoldDuotone; bare (lists, inline) it's Linear.
type TIssuePriorityKey = "urgent" | "high" | "medium" | "low" | "none";

const PRIORITY_SOLAR_ICON: Record<TIssuePriorityKey, ComponentType<SolarIconProps>> = {
  urgent: Solar.ShieldWarning,
  high: Solar.FireMinimalistic,
  medium: Solar.ArrowRight,
  low: Solar.Snowflake,
  none: Solar.MinusCircle,
};

const PRIORITY_CONTAINER_CLASS: Record<TIssuePriorityKey, string> = {
  urgent:
    "border border-[color-mix(in_srgb,var(--priority-urgent)_42%,white)] bg-[color-mix(in_srgb,var(--priority-urgent)_30%,var(--bg-layer-2))] text-[color-mix(in_srgb,var(--priority-urgent)_98%,black)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
  high: "border border-[color-mix(in_srgb,var(--priority-high)_38%,white)] bg-[color-mix(in_srgb,var(--priority-high)_28%,var(--bg-layer-2))] text-[color-mix(in_srgb,var(--priority-high)_96%,black)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
  medium:
    "border border-[color-mix(in_srgb,var(--priority-medium)_38%,white)] bg-[color-mix(in_srgb,var(--priority-medium)_30%,var(--bg-layer-2))] text-[color-mix(in_srgb,var(--priority-medium)_95%,black)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
  low: "border border-[color-mix(in_srgb,var(--priority-low)_38%,white)] bg-[color-mix(in_srgb,var(--priority-low)_28%,var(--bg-layer-2))] text-[color-mix(in_srgb,var(--priority-low)_96%,black)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
  none: "border border-subtle bg-layer-3 text-placeholder",
};

export const PriorityIcon = ({
  priority,
  className = "",
  containerClassName = "",
  size = 14,
  withContainer = false,
}: {
  priority?: TIssuePriorityKey | null;
  className?: string;
  containerClassName?: string;
  size?: number;
  withContainer?: boolean;
}) => {
  const resolved: TIssuePriorityKey = priority ?? "none";
  const Icon = PRIORITY_SOLAR_ICON[resolved];
  const weight: IconWeight = withContainer ? "BoldDuotone" : "Linear";

  if (withContainer) {
    return (
      <div
        className={cn(
          "flex size-5 flex-shrink-0 items-center justify-center rounded-lg",
          PRIORITY_CONTAINER_CLASS[resolved],
          containerClassName
        )}
      >
        <Icon weight={weight} className={cn("flex-shrink-0", className)} style={{ width: size, height: size }} aria-hidden />
      </div>
    );
  }

  return (
    <Icon
      weight={weight}
      className={cn(
        "flex-shrink-0",
        {
          "text-[color-mix(in_srgb,var(--priority-urgent)_94%,black)]": resolved === "urgent",
          "text-[color-mix(in_srgb,var(--priority-high)_92%,black)]": resolved === "high",
          "text-[color-mix(in_srgb,var(--priority-medium)_90%,black)]": resolved === "medium",
          "text-[color-mix(in_srgb,var(--priority-low)_92%,black)]": resolved === "low",
          "text-placeholder": resolved === "none",
        },
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
};

export const AiIcon = shim(Solar.Stars);
export const AnalyticsIcon = shim(Solar.Chart);
export const ArchiveIcon = shim(Solar.Archive);
export const CalendarAfterIcon = shim(Solar.Calendar);
export const CalendarBeforeIcon = shim(Solar.Calendar);
export const CheckCircleFilledIcon = shim(Solar.CheckCircle);
export const CheckIcon = shim(Solar.CheckCircle);
export const ChevronDownIcon = shim(Solar.AltArrowDown);
export const ChevronLeftIcon = shim(Solar.AltArrowLeft);
export const ChevronRightIcon = shim(Solar.AltArrowRight);
export const ChevronUpIcon = shim(Solar.AltArrowUp);
export const CloseCircleFilledIcon = shim(Solar.CloseCircle);
export const CloseIcon = shim(Solar.CloseCircle);
export const CommentReplyIcon = shim(Solar.Reply);
export const CopyIcon = shim(Solar.Copy);
export const CopyLinkIcon = shim(Solar.Link);
export const EditIcon = shim(Solar.Pen);
export const FavoriteFolderIcon = shim(Solar.FolderFavouriteStar);
export const FilterAppliedIcon = shim(Solar.Filters);
export const FilterIcon = shim(Solar.Filter);
export const FullScreenPanelIcon = shim(Solar.Maximize);
export const GlobeIcon = shim(Solar.Global);
export const InboxIcon = shim(Solar.Inbox);
export const InfoFillIcon = shim(Solar.InfoCircle);
export const LayersIcon = shim(Solar.Layers);
export const LinkIcon = shim(Solar.Link);
export const LockIcon = shim(Solar.LockKeyhole);
export const NewTabIcon = shim(Solar.ArrowRightUp);
export const PageIcon = shim(Solar.Document);
export const PlusIcon = shim(Solar.AddCircle);
export const RecentStickyIcon = shim(Solar.Notes);
export const SearchIcon = shim(Solar.Magnifer);
export const StickyNoteIcon = shim(Solar.Notes);
export const SuspendedUserIcon = shim(Solar.UserBlockRounded);
export const TransferIcon = shim(Solar.RoundTransferHorizontal);
export const TrashIcon = shim(Solar.TrashBinMinimalistic);


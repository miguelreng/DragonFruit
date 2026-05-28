/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Avatar, type TAvatarSize } from "@plane/propel/avatar";
import { cn } from "@plane/utils";
import { Sparkles } from "@/components/icons/lucide-shim";

// Six agent-themed accent colors. Selected by hashing the agent's id (or
// name as a fallback) so each agent has a stable identity color across
// the app, even when no avatar URL is configured.
const AGENT_ACCENTS = [
  { bg: "#4F46E5", fg: "#FFFFFF" }, // indigo
  { bg: "#0EA5E9", fg: "#FFFFFF" }, // sky
  { bg: "#16A34A", fg: "#FFFFFF" }, // green
  { bg: "#D97706", fg: "#FFFFFF" }, // amber
  { bg: "#DB2777", fg: "#FFFFFF" }, // pink
  { bg: "#7C3AED", fg: "#FFFFFF" }, // violet
] as const;

const hashToIndex = (seed: string, mod: number) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % mod;
};

export const getAgentAccent = (seed: string) => AGENT_ACCENTS[hashToIndex(seed || "agent", AGENT_ACCENTS.length)];

type Props = {
  /** Stable seed for the deterministic fallback color — usually agent.id. */
  seed: string;
  /** Display name; first letter is the fallback when no src is set. */
  name?: string;
  /** Avatar image URL. If empty/falsy, falls back to a colored initial. */
  src?: string;
  size?: TAvatarSize;
  /** Show the small sparkles glyph that marks this avatar as an AI agent. */
  showBadge?: boolean;
  className?: string;
};

/**
 * Agent identity avatar. Wraps the propel Avatar with a deterministic
 * accent color (so each agent looks the same wherever it appears) and a
 * small sparkles badge that visually separates agents from human users.
 */
export function AgentAvatar({ seed, name, src, size = "base", showBadge = true, className }: Props) {
  const accent = getAgentAccent(seed);
  const hasImage = Boolean(src && src.trim().length > 0);
  const initial = (name?.trim()?.[0] ?? "A").toUpperCase();
  // Avatar's outer wrapper doesn't size itself when `size` is a number,
  // so we size our own wrapper and pass the same number through. Named
  // sizes ("sm"/"md"/"base"/"lg") size themselves, so we leave the
  // wrapper unsized for those.
  const isNumericSize = typeof size === "number";
  const fallbackNamedSizeClass =
    size === "sm"
      ? "h-5 w-5 text-11"
      : size === "md"
        ? "h-6 w-6 text-12"
        : size === "lg"
          ? "h-7 w-7 text-13"
          : "h-8 w-8 text-14";
  const badgeSize = isNumericSize
    ? size >= 36
      ? "size-4"
      : "size-3.5"
    : size === "lg"
      ? "size-4"
      : size === "base"
        ? "size-3.5"
        : "size-3";

  return (
    <div
      className={cn("relative inline-flex shrink-0", className)}
      style={isNumericSize ? { width: size, height: size } : undefined}
    >
      {hasImage && (
        <Avatar
          name={name}
          src={src}
          size={size}
          shape="square"
          fallbackBackgroundColor={accent.bg}
          fallbackTextColor={accent.fg}
          className={cn(isNumericSize && "h-full w-full")}
        />
      )}
      {!hasImage && (
        <div
          className={cn(
            "grid place-items-center rounded-sm font-semibold text-white select-none",
            isNumericSize ? "h-full w-full text-[24px] leading-none" : fallbackNamedSizeClass
          )}
          style={{ backgroundColor: accent.bg }}
          aria-hidden
        >
          {initial}
        </div>
      )}
      {showBadge && (
        <span
          className={cn(
            "absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-surface-1 text-accent-primary shadow-raised-100 ring-[0.5px] ring-subtle",
            badgeSize
          )}
          aria-hidden
        >
          <Sparkles className="size-2/3" />
        </span>
      )}
    </div>
  );
}

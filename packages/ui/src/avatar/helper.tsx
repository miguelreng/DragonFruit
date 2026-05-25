/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TAvatarSize = "sm" | "md" | "base" | "lg" | number;

const AVATAR_PLACEHOLDER_PATHS = [
  "/avatar-placeholders/renaissance-headshot-01.jpg",
  "/avatar-placeholders/renaissance-headshot-02.jpg",
  "/avatar-placeholders/renaissance-headshot-03.jpg",
  "/avatar-placeholders/renaissance-headshot-04.jpg",
  "/avatar-placeholders/renaissance-headshot-05.jpg",
  "/avatar-placeholders/renaissance-headshot-06.jpg",
  "/avatar-placeholders/renaissance-headshot-07.jpg",
  "/avatar-placeholders/renaissance-headshot-08.jpg",
  "/avatar-placeholders/renaissance-headshot-09.jpg",
  "/avatar-placeholders/renaissance-headshot-10.jpg",
] as const;

export const getAvatarPlaceholderSrc = (seed = "avatar") => {
  let hash = 0;

  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;

  return AVATAR_PLACEHOLDER_PATHS[hash % AVATAR_PLACEHOLDER_PATHS.length];
};

/**
 * Get the size details based on the size prop
 * @param size The size of the avatar
 * @returns The size details
 */
export const getSizeInfo = (size: TAvatarSize) => {
  switch (size) {
    case "sm":
      return {
        avatarSize: "h-4 w-4",
        fontSize: "text-11",
        spacing: "-space-x-1",
      };
    case "md":
      return {
        avatarSize: "h-5 w-5",
        fontSize: "text-11",
        spacing: "-space-x-1",
      };
    case "base":
      return {
        avatarSize: "h-6 w-6",
        fontSize: "text-13",
        spacing: "-space-x-1.5",
      };
    case "lg":
      return {
        avatarSize: "h-7 w-7",
        fontSize: "text-13",
        spacing: "-space-x-1.5",
      };
    default:
      return {
        avatarSize: "h-5 w-5",
        fontSize: "text-11",
        spacing: "-space-x-1",
      };
  }
};

/**
 * Get the border radius based on the shape prop
 * @param shape The shape of the avatar
 * @returns The border radius
 */
export const getBorderRadius = (shape: "circle" | "square") => {
  switch (shape) {
    case "circle":
      return "rounded-full";
    case "square":
      return "rounded-sm";
    default:
      return "rounded-full";
  }
};

/**
 * Check if the value is a valid number
 * @param value The value to check
 * @returns Whether the value is a valid number or not
 */
export const isAValidNumber = (value: unknown) => typeof value === "number" && !isNaN(value);

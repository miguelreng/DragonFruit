/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

const DEFAULT_MAX_TAGS = 8;
const DEFAULT_MAX_TAG_LENGTH = 24;

const clampTag = (value: string, maxTagLength: number): string =>
  value.trim().replace(/\s+/g, " ").slice(0, maxTagLength);

export const normalizeTags = (
  value: unknown,
  maxTags: number = DEFAULT_MAX_TAGS,
  maxTagLength: number = DEFAULT_MAX_TAG_LENGTH
): string[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const tags: string[] = [];

  value.forEach((entry) => {
    if (typeof entry !== "string") return;
    const tag = clampTag(entry, maxTagLength);
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(tag);
  });

  return tags.slice(0, maxTags);
};

export const parseTagsInput = (
  value: string,
  maxTags: number = DEFAULT_MAX_TAGS,
  maxTagLength: number = DEFAULT_MAX_TAG_LENGTH
): string[] =>
  normalizeTags(
    value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    maxTags,
    maxTagLength
  );

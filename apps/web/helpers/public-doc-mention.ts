/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TPublicDocLinkMention = {
  href: string;
  label: string;
};

export type TPublicDocMentions = {
  users?: Record<string, string>;
  issues?: Record<string, string>;
  calendars?: Record<string, TPublicDocLinkMention>;
};

export type TPublicDocMentionPresentation = {
  href?: string;
  label: string;
};

export const getPublicDocMentionPresentation = (
  entityName: string | null,
  entityId: string,
  mentions?: TPublicDocMentions
): TPublicDocMentionPresentation => {
  if (entityName === "calendar") {
    const calendar = mentions?.calendars?.[entityId];
    return calendar ?? { label: "Project calendar" };
  }

  if (entityName === "issue") {
    return { label: mentions?.issues?.[entityId] ?? "a task" };
  }

  return { label: `@${mentions?.users?.[entityId] ?? "member"}` };
};

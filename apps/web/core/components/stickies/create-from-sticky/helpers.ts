/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EPageAccess } from "@plane/types";

export type TStickyTarget = "doc" | "task";

export type TStickyTargetSnapshot = {
  name?: string | null;
  description_html?: string | null;
};

type TDocTargetPayload = {
  target: "doc";
  payload: {
    access: EPageAccess.PRIVATE;
    description_html: string;
    name: string;
    page_type: "doc";
  };
};

type TTaskTargetPayload = {
  target: "task";
  payload: {
    description_html: string;
    name: string;
  };
};

export type TStickyTargetPayload = TDocTargetPayload | TTaskTargetPayload;

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&#(x?[\da-f]+);/gi, (entity, code: string) => {
      const radix = code.toLowerCase().startsWith("x") ? 16 : 10;
      const normalizedCode = radix === 16 ? code.slice(1) : code;
      const codePoint = Number.parseInt(normalizedCode, radix);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;

      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    })
    .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED_HTML_ENTITIES[name.toLowerCase()] ?? entity);

const normalizeStickyBodyText = (descriptionHtml: string | null | undefined): string => {
  if (!descriptionHtml) return "";

  const plainText = descriptionHtml
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(?:blockquote|div|h[1-6]|li|p|pre)>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(plainText).replace(/\s+/g, " ").trim();
};

export const resolveStickyTargetTitle = (snapshot: TStickyTargetSnapshot): string => {
  const stickyTitle = snapshot.name?.trim();
  if (stickyTitle) return stickyTitle;

  const bodyTitle = normalizeStickyBodyText(snapshot.description_html).slice(0, 100).trim();
  return bodyTitle || "Untitled sticky";
};

export const buildStickyTargetPayload = (
  target: TStickyTarget,
  snapshot: TStickyTargetSnapshot
): TStickyTargetPayload => {
  const commonPayload = {
    name: resolveStickyTargetTitle(snapshot),
    description_html: snapshot.description_html ?? "<p></p>",
  };

  if (target === "doc") {
    return {
      target,
      payload: {
        ...commonPayload,
        page_type: "doc",
        access: EPageAccess.PRIVATE,
      },
    };
  }

  return {
    target,
    payload: commonPayload,
  };
};

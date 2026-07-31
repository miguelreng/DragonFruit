/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPublicPageContentType } from "@/helpers/page-public";

const PUBLIC_PAGE_META_ATTRIBUTE = "data-public-page-meta";

const CONTENT_TYPE_LABELS: Record<TPublicPageContentType, string> = {
  doc: "Document",
  pdf: "PDF",
  sheet: "Sheet",
  whiteboard: "Whiteboard",
  wiki: "Wiki",
};

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export type TPublicPageMetadata = {
  canonicalUrl: string;
  description: string;
  imageUrl: string;
  siteName: string;
  title: string;
  updatedAt?: string;
};

type TPublicPageMetadataInput = {
  canonicalUrl: string;
  contentType: TPublicPageContentType;
  descriptionHtml: string;
  pageSlug: string;
  pageTitle: string;
  updatedAt?: string;
  workspaceSlug: string;
};

const decodeHtmlEntities = (value: string) =>
  value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, token: string) => {
    if (token.startsWith("#x") || token.startsWith("#X")) {
      const codePoint = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }

    if (token.startsWith("#")) {
      const codePoint = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }

    return NAMED_HTML_ENTITIES[token.toLowerCase()] ?? entity;
  });

export const publicPageHtmlToPlainText = (html: string) =>
  decodeHtmlEntities(
    html
      .replace(/<!--[^]*?-->/g, " ")
      .replace(/<(script|style)\b[^>]*>[^]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?\s*>|<\/(?:p|div|h[1-6]|li|blockquote|section|article)>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();

export const publicPageHtmlToDescription = (html: string) => {
  const paragraphDescription = Array.from(html.matchAll(/<p\b[^>]*>([^]*?)<\/p>/gi))
    .map((match) => publicPageHtmlToPlainText(match[1]))
    .find((candidate) => candidate.length >= 20);

  return paragraphDescription ?? publicPageHtmlToPlainText(html);
};

export const truncatePublicPageText = (value: string, maxLength: number) => {
  const characters = Array.from(value.trim());
  if (characters.length <= maxLength) return characters.join("");

  const candidate = characters.slice(0, Math.max(1, maxLength - 1)).join("");
  const lastWhitespace = candidate.lastIndexOf(" ");
  const boundary = lastWhitespace >= Math.floor(maxLength * 0.6) ? lastWhitespace : candidate.length;
  return `${candidate.slice(0, boundary).trimEnd()}…`;
};

export const formatPublicWorkspaceName = (workspaceSlug: string) =>
  workspaceSlug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

export const buildPublicPageMetadata = ({
  canonicalUrl,
  contentType,
  descriptionHtml,
  pageSlug,
  pageTitle,
  updatedAt,
  workspaceSlug,
}: TPublicPageMetadataInput): TPublicPageMetadata => {
  const title = pageTitle.trim() || "Untitled";
  const siteName = formatPublicWorkspaceName(workspaceSlug) || "Public page";
  const pageText = publicPageHtmlToDescription(descriptionHtml);
  const description = truncatePublicPageText(
    pageText || `A public ${CONTENT_TYPE_LABELS[contentType].toLowerCase()} from ${siteName}.`,
    200
  );
  const imageUrl = new URL("/api/public-page-image", canonicalUrl);
  imageUrl.searchParams.set("workspaceIdentifier", workspaceSlug);
  imageUrl.searchParams.set("pageType", contentType);
  imageUrl.searchParams.set("pageSlug", pageSlug);

  return {
    canonicalUrl,
    description,
    imageUrl: imageUrl.toString(),
    siteName,
    title,
    updatedAt,
  };
};

type TManagedHeadElement = {
  element: HTMLLinkElement | HTMLMetaElement;
  originalContent: string | null;
  wasCreated: boolean;
};

const upsertMeta = (selector: string, attributes: Record<string, string>): TManagedHeadElement => {
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  const element = existing ?? document.createElement("meta");
  const originalContent = existing?.getAttribute("content") ?? null;

  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  element.setAttribute(PUBLIC_PAGE_META_ATTRIBUTE, "true");
  if (!existing) document.head.appendChild(element);

  return { element, originalContent, wasCreated: !existing };
};

export const applyPublicPageMetadata = (metadata: TPublicPageMetadata) => {
  const previousTitle = document.title;
  const managedElements: TManagedHeadElement[] = [];
  document.title = metadata.title;

  const metaEntries: [selector: string, attributes: Record<string, string>][] = [
    ["meta[name='description']", { name: "description", content: metadata.description }],
    ["meta[property='og:title']", { property: "og:title", content: metadata.title }],
    ["meta[property='og:description']", { property: "og:description", content: metadata.description }],
    ["meta[property='og:type']", { property: "og:type", content: "article" }],
    ["meta[property='og:url']", { property: "og:url", content: metadata.canonicalUrl }],
    ["meta[property='og:site_name']", { property: "og:site_name", content: metadata.siteName }],
    ["meta[property='og:image']", { property: "og:image", content: metadata.imageUrl }],
    ["meta[property='og:image:width']", { property: "og:image:width", content: "1200" }],
    ["meta[property='og:image:height']", { property: "og:image:height", content: "630" }],
    ["meta[property='og:image:alt']", { property: "og:image:alt", content: metadata.title }],
    ["meta[name='twitter:card']", { name: "twitter:card", content: "summary_large_image" }],
    ["meta[name='twitter:title']", { name: "twitter:title", content: metadata.title }],
    ["meta[name='twitter:description']", { name: "twitter:description", content: metadata.description }],
    ["meta[name='twitter:image']", { name: "twitter:image", content: metadata.imageUrl }],
    ["meta[name='twitter:image:alt']", { name: "twitter:image:alt", content: metadata.title }],
  ];

  if (metadata.updatedAt) {
    metaEntries.push([
      "meta[property='article:modified_time']",
      { property: "article:modified_time", content: metadata.updatedAt },
    ]);
  }

  metaEntries.forEach(([selector, attributes]) => managedElements.push(upsertMeta(selector, attributes)));

  const existingCanonical = document.head.querySelector<HTMLLinkElement>("link[rel='canonical']");
  const canonical = existingCanonical ?? document.createElement("link");
  const originalCanonicalHref = existingCanonical?.getAttribute("href") ?? null;
  canonical.setAttribute("rel", "canonical");
  canonical.setAttribute("href", metadata.canonicalUrl);
  canonical.setAttribute(PUBLIC_PAGE_META_ATTRIBUTE, "true");
  if (!existingCanonical) document.head.appendChild(canonical);

  return () => {
    document.title = previousTitle;
    managedElements.forEach(({ element, originalContent, wasCreated }) => {
      if (wasCreated) {
        element.remove();
        return;
      }

      element.removeAttribute(PUBLIC_PAGE_META_ATTRIBUTE);
      if (originalContent === null) element.removeAttribute("content");
      else element.setAttribute("content", originalContent);
    });

    if (!existingCanonical) canonical.remove();
    else {
      canonical.removeAttribute(PUBLIC_PAGE_META_ATTRIBUTE);
      if (originalCanonicalHref === null) canonical.removeAttribute("href");
      else canonical.setAttribute("href", originalCanonicalHref);
    }
  };
};

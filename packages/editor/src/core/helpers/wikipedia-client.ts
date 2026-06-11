/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Thin browser-side Wikipedia REST client.
 *
 * Wikipedia's REST APIs support CORS for anonymous read requests, so we can
 * call them directly from the editor without a backend proxy.
 *
 * Both helpers are safe to await from command handlers — they catch all
 * errors and return null / [] instead of throwing.
 */

export type TWikipediaHit = {
  title: string;
  description: string;
  key: string;
};

export type TWikipediaSummary = {
  title: string;
  extract: string;
  url: string;
  thumbnail: string | null;
};

const _USER_AGENT = "DragonFruit-Atlas/1.0 (https://dragonfruit.sh)";
const _TIMEOUT_MS = 6_000;

async function _fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), _TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: signal ?? controller.signal,
      headers: { "User-Agent": _USER_AGENT },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search Wikipedia for the given query.
 *
 * Returns up to `limit` hits from the Wikipedia REST search endpoint.
 * Returns [] on any error.
 */
export async function searchWikipedia(
  query: string,
  { lang = "en", limit = 3 }: { lang?: string; limit?: number } = {}
): Promise<TWikipediaHit[]> {
  query = (query ?? "").trim();
  if (!query) return [];
  const params = new URLSearchParams({ q: query, limit: String(Math.max(1, Math.min(limit, 10))) });
  const url = `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?${params.toString()}`;
  try {
    const res = await _fetchWithTimeout(url);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const rawPages: unknown =
      typeof data === "object" && data !== null && "pages" in data ? (data as Record<string, unknown>).pages : [];
    const pages: Record<string, unknown>[] = Array.isArray(rawPages)
      ? (rawPages as unknown[]).filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
      : [];
    return pages
      .map((p) => ({
        title: String(p.title ?? ""),
        description: String(p.description ?? ""),
        key: String(p.key ?? p.title ?? ""),
      }))
      .filter((p) => p.title);
  } catch {
    return [];
  }
}

/**
 * Fetch the summary for a Wikipedia article by title.
 *
 * Returns null on any error or non-200 response.
 */
export async function fetchWikipediaSummary(title: string, { lang = "en" } = {}): Promise<TWikipediaSummary | null> {
  title = (title ?? "").trim();
  if (!title) return null;
  const encoded = encodeURIComponent(title);
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  try {
    const res = await _fetchWithTimeout(url);
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    if (typeof raw !== "object" || raw === null) return null;
    const data = raw as Record<string, unknown>;

    const resultTitle = String(data.title ?? title);
    const extract = String(data.extract ?? "");

    let desktopUrl = "";
    const contentUrls = data.content_urls;
    if (typeof contentUrls === "object" && contentUrls !== null) {
      const desktop = (contentUrls as Record<string, unknown>).desktop;
      if (typeof desktop === "object" && desktop !== null) {
        desktopUrl = String((desktop as Record<string, unknown>).page ?? "");
      }
    }

    let thumbnailSrc: string | null = null;
    const thumbnail = data.thumbnail;
    if (typeof thumbnail === "object" && thumbnail !== null) {
      const src = (thumbnail as Record<string, unknown>).source;
      thumbnailSrc = typeof src === "string" ? src : null;
    }

    return { title: resultTitle, extract, url: desktopUrl, thumbnail: thumbnailSrc };
  } catch {
    return null;
  }
}

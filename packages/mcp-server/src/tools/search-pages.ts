import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";

import { asPrettyJson, dragonfruitRequest, getWorkspacePath, toPaginatedResult } from "@/lib";

export const schema = {
  query: z.string().min(1).describe("Search text for workspace pages"),
  limit: z.number().int().min(1).max(100).default(25).describe("Maximum pages to return"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
};

export const metadata: ToolMetadata = {
  name: "search_pages",
  description: "Search workspace pages by text.",
  annotations: {
    title: "Search Pages",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

export default async function searchPages({ query, limit, offset }: InferSchema<typeof schema>) {
  const params = new URLSearchParams({
    search: query,
    workspace_search: "true",
    limit: String(limit),
    offset: String(offset),
  });

  const response = await dragonfruitRequest(getWorkspacePath(`/search/?${params.toString()}`));

  if (response && typeof response === "object" && !Array.isArray(response)) {
    const pages = (response as Record<string, unknown>).pages;
    const paged = toPaginatedResult<Record<string, unknown>>(pages, { limit, offset });

    return asPrettyJson({
      query,
      ...paged,
    });
  }

  return asPrettyJson({
    query,
    items: [],
    total: 0,
    pagination: {
      limit,
      offset,
      next_offset: null,
      has_more: false,
    },
  });
}

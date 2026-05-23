import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";

import { asPrettyJson, dragonfruitRequest, getWorkspacePath, pickProjectSummary, toPaginatedResult } from "@/lib";

export const schema = {
  limit: z.number().int().min(1).max(100).default(25).describe("Maximum projects to return"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
};

export const metadata: ToolMetadata = {
  name: "list_projects",
  description: "List projects in the configured Dragon Fruit workspace.",
  annotations: {
    title: "List Projects",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

export default async function listProjects({ limit, offset }: InferSchema<typeof schema>) {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const response = await dragonfruitRequest(getWorkspacePath(`/projects/?${query.toString()}`));
  const paged = toPaginatedResult<Record<string, unknown>>(response, { limit, offset });

  return asPrettyJson({
    ...paged,
    items: paged.items.map((project) => pickProjectSummary(project)),
  });
}

import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";

import { asPrettyJson, dragonfruitRequest, getWorkspacePath, pickIssueSummary, toPaginatedResult } from "@/lib";

export const schema = {
  project_id: z.string().optional().describe("Filter tasks by project UUID"),
  state: z.string().optional().describe("Filter by workflow state name"),
  limit: z.number().int().min(1).max(100).default(25).describe("Maximum tasks to return"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
};

export const metadata: ToolMetadata = {
  name: "list_tasks",
  description: "List workspace tasks with optional project/state filters.",
  annotations: {
    title: "List Tasks",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

export default async function listTasks({ project_id, state, limit, offset }: InferSchema<typeof schema>) {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (project_id) query.set("project_id", project_id);
  if (state) query.set("state", state);

  const response = await dragonfruitRequest(`${getWorkspacePath("/issues/")}?${query.toString()}`);
  const paged = toPaginatedResult<Record<string, unknown>>(response, { limit, offset });

  return asPrettyJson({
    ...paged,
    items: paged.items.map((issue) => pickIssueSummary(issue)),
  });
}

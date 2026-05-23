import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";

import { asPrettyJson, dragonfruitRequest, getWorkspacePath } from "@/lib";

export const schema = {
  project_id: z.string().describe("Project UUID for the task"),
  issue_id: z.string().describe("Task (issue) UUID to fetch"),
};

export const metadata: ToolMetadata = {
  name: "get_task",
  description: "Fetch one Dragon Fruit task by project + task id.",
  annotations: {
    title: "Get Task",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

export default async function getTask({ project_id, issue_id }: InferSchema<typeof schema>) {
  const response = await dragonfruitRequest(getWorkspacePath(`/projects/${project_id}/issues/${issue_id}/`));
  return asPrettyJson(response);
}

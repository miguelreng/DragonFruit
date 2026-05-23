import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";

import { asPrettyJson, dragonfruitRequest, getWorkspacePath } from "@/lib";

export const schema = {
  project_id: z.string().describe("Project UUID for the task"),
  issue_id: z.string().describe("Task (issue) UUID to update"),
  name: z.string().min(1).max(255).optional().describe("New task title"),
  description_html: z.string().optional().describe("New HTML description"),
  state_id: z.string().optional().describe("New workflow state UUID"),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional().describe("New task priority"),
};

export const metadata: ToolMetadata = {
  name: "update_task",
  description: "Update an existing Dragon Fruit task.",
  annotations: {
    title: "Update Task",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
};

export default async function updateTask({
  project_id,
  issue_id,
  name,
  description_html,
  state_id,
  priority,
}: InferSchema<typeof schema>) {
  const payload: Record<string, unknown> = {};

  if (name !== undefined) payload.name = name;
  if (description_html !== undefined) payload.description_html = description_html;
  if (state_id !== undefined) payload.state = state_id;
  if (priority !== undefined) payload.priority = priority;

  if (Object.keys(payload).length === 0) {
    return asPrettyJson({
      ok: true,
      message: "No fields provided to update.",
    });
  }

  const response = await dragonfruitRequest(getWorkspacePath(`/projects/${project_id}/issues/${issue_id}/`), {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return asPrettyJson(response);
}

import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";

import { asPrettyJson, dragonfruitRequest, getWorkspacePath } from "@/lib";

export const schema = {
  project_id: z.string().describe("Project UUID where the task will be created"),
  name: z.string().min(1).max(255).describe("Task title"),
  description_html: z.string().optional().describe("Optional HTML description"),
  state_id: z.string().optional().describe("Optional workflow state UUID"),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional().describe("Optional task priority"),
};

export const metadata: ToolMetadata = {
  name: "create_task",
  description: "Create a new task in a Dragon Fruit project.",
  annotations: {
    title: "Create Task",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
};

export default async function createTask({
  project_id,
  name,
  description_html,
  state_id,
  priority,
}: InferSchema<typeof schema>) {
  const payload: Record<string, unknown> = {
    name,
  };

  if (description_html !== undefined) payload.description_html = description_html;
  if (state_id !== undefined) payload.state = state_id;
  if (priority !== undefined) payload.priority = priority;

  const response = await dragonfruitRequest(getWorkspacePath(`/projects/${project_id}/issues/`), {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return asPrettyJson(response);
}

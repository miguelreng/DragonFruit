import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";

import { asPrettyJson, dragonfruitRequest, getWorkspacePath } from "@/lib";

export const schema = {
  project_id: z.string().describe("Project UUID for the task"),
  issue_id: z.string().describe("Task (issue) UUID to comment on"),
  comment_html: z.string().min(1).describe("Comment text or HTML to post"),
};

export const metadata: ToolMetadata = {
  name: "add_comment",
  description: "Add a comment to a Dragon Fruit task.",
  annotations: {
    title: "Add Comment",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
};

export default async function addComment({ project_id, issue_id, comment_html }: InferSchema<typeof schema>) {
  const response = await dragonfruitRequest(getWorkspacePath(`/projects/${project_id}/issues/${issue_id}/comments/`), {
    method: "POST",
    body: JSON.stringify({
      comment_html,
    }),
  });

  return asPrettyJson(response);
}

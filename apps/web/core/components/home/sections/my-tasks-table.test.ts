import { describe, expect, it } from "vitest";
import { MY_TASKS_TABLE_COLUMNS } from "./my-tasks-table";

describe("My Tasks table", () => {
  it("shows the task and project context needed across projects", () => {
    expect(MY_TASKS_TABLE_COLUMNS).toEqual([
      "Task",
      "Project",
      "State",
      "Priority",
      "Assignee",
      "Due date",
      "Labels",
      "Updated",
    ]);
  });
});

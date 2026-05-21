/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { TPowerKSearchResultsKeys } from "./types";

export type TPowerKScope = "all" | "pages" | "tasks" | "projects" | "people" | "ai";

export const POWER_K_SCOPE_CHIPS: { id: TPowerKScope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "tasks", label: "Tasks" },
  { id: "pages", label: "Pages" },
  { id: "projects", label: "Projects" },
  { id: "people", label: "People" },
  { id: "ai", label: "Ask AI" },
];

export const SCOPE_TO_RESULT_KEYS: Record<TPowerKScope, TPowerKSearchResultsKeys[] | null> = {
  all: null,
  tasks: ["issue"],
  pages: ["page"],
  projects: ["project", "workspace"],
  people: [],
  ai: [],
};

import type { RouteConfigEntry } from "@react-router/dev/routes";
import { describe, expect, it } from "vitest";
import { mergeRoutes } from "./helper";

describe("mergeRoutes", () => {
  it("preserves route aliases that share a module when they have unique IDs", () => {
    const routes: RouteConfigEntry[] = [
      {
        id: "public-page-legacy",
        path: "published/:workspaceSlug/:pageSlug",
        file: "./published-page.tsx",
      },
      {
        id: "public-page-doc",
        path: ":workspaceSlug/doc/:pageSlug",
        file: "./published-page.tsx",
      },
    ];

    expect(mergeRoutes(routes, [])).toEqual(routes);
  });
});

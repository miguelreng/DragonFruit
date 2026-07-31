import { describe, expect, it } from "vitest";
import { coreRoutes } from "./core";

describe("public page routes", () => {
  it("registers legacy and canonical branded paths", () => {
    const publicPagePaths = coreRoutes
      .filter((route) => route.id?.startsWith("public-page-"))
      .map((route) => route.path);

    expect(publicPagePaths).toEqual([
      "published/:workspaceSlug/:pageSlug",
      ":workspaceSlug/doc/:pageSlug",
      ":workspaceSlug/wiki/:pageSlug",
      ":workspaceSlug/whiteboard/:pageSlug",
      ":workspaceSlug/pdf/:pageSlug",
      ":workspaceSlug/sheet/:pageSlug",
    ]);
  });
});

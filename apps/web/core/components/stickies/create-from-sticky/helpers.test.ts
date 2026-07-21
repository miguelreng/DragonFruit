/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { EPageAccess } from "@plane/types";
import { buildStickyTargetPayload, resolveStickyTargetTitle } from "./helpers";

describe("resolveStickyTargetTitle", () => {
  it("uses the trimmed Sticky title when it is present", () => {
    expect(resolveStickyTargetTitle({ name: "  Launch brief  ", description_html: "<p>Ignored body</p>" })).toBe(
      "Launch brief"
    );
  });

  it("falls back to normalized plain text from the body", () => {
    expect(
      resolveStickyTargetTitle({
        name: "   ",
        description_html: "<p>First&nbsp;idea</p><p>with   extra\n whitespace</p>",
      })
    ).toBe("First idea with extra whitespace");
  });

  it("never includes HTML tags in the derived title", () => {
    const title = resolveStickyTargetTitle({ description_html: "<h2>Plan</h2><p><strong>Ship</strong> it</p>" });

    expect(title).toBe("Plan Ship it");
    expect(title).not.toMatch(/[<>]/);
  });

  it("caps a body-derived title at 100 characters", () => {
    expect(resolveStickyTargetTitle({ description_html: `<p>${"a".repeat(140)}</p>` })).toHaveLength(100);
  });

  it("uses the Untitled fallback when title and body are empty", () => {
    expect(resolveStickyTargetTitle({ name: " ", description_html: "<p> </p>" })).toBe("Untitled sticky");
  });
});

describe("buildStickyTargetPayload", () => {
  it("preserves rich-text body HTML byte-for-byte", () => {
    const descriptionHtml = '<p data-id="one">Hello <strong>world</strong></p>\n';

    expect(
      buildStickyTargetPayload("task", { name: "Hello", description_html: descriptionHtml }).payload
    ).toHaveProperty("description_html", descriptionHtml);
  });

  it("builds a private Doc payload", () => {
    expect(buildStickyTargetPayload("doc", { name: "Spec", description_html: "<p>Body</p>" })).toEqual({
      target: "doc",
      payload: {
        name: "Spec",
        description_html: "<p>Body</p>",
        page_type: "doc",
        access: EPageAccess.PRIVATE,
      },
    });
  });

  it("does not invent Task defaults", () => {
    const result = buildStickyTargetPayload("task", { name: "Follow up", description_html: "<p>Call Alex</p>" });

    expect(result).toEqual({
      target: "task",
      payload: {
        name: "Follow up",
        description_html: "<p>Call Alex</p>",
      },
    });
    expect(Object.keys(result.payload)).toHaveLength(2);
    expect(Object.keys(result.payload)).toEqual(expect.arrayContaining(["description_html", "name"]));
  });
});

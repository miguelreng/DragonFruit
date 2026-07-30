/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { isAllowedWebSocketOrigin } from "@/controllers/collaboration.controller";

describe("WebSocket origin validation", () => {
  const origins = "https://app.dragonfruit.sh, https://preview.dragonfruit.sh/";

  it("accepts exact configured browser origins", () => {
    expect(isAllowedWebSocketOrigin("https://app.dragonfruit.sh", origins)).toBe(true);
    expect(isAllowedWebSocketOrigin("https://preview.dragonfruit.sh", origins)).toBe(true);
  });

  it("rejects attacker origins and suffix tricks", () => {
    expect(isAllowedWebSocketOrigin("https://evil.example", origins)).toBe(false);
    expect(isAllowedWebSocketOrigin("https://app.dragonfruit.sh.evil.example", origins)).toBe(false);
  });

  it("allows clients without an Origin header", () => {
    expect(isAllowedWebSocketOrigin(undefined, origins)).toBe(true);
  });
});

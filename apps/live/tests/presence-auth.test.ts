import { describe, expect, it } from "vitest";

import { isAuthorizedPresenceDocumentName } from "../src/lib/presence-auth";

describe("presence room authorization", () => {
  it("only accepts the namespaced room for the authorized page", () => {
    expect(isAuthorizedPresenceDocumentName("presence:page-1", "page-1")).toBe(true);
    expect(isAuthorizedPresenceDocumentName("presence:page-2", "page-1")).toBe(false);
    expect(isAuthorizedPresenceDocumentName("page-1", "page-1")).toBe(false);
    expect(isAuthorizedPresenceDocumentName("presence:page-1", null)).toBe(false);
  });
});

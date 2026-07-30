import { describe, expect, it } from "vitest";
import {
  PRESENCE_EDITING_STALE_AFTER,
  createCurrentPresenceParticipant,
  isPresenceEditingActive,
} from "./presence-state";

describe("createCurrentPresenceParticipant", () => {
  it("keeps the current user visible with their profile picture when they are alone", () => {
    expect(
      createCurrentPresenceParticipant({
        avatarUrl: "https://example.com/me.png",
        color: "#a1006b",
        id: "user-1",
        name: "Miguel",
      })
    ).toEqual({
      avatarUrl: "https://example.com/me.png",
      clientId: 0,
      color: "#a1006b",
      id: "user-1",
      isCurrentUser: true,
      isEditing: false,
      name: "Miguel",
    });
  });
});

describe("isPresenceEditingActive", () => {
  it("is active at the stale boundary", () => {
    expect(isPresenceEditingActive(10_000, 10_000 + PRESENCE_EDITING_STALE_AFTER)).toBe(true);
  });

  it("expires after the stale boundary", () => {
    expect(isPresenceEditingActive(10_000, 10_001 + PRESENCE_EDITING_STALE_AFTER)).toBe(false);
  });

  it("rejects missing, invalid, and future timestamps", () => {
    expect(isPresenceEditingActive(undefined, 10_000)).toBe(false);
    expect(isPresenceEditingActive(Number.NaN, 10_000)).toBe(false);
    expect(isPresenceEditingActive(10_001, 10_000)).toBe(false);
  });
});

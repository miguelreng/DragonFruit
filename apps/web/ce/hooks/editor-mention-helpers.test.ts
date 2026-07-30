import { describe, expect, it } from "vitest";
import { getPageMentionKind, shouldSuggestProjectCalendar } from "./editor-mention-helpers";

describe("getPageMentionKind", () => {
  it("keeps whiteboards distinct from regular page mentions", () => {
    expect(getPageMentionKind("whiteboard")).toBe("whiteboard");
    expect(getPageMentionKind("doc")).toBe("page");
    expect(getPageMentionKind(undefined)).toBe("page");
  });
});

describe("shouldSuggestProjectCalendar", () => {
  it("shows the project calendar when the picker opens or its label matches", () => {
    expect(shouldSuggestProjectCalendar("", "Publishing")).toBe(true);
    expect(shouldSuggestProjectCalendar("cal", "Publishing")).toBe(true);
    expect(shouldSuggestProjectCalendar("publish", "Publishing")).toBe(true);
  });

  it("does not show an unrelated calendar result", () => {
    expect(shouldSuggestProjectCalendar("roadmap", "Publishing")).toBe(false);
  });
});

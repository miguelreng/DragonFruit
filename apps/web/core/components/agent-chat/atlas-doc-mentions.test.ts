import { describe, expect, it } from "vitest";
import { getAtlasPromptHighlightParts } from "./atlas-doc-mentions";

describe("getAtlasPromptHighlightParts", () => {
  it("splits multiple mentions from surrounding prompt text", () => {
    expect(getAtlasPromptHighlightParts("Compare @launch-brief with @release-plan today")).toEqual([
      {
        isMention: false,
        key: "text-0-8",
        text: "Compare ",
      },
      {
        isMention: true,
        key: "mention-8-21",
        text: "@launch-brief",
      },
      {
        isMention: false,
        key: "text-21-27",
        text: " with ",
      },
      {
        isMention: true,
        key: "mention-27-40",
        text: "@release-plan",
      },
      {
        isMention: false,
        key: "text-40-46",
        text: " today",
      },
    ]);
  });

  it("keeps trailing punctuation outside the highlighted mention", () => {
    expect(getAtlasPromptHighlightParts("Review @launch-brief, please")).toEqual([
      {
        isMention: false,
        key: "text-0-7",
        text: "Review ",
      },
      {
        isMention: true,
        key: "mention-7-20",
        text: "@launch-brief",
      },
      {
        isMention: false,
        key: "text-20-21",
        text: ",",
      },
      {
        isMention: false,
        key: "text-21-28",
        text: " please",
      },
    ]);
  });

  it("does not treat the at sign inside an email address as a mention", () => {
    expect(getAtlasPromptHighlightParts("Email atlas@example.com")).toEqual([
      {
        isMention: false,
        key: "text-0-23",
        text: "Email atlas@example.com",
      },
    ]);
  });
});

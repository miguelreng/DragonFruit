import { describe, expect, it } from "vitest";

import {
  getAtlasChatProgressLabel,
  getAtlasDocWriteProgressLabel,
  getAtlasPromptLanguage,
  getInitialAtlasProgressLabel,
} from "./atlas-progress";

describe("Atlas progress labels", () => {
  it("detects Spanish edit requests without translating raw reasoning", () => {
    expect(getAtlasPromptLanguage("Tradúcelo todo al inglés")).toBe("es");
    expect(getInitialAtlasProgressLabel("es")).toBe("Revisando tu solicitud…");
  });

  it("maps real tool events to specific, localized activity", () => {
    expect(getAtlasChatProgressLabel({ type: "progress", stage: "tool_started", tool: "search_workspace" }, "es")).toBe(
      "Buscando en tu espacio de trabajo…"
    );
    expect(getAtlasChatProgressLabel({ type: "progress", stage: "tool_completed", tool: "web_search" }, "en")).toBe(
      "Reviewing what I found…"
    );
  });

  it("uses document coverage from the event instead of rotating filler", () => {
    expect(
      getAtlasDocWriteProgressLabel(
        {
          event: "progress",
          stage: "drafting",
          current_start: 81,
          current_end: 120,
          total_blocks: 120,
        },
        "en"
      )
    ).toBe("Drafting changes for sections 81–120 of 120…");
  });
});

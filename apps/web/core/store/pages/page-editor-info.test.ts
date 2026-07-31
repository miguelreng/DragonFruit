import { describe, expect, it } from "vitest";
import { PageEditorInstance } from "./page-editor-info";

describe("PageEditorInstance Atlas review state", () => {
  it("keeps title proposals and the recovery snapshot with the document", () => {
    const editor = new PageEditorInstance();
    const snapshot = {
      bodyHtml: "<p>Before</p>",
      titleHtml: "<h1>Before</h1>",
    };
    const titleProposal = {
      id: "title-1",
      operation: "replace" as const,
      status: "pending" as const,
      targetOriginalText: "Before",
      contentText: "Después",
    };

    editor.setAtlasReviewSnapshot(snapshot);
    editor.setAtlasTitleProposals([titleProposal]);
    editor.setAtlasReviewCoverage({ processed: 81, total: 160 });
    editor.setAtlasReviewPhase("reviewing");

    expect(editor.atlasReviewSnapshot).toEqual(snapshot);
    expect(editor.atlasTitleProposals).toEqual([titleProposal]);
    expect(editor.atlasReviewCoverage).toEqual({ processed: 81, total: 160 });
    expect(editor.atlasReviewPhase).toBe("reviewing");
  });

  it("clears review metadata only through explicit document actions", () => {
    const editor = new PageEditorInstance();
    editor.setAtlasReviewSnapshot({
      bodyHtml: "<p>Before</p>",
      titleHtml: "<h1>Before</h1>",
    });
    editor.setAtlasTitleProposals([
      {
        id: "title-1",
        operation: "replace",
        status: "pending",
        targetOriginalText: "Before",
        contentText: "After",
      },
    ]);

    editor.setAtlasReviewSnapshot(null);
    editor.setAtlasTitleProposals([]);
    editor.setAtlasReviewCoverage(null);

    expect(editor.atlasReviewSnapshot).toBeNull();
    expect(editor.atlasTitleProposals).toEqual([]);
    expect(editor.atlasReviewCoverage).toBeNull();
  });
});

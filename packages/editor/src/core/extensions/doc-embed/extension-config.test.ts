// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import TiptapDocument from "@tiptap/extension-document";
import TiptapParagraph from "@tiptap/extension-paragraph";
import TiptapText from "@tiptap/extension-text";
import { describe, expect, it } from "vitest";
import { DocEmbedExtensionConfig } from "./extension-config";

describe("Doc embeds", () => {
  it("round-trips an attached page through editor JSON and HTML", () => {
    const editor = new Editor({
      extensions: [TiptapDocument, TiptapParagraph, TiptapText, DocEmbedExtensionConfig],
      content: {
        type: "doc",
        content: [
          {
            type: "doc-embed-component",
            attrs: {
              embed_type: "page",
              entity_identifier: "page-1",
              project_identifier: "project-1",
              workspace_identifier: "workspace-1",
              title: "Morning notes",
              snapshot: { title: "Morning notes" },
            },
          },
        ],
      },
    });

    const node = editor.getJSON().content?.[0];
    expect(node?.attrs).toMatchObject({
      embed_type: "page",
      entity_identifier: "page-1",
      project_identifier: "project-1",
      workspace_identifier: "workspace-1",
      title: "Morning notes",
      snapshot: { title: "Morning notes" },
    });

    const html = editor.getHTML();
    expect(html).toContain("<doc-embed-component");
    expect(html).toContain('embed_type="page"');
    expect(html).toContain('entity_identifier="page-1"');

    editor.destroy();
  });
});

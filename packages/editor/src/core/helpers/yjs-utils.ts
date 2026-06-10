/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Buffer } from "buffer";
import type { Extensions, JSONContent } from "@tiptap/core";
import { getSchema } from "@tiptap/core";
import { generateHTML, generateJSON } from "@tiptap/html";
import { prosemirrorJSONToYDoc, updateYFragment, yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import * as Y from "yjs";
// extensions
import type { TDocumentPayload } from "@plane/types";
import {
  CoreEditorExtensionsWithoutProps,
  DocumentEditorExtensionsWithoutProps,
} from "@/extensions/core-without-props";
import { TitleExtensions } from "@/extensions/title-extension";
import { sanitizeHTML } from "@plane/utils";

// editor extension configs
const RICH_TEXT_EDITOR_EXTENSIONS = CoreEditorExtensionsWithoutProps;
const DOCUMENT_EDITOR_EXTENSIONS = [...CoreEditorExtensionsWithoutProps, ...DocumentEditorExtensionsWithoutProps];
export const TITLE_EDITOR_EXTENSIONS: Extensions = TitleExtensions;
// editor schemas
const richTextEditorSchema = getSchema(RICH_TEXT_EDITOR_EXTENSIONS);
const documentEditorSchema = getSchema(DOCUMENT_EDITOR_EXTENSIONS);

/**
 * @description apply updates to a doc and return the updated doc in binary format
 * @param {Uint8Array} document
 * @param {Uint8Array} updates
 * @returns {Uint8Array}
 */
export const applyUpdates = (document: Uint8Array, updates?: Uint8Array): Uint8Array => {
  const yDoc = new Y.Doc();
  Y.applyUpdate(yDoc, document);
  if (updates) {
    Y.applyUpdate(yDoc, updates);
  }

  const encodedDoc = Y.encodeStateAsUpdate(yDoc);
  return encodedDoc;
};

/**
 * @description this function encodes binary data to base64 string
 * @param {Uint8Array} document
 * @returns {string}
 */
export const convertBinaryDataToBase64String = (document: Uint8Array): string =>
  Buffer.from(document).toString("base64");

/**
 * @description this function decodes base64 string to binary data
 * @param {string} document
 * @returns {Buffer<ArrayBuffer>}
 */
export const convertBase64StringToBinaryData = (document: string): Buffer<ArrayBuffer> =>
  Buffer.from(document, "base64");

/**
 * @description this function generates the binary equivalent of html content for the rich text editor
 * @param {string} descriptionHTML
 * @returns {Uint8Array}
 */
export const getBinaryDataFromRichTextEditorHTMLString = (descriptionHTML: string): Uint8Array => {
  // convert HTML to JSON
  const contentJSON = generateJSON(descriptionHTML ?? "<p></p>", RICH_TEXT_EDITOR_EXTENSIONS);
  // convert JSON to Y.Doc format
  const transformedData = prosemirrorJSONToYDoc(richTextEditorSchema, contentJSON, "default");
  // convert Y.Doc to Uint8Array format
  const encodedData = Y.encodeStateAsUpdate(transformedData);
  return encodedData;
};

export const generateTitleProsemirrorJson = (text: string): JSONContent => {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        ...(text
          ? {
              content: [
                {
                  type: "text",
                  text,
                },
              ],
            }
          : {}),
      },
    ],
  };
};

/**
 * @description this function generates the binary equivalent of html content for the document editor
 * @param {string} descriptionHTML - The HTML content to convert
 * @param {string} [title] - Optional title to append to the document
 * @returns {Uint8Array}
 */
export const getBinaryDataFromDocumentEditorHTMLString = (descriptionHTML: string, title?: string): Uint8Array => {
  // convert HTML to JSON
  const contentJSON = generateJSON(descriptionHTML ?? "<p></p>", DOCUMENT_EDITOR_EXTENSIONS);
  // convert JSON to Y.Doc format
  const transformedData = prosemirrorJSONToYDoc(documentEditorSchema, contentJSON, "default");

  // If title is provided, merge it into the document
  if (title != null) {
    const titleJSON = generateTitleProsemirrorJson(title);
    const titleField = prosemirrorJSONToYDoc(documentEditorSchema, titleJSON, "title");
    // Encode the title YDoc to updates and apply them to the main document
    const titleUpdates = Y.encodeStateAsUpdate(titleField);
    Y.applyUpdate(transformedData, titleUpdates);
  }

  // convert Y.Doc to Uint8Array format
  const encodedData = Y.encodeStateAsUpdate(transformedData);
  return encodedData;
};

/**
 * @description Reconcile a document-editor Y.Doc's "default" fragment to match
 * `descriptionHTML`, applying the change as a minimal delete/insert diff on the
 * SAME doc instead of building a fresh, independently-rooted doc. Because the
 * deletions become real CRDT operations in this doc's own history, connected
 * clients — and their IndexedDB caches — converge to the new content rather than
 * unioning it with the previous version. This is what makes a server-side
 * "replace the whole document" operation actually replace, not append. Mutates
 * `ydoc` in place inside a single transaction.
 * @param {Y.Doc} ydoc - the document to reconcile in place
 * @param {string} descriptionHTML - the new, full document HTML
 */
export const replaceDocumentEditorYDocContent = (ydoc: Y.Doc, descriptionHTML: string): void => {
  // HTML -> ProseMirror doc node, using the same schema the document editor uses.
  const contentJSON = generateJSON(descriptionHTML ?? "<p></p>", DOCUMENT_EDITOR_EXTENSIONS);
  const pmNode = documentEditorSchema.nodeFromJSON(contentJSON);
  const fragment = ydoc.getXmlFragment("default");
  ydoc.transact(() => {
    // updateYFragment is y-prosemirror's own fragment-diffing primitive (the one
    // its editor binding runs on every local change), so it produces the minimal
    // set of insert/delete ops to turn the current fragment into `pmNode`.
    updateYFragment(ydoc, fragment, pmNode, { mapping: new Map(), isOMark: new Map() });
  });
};

/**
 * @description Reconcile a live provider doc to fresh HTML, for clients that
 * must seed content client-side (no stored binary, e.g. the fallback path when
 * the live server is unreachable). Reuses the in-place reconcile for the body —
 * a fresh, independently-rooted seed applied via Y.applyUpdate would union with
 * the editor's IndexedDB cache and stack a duplicate copy on every open. The
 * title fragment is only seeded when currently empty, for the same reason.
 * @param {Y.Doc} ydoc - the provider document to reconcile in place
 * @param {string} descriptionHTML - the new, full document HTML
 * @param {string} [title] - title to seed when the doc has none yet
 */
export const replaceDocumentEditorYDocFromHTML = (ydoc: Y.Doc, descriptionHTML: string, title?: string): void => {
  replaceDocumentEditorYDocContent(ydoc, descriptionHTML);
  if (title != null && ydoc.getXmlFragment("title").length === 0) {
    const titleJSON = generateTitleProsemirrorJson(title);
    const titleField = prosemirrorJSONToYDoc(documentEditorSchema, titleJSON, "title");
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(titleField));
  }
};

/**
 * @description Replace the entire content of a document-editor doc with
 * `descriptionHTML` and return all stored formats. When `existingBinary` is
 * provided, the result is a proper *successor* of that state (its deletions are
 * real tombstones), so clients replace rather than union their cached content.
 * When omitted/empty, this is equivalent to a fresh conversion (correct for a
 * brand-new doc). This is the building block for replacing a meeting-notes /
 * generated doc that may already be open in collaborative editors.
 * @param {string} descriptionHTML - the new, full document HTML
 * @param {Uint8Array} [existingBinary] - the current stored Yjs binary, if any
 * @returns {TDocumentPayload}
 */
export const replaceDocumentEditorBinaryFromHTML = (
  descriptionHTML: string,
  existingBinary?: Uint8Array
): TDocumentPayload => {
  const ydoc = new Y.Doc();
  if (existingBinary && existingBinary.byteLength > 0) {
    Y.applyUpdate(ydoc, existingBinary);
  }
  replaceDocumentEditorYDocContent(ydoc, descriptionHTML);
  return serializeDocumentEditorYDoc(ydoc);
};

/**
 * @description Serialize a document-editor Y.Doc into the stored formats
 * (base64 binary + JSON + HTML). Useful after mutating an in-memory collaborative
 * document so the backend can persist the same state the live server holds.
 * @param {Y.Doc} ydoc
 * @returns {TDocumentPayload}
 */
export const serializeDocumentEditorYDoc = (ydoc: Y.Doc): TDocumentPayload => {
  const encoded = Y.encodeStateAsUpdate(ydoc);
  const { contentBinaryEncoded, contentHTML, contentJSON } = getAllDocumentFormatsFromDocumentEditorBinaryData(
    encoded,
    false
  );
  return {
    description_binary: contentBinaryEncoded,
    description_html: contentHTML,
    description_json: contentJSON,
  };
};

/**
 * @description this function generates all document formats for the provided binary data for the rich text editor
 * @param {Uint8Array} description
 * @returns
 */
export const getAllDocumentFormatsFromRichTextEditorBinaryData = (
  description: Uint8Array
): {
  contentBinaryEncoded: string;
  contentJSON: object;
  contentHTML: string;
} => {
  // encode binary description data
  const base64Data = convertBinaryDataToBase64String(description);
  const yDoc = new Y.Doc();
  Y.applyUpdate(yDoc, description);
  // convert to JSON
  const type = yDoc.getXmlFragment("default");
  const contentJSON = yXmlFragmentToProseMirrorRootNode(type, richTextEditorSchema).toJSON();
  // convert to HTML
  const contentHTML = generateHTML(contentJSON, RICH_TEXT_EDITOR_EXTENSIONS);

  return {
    contentBinaryEncoded: base64Data,
    contentJSON,
    contentHTML,
  };
};

/**
 * @description this function generates all document formats for the provided binary data for the document editor
 * @param {Uint8Array} description
 * @returns
 */
export const getAllDocumentFormatsFromDocumentEditorBinaryData = (
  description: Uint8Array,
  updateTitle: boolean
): {
  contentBinaryEncoded: string;
  contentJSON: object;
  contentHTML: string;
  titleHTML?: string;
} => {
  // encode binary description data
  const base64Data = convertBinaryDataToBase64String(description);
  const yDoc = new Y.Doc();
  Y.applyUpdate(yDoc, description);
  // convert to JSON
  const type = yDoc.getXmlFragment("default");
  const contentJSON = yXmlFragmentToProseMirrorRootNode(type, documentEditorSchema).toJSON();
  // convert to HTML
  const contentHTML = generateHTML(contentJSON, DOCUMENT_EDITOR_EXTENSIONS);

  if (updateTitle) {
    const title = yDoc.getXmlFragment("title");
    const titleJSON = yXmlFragmentToProseMirrorRootNode(title, documentEditorSchema).toJSON();
    const titleHTML = extractTextFromHTML(generateHTML(titleJSON, DOCUMENT_EDITOR_EXTENSIONS));

    return {
      contentBinaryEncoded: base64Data,
      contentJSON,
      contentHTML,
      titleHTML,
    };
  } else {
    return {
      contentBinaryEncoded: base64Data,
      contentJSON,
      contentHTML,
    };
  }
};

type TConvertHTMLDocumentToAllFormatsArgs = {
  document_html: string;
  variant: "rich" | "document";
};

/**
 * @description Converts HTML content to all supported document formats (JSON, HTML, and binary)
 * @param {TConvertHTMLDocumentToAllFormatsArgs} args - Arguments containing HTML content and variant type
 * @param {string} args.document_html - The HTML content to convert
 * @param {"rich" | "document"} args.variant - The type of editor variant to use for conversion
 * @returns {TDocumentPayload} Object containing the document in all supported formats
 * @throws {Error} If an invalid variant is provided
 */
export const convertHTMLDocumentToAllFormats = (args: TConvertHTMLDocumentToAllFormatsArgs): TDocumentPayload => {
  const { document_html, variant } = args;

  let allFormats: TDocumentPayload;

  if (variant === "rich") {
    // Convert HTML to binary format for rich text editor
    const contentBinary = getBinaryDataFromRichTextEditorHTMLString(document_html);
    // Generate all document formats from the binary data
    const { contentBinaryEncoded, contentHTML, contentJSON } =
      getAllDocumentFormatsFromRichTextEditorBinaryData(contentBinary);
    allFormats = {
      description_json: contentJSON,
      description_html: contentHTML,
      description_binary: contentBinaryEncoded,
    };
  } else if (variant === "document") {
    // Convert HTML to binary format for document editor
    const contentBinary = getBinaryDataFromDocumentEditorHTMLString(document_html);
    // Generate all document formats from the binary data
    const { contentBinaryEncoded, contentHTML, contentJSON } = getAllDocumentFormatsFromDocumentEditorBinaryData(
      contentBinary,
      false
    );
    allFormats = {
      description_json: contentJSON,
      description_html: contentHTML,
      description_binary: contentBinaryEncoded,
    };
  } else {
    throw new Error(`Invalid variant provided: ${variant}`);
  }

  return allFormats;
};

export const extractTextFromHTML = (html: string): string => {
  // Use DOMPurify to safely extract text and remove all HTML tags
  // This is more secure than regex as it handles edge cases and prevents injection
  // Note: sanitizeHTML trims whitespace, which is acceptable for title extraction
  const sanitizedText = sanitizeHTML(html); // sanitize the string to remove all HTML tags
  return sanitizedText.trim() || ""; // trim the string to remove leading and trailing whitespaces
};

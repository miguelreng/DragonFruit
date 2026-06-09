/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Hocuspocus } from "@hocuspocus/server";
import type { Request, Response } from "express";
import { z } from "zod";
// plane imports
import { Controller, Post } from "@plane/decorators";
import {
  convertBase64StringToBinaryData,
  replaceDocumentEditorBinaryFromHTML,
  replaceDocumentEditorYDocContent,
  serializeDocumentEditorYDoc,
} from "@plane/editor";
import { logger } from "@plane/logger";

// Validate request body. `existing_binary` is the base64 of the doc's currently
// stored Yjs blob (optional — absent for a brand-new doc).
const replaceDocumentSchema = z.object({
  page_id: z.string().min(1, "page_id is required"),
  description_html: z
    .string()
    .min(1, "HTML content cannot be empty")
    .refine((html) => html.trim().length > 0, "HTML content cannot be just whitespace")
    .refine((html) => html.includes("<") && html.includes(">"), "Content must be valid HTML"),
  existing_binary: z.string().optional(),
});

/**
 * Replaces a document-editor page's entire content with new HTML, in place.
 *
 * Unlike /convert-document (which builds a fresh, independently-rooted Yjs doc),
 * this reconciles the new content against the doc's *existing* state so the
 * change is a proper successor — its deletions are real CRDT tombstones. That's
 * what lets collaborative clients (and their IndexedDB caches) replace their
 * content instead of unioning the new version with the old one, which otherwise
 * stacks duplicate copies on every regeneration (e.g. re-recording a meeting).
 *
 * If the page is currently open (loaded in this server's memory), the live
 * document is reconciled directly so connected editors update live; otherwise
 * the successor is computed from the supplied `existing_binary`.
 */
@Controller("/replace-document")
export class ReplaceDocumentController {
  private readonly hocuspocusServer: Hocuspocus;

  constructor(hocuspocusServer: Hocuspocus) {
    this.hocuspocusServer = hocuspocusServer;
  }

  @Post("/")
  async replaceDocument(req: Request, res: Response) {
    try {
      const { page_id, description_html, existing_binary } = replaceDocumentSchema.parse(req.body);

      const liveDocument = this.hocuspocusServer.documents.get(page_id);

      let formats;
      if (liveDocument) {
        // The page is open in collaborative editors: mutate the in-memory doc so
        // the delete/insert diff is broadcast to connected clients (and their
        // IndexedDB caches) and scheduled for persistence. Serialize the result
        // so the caller can persist the same state immediately.
        replaceDocumentEditorYDocContent(liveDocument, description_html);
        formats = serializeDocumentEditorYDoc(liveDocument);
      } else {
        const existing = existing_binary ? convertBase64StringToBinaryData(existing_binary) : undefined;
        formats = replaceDocumentEditorBinaryFromHTML(description_html, existing);
      }

      res.status(200).json(formats);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map((err) => ({
          path: err.path.join("."),
          message: err.message,
        }));
        logger.error("REPLACE_DOCUMENT_CONTROLLER: Validation error", { validationErrors });
        return res.status(400).json({
          message: `Validation error`,
          context: { validationErrors },
        });
      }
      logger.error("REPLACE_DOCUMENT_CONTROLLER: Internal server error", error);
      return res.status(500).json({ message: `Internal server error.` });
    }
  }
}

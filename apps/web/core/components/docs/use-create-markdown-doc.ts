/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { EPageAccess } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage } from "@plane/types";
import { ProjectPageService } from "@/services/page/project-page.service";
import {
  getImportErrorMessage,
  getMarkdownTitleAndBody,
  isMarkdownFile,
  MAX_MARKDOWN_SIZE_BYTES,
  renderMarkdownToHtml,
} from "./import/markdown-doc";

const pageService = new ProjectPageService();

export { isMarkdownFile };

/**
 * Turns an uploaded markdown file into a regular `doc` page: converts the
 * markdown to HTML and creates the page with it as `description_html`, which
 * both the collaborative editor and the fallback reader seed from (same
 * mechanism as the doc template gallery). A leading `# Heading` becomes the
 * page title instead of duplicating inside the body.
 */
export const useCreateMarkdownDocPage = (workspaceSlug: string) => {
  const [isConverting, setIsConverting] = useState(false);

  const createMarkdownDocPage = useCallback(
    async (projectId: string, file: File, parentPageId?: string): Promise<TPage | null> => {
      if (!isMarkdownFile(file)) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: `"${file.name}" is not a Markdown file.` });
        return null;
      }
      if (file.size > MAX_MARKDOWN_SIZE_BYTES) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "File too large",
          message: `"${file.name}" is larger than 2 MB.`,
        });
        return null;
      }

      setIsConverting(true);
      try {
        const text = await file.text();
        const { name, body } = getMarkdownTitleAndBody(file.name, text);
        const html = renderMarkdownToHtml(body);

        const page = await pageService.create(workspaceSlug, projectId, {
          access: EPageAccess.PUBLIC,
          page_type: "doc",
          name,
          description_html: html,
          ...(parentPageId ? { parent: parentPageId } : {}),
        });
        if (!page?.id) throw new Error("Doc could not be created.");
        return page;
      } catch (err: unknown) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: getImportErrorMessage(err, `"${file.name}" could not be converted to a doc.`),
        });
        return null;
      } finally {
        setIsConverting(false);
      }
    },
    [workspaceSlug]
  );

  return { createMarkdownDocPage, isConverting };
};

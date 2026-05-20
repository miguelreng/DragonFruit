/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { PageProps } from "@react-pdf/renderer";
import { Document, Font, Page } from "@react-pdf/renderer";
import { Html } from "react-pdf-html";
// assets
// EDITOR_PDF_DOCUMENT_STYLESHEET only references three weights — normal,
// semibold (headings), bold (strong). Italics come from inline <em> in the
// HTML content. Ship the upright + italic pair for each of those three
// weights (6 .ttf files, ~2 MB) instead of all 9 weights × 2 styles (18
// files, ~6 MB) — even on the lazy PDF chunk that's a meaningful cut.
import interBold from "@/app/assets/fonts/inter/bold.ttf?url";
import interBoldItalic from "@/app/assets/fonts/inter/bold-italic.ttf?url";
import interRegular from "@/app/assets/fonts/inter/regular.ttf?url";
import interRegularItalic from "@/app/assets/fonts/inter/regular-italic.ttf?url";
import interSemibold from "@/app/assets/fonts/inter/semibold.ttf?url";
import interSemiboldItalic from "@/app/assets/fonts/inter/semibold-italic.ttf?url";
// constants
import { EDITOR_PDF_DOCUMENT_STYLESHEET } from "@/constants/editor";

Font.register({
  family: "Inter",
  fonts: [
    { src: interRegular, fontWeight: "normal" },
    { src: interRegularItalic, fontWeight: "normal", fontStyle: "italic" },
    { src: interSemibold, fontWeight: "semibold" },
    { src: interSemiboldItalic, fontWeight: "semibold", fontStyle: "italic" },
    { src: interBold, fontWeight: "bold" },
    { src: interBoldItalic, fontWeight: "bold", fontStyle: "italic" },
  ],
});

type Props = {
  content: string;
  pageFormat: PageProps["size"];
};

export function PDFDocument(props: Props) {
  const { content, pageFormat } = props;

  return (
    <Document>
      <Page
        size={pageFormat}
        style={{
          backgroundColor: "#ffffff",
          padding: 64,
        }}
      >
        <Html stylesheet={EDITOR_PDF_DOCUMENT_STYLESHEET}>{content}</Html>
      </Page>
    </Document>
  );
}

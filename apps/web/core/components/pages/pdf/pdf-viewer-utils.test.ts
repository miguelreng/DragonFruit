import { describe, expect, it } from "vitest";
import { clampPdfScale, getPdfFitWidthScale, PDF_MAX_SCALE, PDF_MIN_SCALE } from "./pdf-viewer-utils";

describe("PDF viewer scale helpers", () => {
  it("keeps manual zoom inside the supported range", () => {
    expect(clampPdfScale(0.1)).toBe(PDF_MIN_SCALE);
    expect(clampPdfScale(1.5)).toBe(1.5);
    expect(clampPdfScale(10)).toBe(PDF_MAX_SCALE);
  });

  it("fits a page into the available width after padding", () => {
    expect(getPdfFitWidthScale(1048, 1000)).toBe(1);
    expect(getPdfFitWidthScale(548, 1000)).toBe(0.5);
  });

  it("falls back safely before the viewer or page is measured", () => {
    expect(getPdfFitWidthScale(0, 1000)).toBe(1);
    expect(getPdfFitWidthScale(1000, 0)).toBe(1);
  });
});

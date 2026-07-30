export const PDF_MIN_SCALE = 0.25;
export const PDF_MAX_SCALE = 4;
export const PDF_SCALE_STEP = 0.25;

export const clampPdfScale = (scale: number) => Math.min(PDF_MAX_SCALE, Math.max(PDF_MIN_SCALE, scale));

export const getPdfFitWidthScale = (containerWidth: number, pageWidth: number, horizontalPadding = 48) => {
  if (containerWidth <= 0 || pageWidth <= 0) return 1;
  return clampPdfScale((containerWidth - horizontalPadding) / pageWidth);
};

/**
 * Photo → wire payload for scan-to-doc.
 *
 * Two constraints shape everything here. The request body is capped at 5MB by
 * both Django and the Caddy proxy, and base64 inflates bytes by ~4/3 — so a
 * six-page batch has to land well under that. And handwriting needs resolution:
 * below roughly 1000px on the long edge, cursive accuracy falls off a cliff.
 * 1600px at q0.65 sits in the middle, ~200-400KB a page.
 *
 * The picker is asked for `base64: false` on purpose: base64 of a 12MP photo is
 * a ~16MB string on the JS heap for bytes we're about to throw away. The
 * manipulator produces the only base64 that ever exists.
 */
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export const SCAN_MAX_PAGES = 6;

type ScanTier = { longEdge: number; compress: number };

const PRIMARY: ScanTier = { longEdge: 1600, compress: 0.65 };
const FALLBACK: ScanTier = { longEdge: 1200, compress: 0.5 };

/** Whole-body budget, a little under the server's 3MB raw / 5MB body ceiling. */
const BASE64_BUDGET_BYTES = 3_600_000;

export type ScanPage = {
  /** Local file uri of the original capture — the thumbnail source. */
  uri: string;
  width: number;
  height: number;
};

export type ScanImagePayload = { content_base64: string; mime_type: string };

async function encodeOne(page: ScanPage, tier: ScanTier): Promise<ScanImagePayload> {
  // Passing a single dimension lets the manipulator preserve the aspect ratio;
  // picking which one keeps a landscape shot of a two-page spread readable.
  const size =
    page.width >= page.height ? { width: tier.longEdge } : { height: tier.longEdge };
  const ref = await ImageManipulator.manipulate(page.uri).resize(size).renderAsync();
  const result = await ref.saveAsync({
    format: SaveFormat.JPEG,
    compress: tier.compress,
    base64: true,
  });
  return { content_base64: result.base64 ?? "", mime_type: "image/jpeg" };
}

function totalBytes(payloads: ScanImagePayload[]): number {
  return payloads.reduce((sum, payload) => sum + payload.content_base64.length, 0);
}

export class ScanTooLargeError extends Error {
  constructor() {
    super("Too much detail to send at once — remove a page and try again.");
    this.name = "ScanTooLargeError";
  }
}

/**
 * Downscale every page and return the wire payloads, dropping to a smaller tier
 * if the batch is over budget. Throws `ScanTooLargeError` rather than firing a
 * request the proxy would reject with a bodyless 413.
 */
export async function prepareScanImages(pages: ScanPage[]): Promise<ScanImagePayload[]> {
  const capped = pages.slice(0, SCAN_MAX_PAGES);
  let payloads = await Promise.all(capped.map((page) => encodeOne(page, PRIMARY)));

  if (totalBytes(payloads) > BASE64_BUDGET_BYTES) {
    payloads = await Promise.all(capped.map((page) => encodeOne(page, FALLBACK)));
  }
  if (totalBytes(payloads) > BASE64_BUDGET_BYTES) {
    throw new ScanTooLargeError();
  }
  return payloads.filter((payload) => payload.content_base64.length > 0);
}

/**
 * Project / page logos store emoji as a "-"-joined string of decimal Unicode
 * code points (e.g. "128512" or "128104-8205-128105" for sequences). The web
 * app reconstructs these via @plane/propel; the mobile app is isolated, so we
 * keep a tiny standalone port here.
 */

/** Rebuild an emoji string from its stored "-"-joined decimal code points. */
export function stringToEmoji(emojiString: string): string {
  if (!emojiString) return "";
  const codePoints = emojiString
    .split("-")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 0x10ffff);
  if (codePoints.length === 0) return "";
  try {
    return codePoints.map((point) => String.fromCodePoint(point)).join("");
  } catch {
    return "";
  }
}

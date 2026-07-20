import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

/**
 * iOS's speech recognizer only accepts locales that appear verbatim in
 * `SFSpeechRecognizer.supportedLocales()` (e.g. "es-419" and "en-US" exist,
 * "es-PE" and "en-PE" do not). The device locale reported by `Intl` carries
 * the device region, so on most non-US-region phones passing it straight to
 * `start({ lang })` makes every session fail with `language-not-supported`
 * before it begins. Resolve the closest supported locale once and cache it.
 */
let resolvedLocalePromise: Promise<string> | null = null;

function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {
    return "en-US";
  }
}

function matchSupportedLocale(device: string, supported: string[]): string | null {
  const normalized = device.replace(/_/g, "-").toLowerCase();
  const exact = supported.find((locale) => locale.toLowerCase() === normalized);
  if (exact) return exact;

  const language = normalized.split("-")[0];
  const sameLanguage = supported.filter((locale) => {
    const tag = locale.toLowerCase();
    return tag === language || tag.startsWith(`${language}-`);
  });
  if (sameLanguage.length === 0) return null;

  // Prefer broad regional variants over an arbitrary entry: the pan-regional
  // tag ("es-419"), then US, then the language's home region ("fr-FR").
  for (const candidate of [`${language}-419`, `${language}-us`, `${language}-${language}`]) {
    const match = sameLanguage.find((locale) => locale.toLowerCase() === candidate);
    if (match) return match;
  }
  return sameLanguage[0];
}

async function resolveAgainstSupportedLocales(): Promise<string> {
  const device = deviceLocale();
  try {
    const { locales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    // An empty list (some Android recognition services) means "can't check";
    // pass the device locale through and let the service decide.
    if (locales.length === 0) return device;
    return matchSupportedLocale(device, locales) ?? "en-US";
  } catch {
    // The lookup itself failed (e.g. Android service quirks); the device
    // locale is the best remaining guess.
    return device;
  }
}

export function resolveSpeechRecognitionLocale(): Promise<string> {
  resolvedLocalePromise ??= resolveAgainstSupportedLocales();
  return resolvedLocalePromise;
}

export type Essay = {
  id: string;
  workspace_slug: string;
  project_id: string;
  name: string;
  page_type: "doc";
  description_html: string;
  description_stripped: string | null;
  logo_props: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  public_slug: string | null;
  view_props?: {
    [key: string]: unknown;
  } | null;
};

const REQUIRED_SOURCE_KEYS = [
  "DRAGONFRUIT_API_BASE_URL",
  "DRAGONFRUIT_ESSAYS_WORKSPACE_SLUG",
  "DRAGONFRUIT_ESSAYS_PROJECT_ID",
] as const;

const runtimeEnv = import.meta.env as Record<string, string | undefined>;
const getEnvValue = (key: (typeof REQUIRED_SOURCE_KEYS)[number]) => runtimeEnv[key] ?? process.env[key];
let essaysSourceError = "";

export const getEssaysSourceError = () => essaysSourceError;

export const getEssaySlug = (essay: Essay) => essay.public_slug?.trim() || essay.id;

export const getEssayDescription = (essay: Essay, maxLength = 168) => {
  const text = (essay.description_stripped || "").replace(/\s+/g, " ").trim();
  if (!text) return "An essay from DragonFruit.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
};

type EssayHeroImage = {
  src: string;
  alt: string | null;
};

const ABSOLUTE_URL_REGEX = /^https?:\/\//i;

const normalizeApiBaseUrl = () => getEnvValue("DRAGONFRUIT_API_BASE_URL")?.replace(/\/+$/, "") ?? "";

const isSafeImageSrc = (value: string) =>
  value.length > 0 &&
  !value.startsWith("data:") &&
  !value.toLowerCase().startsWith("javascript:") &&
  !value.toLowerCase().startsWith("vbscript:");

const resolveHeroImageSrc = (essay: Essay, rawSrc: string) => {
  const src = rawSrc.trim();
  if (!isSafeImageSrc(src)) return null;
  if (ABSOLUTE_URL_REGEX.test(src)) return src;

  const apiBaseUrl = normalizeApiBaseUrl();

  if (src.startsWith("/")) {
    return apiBaseUrl ? `${apiBaseUrl}${src}` : src;
  }

  // Editor image-component often stores just the asset id.
  if (essay.workspace_slug && essay.project_id && apiBaseUrl) {
    return `${apiBaseUrl}/api/assets/v2/workspaces/${essay.workspace_slug}/projects/${essay.project_id}/download/${src}/`;
  }

  return null;
};

const extractFirstAttr = (tag: string, attr: string) => {
  const match = tag.match(new RegExp(`\\b${attr}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2]?.trim() || null;
};

export const getEssayHeroImage = (essay: Essay): EssayHeroImage | null => {
  if (essay.view_props && typeof essay.view_props === "object") {
    const illustration = essay.view_props["essay_illustration"];
    if (illustration && typeof illustration === "object") {
      const rawSrc =
        (illustration as { src?: string; image?: string; url?: string }).src ||
        (illustration as { src?: string; image?: string; url?: string }).image ||
        (illustration as { src?: string; image?: string; url?: string }).url;
      if (rawSrc) {
        const src = resolveHeroImageSrc(essay, rawSrc);
        if (src) {
          return { src, alt: essay.name ? `Illustration for ${essay.name}` : null };
        }
      }
    }
  }

  const html = essay.description_html || "";
  if (!html) return null;

  const firstImgTag = html.match(/<img\b[^>]*>/i)?.[0] ?? null;
  if (firstImgTag) {
    const rawSrc = extractFirstAttr(firstImgTag, "src");
    if (rawSrc) {
      const src = resolveHeroImageSrc(essay, rawSrc);
      if (src) {
        return { src, alt: extractFirstAttr(firstImgTag, "alt") };
      }
    }
  }

  const firstImageComponentTag = html.match(/<image-component\b[^>]*>/i)?.[0] ?? null;
  if (firstImageComponentTag) {
    const rawSrc = extractFirstAttr(firstImageComponentTag, "src");
    if (rawSrc) {
      const src = resolveHeroImageSrc(essay, rawSrc);
      if (src) {
        return { src, alt: null };
      }
    }
  }

  return null;
};

export const formatEssayDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));

async function fetchEssays(): Promise<Essay[]> {
  essaysSourceError = "";
  const missingKeys = REQUIRED_SOURCE_KEYS.filter((key) => !getEnvValue(key));

  if (missingKeys.length === REQUIRED_SOURCE_KEYS.length) {
    essaysSourceError = "Essays source is not configured.";
    console.warn(`${essaysSourceError} Building the landing site with an empty essays index.`);
    return [];
  }

  if (missingKeys.length > 0) {
    throw new Error(`Missing essays source env vars: ${missingKeys.join(", ")}`);
  }

  const apiBaseUrl = getEnvValue("DRAGONFRUIT_API_BASE_URL")?.replace(/\/+$/, "");
  const workspaceSlug = getEnvValue("DRAGONFRUIT_ESSAYS_WORKSPACE_SLUG");
  const projectId = getEnvValue("DRAGONFRUIT_ESSAYS_PROJECT_ID");
  const url = `${apiBaseUrl}/api/public/workspaces/${workspaceSlug}/projects/${projectId}/pages/`;

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    if (response.status >= 500) {
      essaysSourceError = `Essays source returned ${response.status} ${response.statusText}.`;
      console.warn(`${essaysSourceError} Building the landing site with an empty essays index.`);
      return [];
    }

    throw new Error(`Failed to fetch essays from DragonFruit (${response.status} ${response.statusText})`);
  }

  return response.json();
}

export function getEssays(): Promise<Essay[]> {
  return fetchEssays();
}

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
};

const REQUIRED_SOURCE_KEYS = [
  "DRAGONFRUIT_API_BASE_URL",
  "DRAGONFRUIT_ESSAYS_WORKSPACE_SLUG",
  "DRAGONFRUIT_ESSAYS_PROJECT_ID",
] as const;

let essaysPromise: Promise<Essay[]> | undefined;

export const getEssaySlug = (essay: Essay) => essay.public_slug?.trim() || essay.id;

export const getEssayDescription = (essay: Essay, maxLength = 168) => {
  const text = (essay.description_stripped || "").replace(/\s+/g, " ").trim();
  if (!text) return "An essay from DragonFruit.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
};

export const formatEssayDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));

async function fetchEssays(): Promise<Essay[]> {
  const missingKeys = REQUIRED_SOURCE_KEYS.filter((key) => !process.env[key]);

  if (missingKeys.length === REQUIRED_SOURCE_KEYS.length) {
    console.warn("Essays source is not configured; building the landing site with an empty essays index.");
    return [];
  }

  if (missingKeys.length > 0) {
    throw new Error(`Missing essays source env vars: ${missingKeys.join(", ")}`);
  }

  const apiBaseUrl = process.env.DRAGONFRUIT_API_BASE_URL?.replace(/\/+$/, "");
  const workspaceSlug = process.env.DRAGONFRUIT_ESSAYS_WORKSPACE_SLUG;
  const projectId = process.env.DRAGONFRUIT_ESSAYS_PROJECT_ID;
  const url = `${apiBaseUrl}/api/public/workspaces/${workspaceSlug}/projects/${projectId}/pages/`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch essays from DragonFruit (${response.status} ${response.statusText})`);
  }

  return response.json();
}

export function getEssays(): Promise<Essay[]> {
  essaysPromise ??= fetchEssays();
  return essaysPromise;
}

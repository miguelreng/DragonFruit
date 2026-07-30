import { SPACE_BASE_PATH, SPACE_BASE_URL } from "@plane/constants";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export type TPublicProjectContentType = "calendar" | "project";

type TPublicProjectUrlOptions = {
  currentOrigin?: string;
  spaceBasePath?: string;
  spaceBaseUrl?: string;
};

const isPublicContentOrigin = (value: string) => {
  try {
    return ["dragonfruit.page", "www.dragonfruit.page"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
};

export const buildPublishedProjectUrl = (
  workspaceIdentifier: string,
  anchor: string,
  contentType: TPublicProjectContentType,
  { currentOrigin = "", spaceBasePath = SPACE_BASE_PATH, spaceBaseUrl = SPACE_BASE_URL }: TPublicProjectUrlOptions = {}
) => {
  const baseUrl = spaceBaseUrl.trim() || currentOrigin;
  const usesPublicContentRoutes = isPublicContentOrigin(baseUrl);
  const normalizedBasePath =
    !usesPublicContentRoutes && spaceBasePath ? `/${spaceBasePath.replace(/^\/+|\/+$/g, "")}` : "";
  const publicAppRoot = `${trimTrailingSlash(baseUrl)}${normalizedBasePath}`;

  if (!usesPublicContentRoutes) return `${publicAppRoot}/issues/${encodeURIComponent(anchor)}`;

  return `${publicAppRoot}/${encodeURIComponent(workspaceIdentifier)}/${contentType}/${encodeURIComponent(anchor)}`;
};

export const buildPublishedProjectCalendarUrl = (
  workspaceIdentifier: string,
  anchor: string,
  options: TPublicProjectUrlOptions = {}
) => `${buildPublishedProjectUrl(workspaceIdentifier, anchor, "calendar", options)}?board=calendar`;

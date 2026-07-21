import { LIVE_BASE_PATH, LIVE_BASE_URL } from "@plane/constants";

const DEFAULT_LIVE_BASE_PATH = "/live";

export const buildLiveCollaborationUrl = (params: Record<string, string | number | null | undefined>) => {
  try {
    const configuredUrl = LIVE_BASE_URL?.trim();
    const url = configuredUrl ? new URL(configuredUrl) : new URL(window.location.origin);
    if (!configuredUrl && url.hostname.startsWith("app.")) url.hostname = `live.${url.hostname.slice(4)}`;

    url.protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const basePath = (LIVE_BASE_PATH?.trim() || DEFAULT_LIVE_BASE_PATH).replace(/\/+$/, "");
    url.pathname = `${basePath}/collaboration`;
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });
    return url.toString();
  } catch (error) {
    console.error("Error creating realtime config", error);
    return null;
  }
};

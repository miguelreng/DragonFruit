import { headers } from "xmcp/headers";

const DEFAULT_API_BASE_URL = "http://localhost:8000";

type JsonObject = Record<string, unknown>;

type RequestAuthHeaders = {
  authorization?: string;
  xApiKey?: string;
};

export type DragonfruitRuntimeConfig = {
  apiBaseUrl: string;
  workspaceSlug: string;
  authHeaders: RequestAuthHeaders;
};

function normaliseBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function getHeaderValue(name: string): string | undefined {
  const requestHeaders = headers();
  const value = requestHeaders[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }
  return value?.trim() || undefined;
}

function getEnvValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function resolveAuthHeadersFromRequestOrEnv(): RequestAuthHeaders {
  const authorization = getHeaderValue("authorization") || getEnvValue("DRAGONFRUIT_AUTHORIZATION");
  const xApiKey = getHeaderValue("x-api-key") || getEnvValue("DRAGONFRUIT_API_TOKEN");

  if (!authorization && !xApiKey) {
    throw new Error(
      "Missing auth. Provide request header Authorization or X-Api-Key, or set DRAGONFRUIT_API_TOKEN/DRAGONFRUIT_AUTHORIZATION."
    );
  }

  const authHeaders: RequestAuthHeaders = {};
  if (authorization) {
    authHeaders.authorization = authorization;
  }
  if (xApiKey) {
    authHeaders.xApiKey = xApiKey;
  }

  return authHeaders;
}

export function getRuntimeConfig(): DragonfruitRuntimeConfig {
  const apiBaseUrl = normaliseBaseUrl(
    getHeaderValue("x-dragonfruit-api-base-url") || getEnvValue("DRAGONFRUIT_API_BASE_URL") || DEFAULT_API_BASE_URL
  );

  const workspaceSlug =
    getHeaderValue("x-dragonfruit-workspace-slug") ||
    getEnvValue("DRAGONFRUIT_WORKSPACE_SLUG") ||
    getHeaderValue("x-workspace-slug");

  if (!workspaceSlug) {
    throw new Error(
      "Missing workspace slug. Provide x-dragonfruit-workspace-slug header or set DRAGONFRUIT_WORKSPACE_SLUG."
    );
  }

  return {
    apiBaseUrl,
    workspaceSlug,
    authHeaders: resolveAuthHeadersFromRequestOrEnv(),
  };
}

export async function dragonfruitRequest<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const { apiBaseUrl, authHeaders } = getRuntimeConfig();

  const mergedHeaders = new Headers(options.headers || undefined);
  if (!mergedHeaders.has("Content-Type")) {
    mergedHeaders.set("Content-Type", "application/json");
  }

  if (authHeaders.authorization && !mergedHeaders.has("Authorization")) {
    mergedHeaders.set("Authorization", authHeaders.authorization);
  } else if (authHeaders.xApiKey && !mergedHeaders.has("X-Api-Key")) {
    mergedHeaders.set("X-Api-Key", authHeaders.xApiKey);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: mergedHeaders,
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as JsonObject | JsonObject[] | unknown) : null;

  if (!response.ok) {
    const errorSummary = typeof payload === "object" && payload !== null ? JSON.stringify(payload) : text;
    throw new Error(`Dragon Fruit API ${response.status} on ${path}: ${errorSummary || "Unknown error"}`);
  }

  return payload as T;
}

export function getWorkspacePath(path: string): string {
  const { workspaceSlug } = getRuntimeConfig();
  return `/api/workspaces/${workspaceSlug}${path}`;
}

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  pagination: {
    limit: number;
    offset: number;
    next_offset: number | null;
    has_more: boolean;
  };
};

export function toPaginatedResult<T>(
  payload: unknown,
  options: {
    limit: number;
    offset: number;
  }
): PaginatedResult<T> {
  const { limit, offset } = options;

  if (Array.isArray(payload)) {
    const nextOffset = payload.length >= limit ? offset + limit : null;
    return {
      items: payload as T[],
      total: payload.length,
      pagination: {
        limit,
        offset,
        next_offset: nextOffset,
        has_more: nextOffset !== null,
      },
    };
  }

  if (payload && typeof payload === "object") {
    const objectPayload = payload as Record<string, unknown>;
    const results = objectPayload.results;

    if (Array.isArray(results)) {
      const nextOffset = typeof objectPayload.next === "string" && objectPayload.next ? offset + limit : null;
      const count = typeof objectPayload.count === "number" ? objectPayload.count : results.length;

      return {
        items: results as T[],
        total: count,
        pagination: {
          limit,
          offset,
          next_offset: nextOffset,
          has_more: nextOffset !== null,
        },
      };
    }
  }

  return {
    items: [],
    total: 0,
    pagination: {
      limit,
      offset,
      next_offset: null,
      has_more: false,
    },
  };
}

export function pickIssueSummary(issue: Record<string, unknown>) {
  return {
    id: issue.id,
    sequence_id: issue.sequence_id,
    name: issue.name,
    priority: issue.priority,
    state_id: issue.state_id,
    project_id: issue.project_id,
    assignee_ids: issue.assignee_ids,
    updated_at: issue.updated_at,
    created_at: issue.created_at,
  };
}

export function pickProjectSummary(project: Record<string, unknown>) {
  return {
    id: project.id,
    name: project.name,
    identifier: project.identifier,
    emoji: project.emoji,
    description: project.description,
    is_member: project.is_member,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };
}

export function asPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

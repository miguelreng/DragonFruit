/**
 * Authenticated REST client. Mirrors the Copilot Swift client: every request
 * carries the API token in the `X-Api-Key` header (the backend's
 * APIKeyAuthentication header name). Kept deliberately small — as features land
 * we layer typed helpers on top of `apiFetch`, and pull richer response shapes
 * from `@plane/types`.
 */
import { API_URL } from "./config";
import { getToken } from "./secure-store";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** True when the failure means "your token is no longer valid" — sign the user out. */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("X-Api-Key", token);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // non-JSON error body; leave as null
    }
    let message = `Request failed (${response.status})`;
    if (body && typeof body === "object" && "error" in body) {
      message = String((body as { error: unknown }).error);
    }
    throw new ApiError(response.status, message, body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Some list endpoints return a bare array, others a paginated { results }. */
function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: T[] }).results;
  }
  return [];
}

async function apiList<T>(path: string): Promise<T[]> {
  return unwrapList<T>(await apiFetch<unknown>(path));
}

// ---------------------------------------------------------------------------
// Typed endpoints used by M1. Local shapes for now; widen from @plane/types
// once shared types are wired in M2+.
// ---------------------------------------------------------------------------

export type CurrentUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  avatar_url: string | null;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  total_members: number;
};

export function getCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>("/users/me/");
}

export function getWorkspaces(): Promise<Workspace[]> {
  return apiList<Workspace>("/workspaces/");
}

export type Project = {
  id: string;
  name: string;
  identifier: string;
  description: string;
  network: number; // 0 = private, 2 = public
  members: string[];
  cover_image_url: string | null;
};

export type Cycle = {
  id: string;
  name: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "upcoming" | "active" | "completed" | (string & {});
  total_issues: number;
  completed_issues: number;
};

export function getProjects(workspaceSlug: string): Promise<Project[]> {
  return apiList<Project>(`/workspaces/${workspaceSlug}/projects/`);
}

export function getCycles(workspaceSlug: string, projectId: string): Promise<Cycle[]> {
  return apiList<Cycle>(`/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`);
}

// --- Work items (M3) ---

export type Priority = "urgent" | "high" | "medium" | "low" | "none" | (string & {});

export type IssueListItem = {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string;
  state_id: string | null;
  priority: Priority;
  assignee_ids: string[];
  target_date: string | null;
};

export type IssueDetail = IssueListItem & {
  description_html: string;
};

export type WorkflowState = { id: string; name: string; color: string; group: string };

export type IssueComment = {
  id: string;
  comment_html: string;
  comment_stripped: string;
  created_at: string;
  actor_detail: { id: string; display_name: string; avatar_url: string | null } | null;
};

/** Work items assigned to the given user across the workspace (first page). */
export function getMyIssues(workspaceSlug: string, userId: string): Promise<IssueListItem[]> {
  return apiList<IssueListItem>(`/workspaces/${workspaceSlug}/user-issues/${userId}/?assignees=${userId}`);
}

export function getIssue(workspaceSlug: string, projectId: string, issueId: string): Promise<IssueDetail> {
  return apiFetch<IssueDetail>(`/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`);
}

/** Partial update — only the fields we support editing on mobile. */
export async function updateIssue(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  data: { state_id?: string; assignee_ids?: string[] }
): Promise<void> {
  await apiFetch<unknown>(`/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function getStates(workspaceSlug: string, projectId: string): Promise<WorkflowState[]> {
  return apiList<WorkflowState>(`/workspaces/${workspaceSlug}/projects/${projectId}/states/`);
}

export function getComments(workspaceSlug: string, projectId: string, issueId: string): Promise<IssueComment[]> {
  return apiList<IssueComment>(`/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`);
}

export async function addComment(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  commentHtml: string
): Promise<void> {
  await apiFetch<unknown>(`/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`, {
    method: "POST",
    body: JSON.stringify({ comment_html: commentHtml }),
  });
}

// --- Docs / pages (M4) ---

export type PageType = "doc" | "whiteboard" | (string & {});

export type PageListItem = {
  id: string;
  name: string;
  page_type: PageType;
  project_ids: string[];
  description_snippet: string;
  updated_at: string;
  is_locked: boolean;
  archived_at: string | null;
};

export type PageDetail = {
  id: string;
  name: string;
  page_type: PageType;
  project_ids: string[];
  description_html: string;
  updated_at: string;
};

/** All pages in the workspace (with a plain-text preview snippet). */
export function getPages(workspaceSlug: string): Promise<PageListItem[]> {
  return apiList<PageListItem>(`/workspaces/${workspaceSlug}/pages/`);
}

/** Single page with its rendered HTML body. Pages are fetched project-scoped. */
export function getPage(workspaceSlug: string, projectId: string, pageId: string): Promise<PageDetail> {
  return apiFetch<PageDetail>(`/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/`);
}

// --- Calendar (iOS widget data source) ---

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  all_day: boolean;
  location: string;
  hangout_link: string;
  html_link: string;
  attendee_count: number;
};

/** Upcoming Google Calendar events for the current user (pre-sorted, ≤20).
 *  Returns [] when no calendar account is connected. Workspace-agnostic. */
export async function getUpcomingMeetings(): Promise<CalendarEvent[]> {
  const data = await apiFetch<{ events: CalendarEvent[] }>("/users/me/calendar/upcoming-meetings/");
  return data.events ?? [];
}

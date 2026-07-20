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

const REQUEST_TIMEOUT_MS = 25_000;
const ACTION_REQUEST_TIMEOUT_MS = 90_000;

type ApiFetchInit = RequestInit & { timeoutMs?: number };

/** True when the failure means "your token is no longer valid" — sign the user out.
 *  A 403 means the token is fine but access to this resource is denied; that's
 *  not an auth failure, so it's excluded here. */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...requestInit } = init;
  const token = await getToken();
  const headers = new Headers(requestInit.headers);
  headers.set("Accept", "application/json");
  if (requestInit.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("X-Api-Key", token);

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  requestInit.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...requestInit,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted && !requestInit.signal?.aborted) {
      throw new ApiError(408, "The request timed out. Check your connection and try again.", null);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    requestInit.signal?.removeEventListener("abort", abortFromCaller);
  }

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
  throw new ApiError(500, "DragonFruit returned an unexpected response. Please try again.", data);
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError)
    return "You're offline or DragonFruit couldn't be reached. Check your connection and retry.";
  return fallback;
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
  avatar?: string | null;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  logo?: string | null;
  total_members: number;
};

export function getCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>("/users/me/");
}

export function getWorkspaces(): Promise<Workspace[]> {
  return apiList<Workspace>("/workspaces/");
}

/** Emoji/icon logo shape shared by projects, pages, etc. (mirrors @plane/types TLogoProps). */
export type LogoProps = {
  in_use?: "emoji" | "icon";
  emoji?: { value?: string; url?: string };
  icon?: { name?: string; color?: string; background_color?: string };
};

export type Project = {
  id: string;
  name: string;
  identifier: string;
  description: string;
  network: number; // 0 = private, 2 = public
  members: string[];
  cover_image_url: string | null;
  logo_props: LogoProps | null;
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
  label_ids?: string[];
};

export type Label = { id: string; name: string; color: string | null };

export type IssueDetail = IssueListItem & {
  description_html: string;
};

export type WorkflowState = {
  id: string;
  name: string;
  color: string;
  group: string;
  project_id?: string;
};

export type IssueComment = {
  id: string;
  comment_html: string;
  comment_stripped: string;
  created_at: string;
  actor_detail: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
};

/** Work items assigned to the given user across the workspace (first page). */
export function getMyIssues(workspaceSlug: string, userId: string): Promise<IssueListItem[]> {
  return apiList<IssueListItem>(`/workspaces/${workspaceSlug}/user-issues/${userId}/?assignees=${userId}`);
}

/** All work items in a single project (first page, newest first). The ungrouped
 *  list endpoint returns a flat `{ results: [...] }`, which `apiList` unwraps. */
export function getProjectIssues(workspaceSlug: string, projectId: string): Promise<IssueListItem[]> {
  return apiList<IssueListItem>(`/workspaces/${workspaceSlug}/projects/${projectId}/issues/?order_by=-created_at`);
}

export function getIssue(workspaceSlug: string, projectId: string, issueId: string): Promise<IssueDetail> {
  return apiFetch<IssueDetail>(`/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`);
}

/** Partial update — only the fields we support editing on mobile. */
export async function updateIssue(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  data: { state_id?: string | null; assignee_ids?: string[]; priority?: Priority }
): Promise<void> {
  await apiFetch<unknown>(`/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function getStates(workspaceSlug: string, projectId: string): Promise<WorkflowState[]> {
  return apiList<WorkflowState>(`/workspaces/${workspaceSlug}/projects/${projectId}/states/`);
}

/** Every state across the workspace's joined projects (each carries its project_id + group). */
export function getWorkspaceStates(workspaceSlug: string): Promise<WorkflowState[]> {
  return apiList<WorkflowState>(`/workspaces/${workspaceSlug}/states/`);
}

/** Every label across the workspace's joined projects. */
export function getWorkspaceLabels(workspaceSlug: string): Promise<Label[]> {
  return apiList<Label>(`/workspaces/${workspaceSlug}/labels/`);
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

export type PageType = "doc" | "folder" | "pdf" | "sheet" | "whiteboard" | (string & {});

export type PageListItem = {
  id: string;
  name: string;
  page_type: PageType;
  /** UUID of the parent folder page, or null for root-level pages. */
  parent: string | null;
  project_ids: string[];
  description_snippet: string;
  created_at: string;
  updated_at: string;
  is_locked: boolean;
  archived_at: string | null;
  /** EPageAccess: 0 = PUBLIC (a published wiki), 1 = PRIVATE. */
  access?: number;
};

export type PageDetail = {
  id: string;
  name: string;
  page_type: PageType;
  project_ids: string[];
  description_html: string;
  /** Per-page reader preferences set on web (e.g. `font_style`). */
  view_props?: { font_style?: string } | null;
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

export type MeetingNotesDraft = {
  id: string;
  name: string;
  created: boolean;
  workspace_slug: string;
  url: string;
  calendar_attached: boolean;
};

/** Save a reviewed mobile transcript through the same dedicated meeting-notes
 * pipeline used by the desktop capture flow. */
export function createMeetingNotesDraft(
  workspaceSlug: string,
  notes: string,
  meetingTitle: string
): Promise<MeetingNotesDraft> {
  return apiFetch<MeetingNotesDraft>(`/workspaces/${workspaceSlug}/calendar/meeting-notes/`, {
    method: "POST",
    body: JSON.stringify({ notes, meeting_title: meetingTitle }),
  });
}

// --- Activity summary (home heatmap) ---

export type ActivityRange = "all" | "30d" | "7d";

export type ActivityDailyBucket = {
  date: string; // YYYY-MM-DD
  docs: number;
  work_items: number;
  count: number; // unweighted total — docs + work_items
  score: number; // weighted intensity — drives the heatmap dot shade
};

export type ActivitySummary = {
  range: ActivityRange;
  since: string;
  until: string;
  totals: { items: number; docs: number; work_items: number };
  active_days: number;
  current_streak: number;
  longest_streak: number;
  peak_hour: number | null;
  top_type: "docs" | "work_items";
  action_weights: { docs: number; work_items: number };
  daily_buckets: ActivityDailyBucket[];
  hour_buckets: { hour: number; count: number }[];
};

/** Per-day docs + work-item activity for the workspace, used by the home heatmap. */
export function getActivitySummary(workspaceSlug: string, range: ActivityRange = "all"): Promise<ActivitySummary> {
  return apiFetch<ActivitySummary>(`/workspaces/${workspaceSlug}/activity-summary/?range=${range}`);
}

// ---------------------------------------------------------------------------
// Members — assignee picker for create + edit flows.
// ---------------------------------------------------------------------------

export type UserLite = {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  email?: string;
  avatar_url: string | null;
};

export type WorkspaceMember = { id: string; member: UserLite; role: number };

export function getWorkspaceMembers(workspaceSlug: string): Promise<WorkspaceMember[]> {
  return apiList<WorkspaceMember>(`/workspaces/${workspaceSlug}/members/`);
}

// ---------------------------------------------------------------------------
// Create work item — POST to the project's issues collection. `name` is the
// only required field; the backend defaults state to the project default.
// ---------------------------------------------------------------------------

export function createIssue(
  workspaceSlug: string,
  projectId: string,
  data: {
    name: string;
    priority?: Priority;
    state_id?: string | null;
    assignee_ids?: string[];
  }
): Promise<IssueListItem> {
  return apiFetch<IssueListItem>(`/workspaces/${workspaceSlug}/projects/${projectId}/issues/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// Global search — workspace-wide; we surface issues, docs, and projects.
// ---------------------------------------------------------------------------

export type SearchIssue = {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string;
  project__identifier: string;
  workspace__slug: string;
};
export type SearchPage = {
  id: string;
  name: string;
  project_ids: string[];
  project_identifiers: string[];
  workspace__slug: string;
};
export type SearchProject = {
  id: string;
  name: string;
  identifier: string;
  workspace__slug: string;
};
export type GlobalSearchResults = {
  issue: SearchIssue[];
  page: SearchPage[];
  project: SearchProject[];
};

export async function globalSearch(workspaceSlug: string, query: string): Promise<GlobalSearchResults> {
  const data = await apiFetch<{ results?: Partial<GlobalSearchResults> }>(
    `/workspaces/${workspaceSlug}/search/?search=${encodeURIComponent(query)}&workspace_search=true`
  );
  const r = data.results ?? {};
  return { issue: r.issue ?? [], page: r.page ?? [], project: r.project ?? [] };
}

// ---------------------------------------------------------------------------
// Notifications — the user's workspace inbox.
// ---------------------------------------------------------------------------

export type Notification = {
  id: string;
  title?: string;
  data?: {
    issue?: { name?: string; identifier?: string; sequence_id?: number } | null;
    issue_activity?: { field?: string; verb?: string; actor?: string } | null;
  } | null;
  entity_identifier?: string;
  message_html?: string;
  triggered_by_details?: {
    display_name?: string;
    avatar_url?: string | null;
  } | null;
  read_at: string | null;
  created_at?: string;
  project?: string;
};

export function getNotifications(workspaceSlug: string): Promise<Notification[]> {
  return apiList<Notification>(`/workspaces/${workspaceSlug}/users/notifications/?type=assigned`);
}

export function markNotificationRead(workspaceSlug: string, id: string): Promise<void> {
  return apiFetch<void>(`/workspaces/${workspaceSlug}/users/notifications/${id}/read/`, { method: "POST" });
}

export function markAllNotificationsRead(workspaceSlug: string): Promise<void> {
  return apiFetch<void>(`/workspaces/${workspaceSlug}/users/notifications/mark-all-read/`, {
    method: "POST",
    body: JSON.stringify({ type: "assigned" }),
  });
}

// ---------------------------------------------------------------------------
// Favorites — pinned entities across the workspace.
// ---------------------------------------------------------------------------

export type Favorite = {
  id: string;
  entity_type: string; // "project" | "page" | "issue" | "cycle" | "module" | "view"
  entity_identifier: string | null;
  name: string | null;
  entity_data?: { name?: string } | null;
  project_id?: string | null;
};

export function getFavorites(workspaceSlug: string): Promise<Favorite[]> {
  return apiList<Favorite>(`/workspaces/${workspaceSlug}/user-favorites/?all=true`);
}

// ---------------------------------------------------------------------------
// Stickies — lightweight workspace notes (stored as HTML, edited as text).
// ---------------------------------------------------------------------------

export type Sticky = {
  id: string;
  name?: string;
  description_html?: string;
  background_color?: string | null;
  updated_at?: string;
};

export async function getStickies(workspaceSlug: string): Promise<Sticky[]> {
  return unwrapList<Sticky>(await apiFetch<unknown>(`/workspaces/${workspaceSlug}/stickies/?per_page=50`));
}

export function createSticky(
  workspaceSlug: string,
  data: { name?: string; description_html?: string; background_color?: string }
): Promise<Sticky> {
  return apiFetch<Sticky>(`/workspaces/${workspaceSlug}/stickies/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateSticky(
  workspaceSlug: string,
  id: string,
  data: { name?: string; description_html?: string; background_color?: string }
): Promise<Sticky> {
  return apiFetch<Sticky>(`/workspaces/${workspaceSlug}/stickies/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteSticky(workspaceSlug: string, id: string): Promise<void> {
  return apiFetch<void>(`/workspaces/${workspaceSlug}/stickies/${id}/`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Bookmarks — saved links across the workspace.
// ---------------------------------------------------------------------------

export type BookmarkMetadata = {
  image_url?: string;
  og_image_url?: string;
  image_width?: number;
  image_height?: number;
  site_name?: string;
};

export type Bookmark = {
  id: string;
  title: string;
  url: string;
  description?: string;
  project_id?: string;
  metadata?: BookmarkMetadata;
};

export async function getBookmarks(workspaceSlug: string): Promise<Bookmark[]> {
  return unwrapList<Bookmark>(await apiFetch<unknown>(`/workspaces/${workspaceSlug}/bookmarks/`));
}

/**
 * Resolves the workspace + a default project for saving a bookmark, used to feed
 * the iOS share extension (see lib/share-bookmark.ts). The backend picks the
 * first project the user belongs to as `default_project_id` (null if none).
 */
export type BookmarkExtensionContext = {
  workspace_slug: string;
  default_project_id: string | null;
  projects: { id: string; name: string; identifier: string }[];
};

export function getBookmarkExtensionContext(workspaceSlug: string): Promise<BookmarkExtensionContext> {
  return apiFetch<BookmarkExtensionContext>(`/workspaces/${workspaceSlug}/bookmark-extension/context/`);
}

// ---------------------------------------------------------------------------
// Ask Atlas — agent chat. sendMessage is a plain request/response POST
// (the streaming variant is only used by the web doc-writer, which we omit).
// ---------------------------------------------------------------------------

export type Agent = {
  id: string;
  name: string;
  avatar_url?: string | null;
  is_enabled?: boolean;
  provider_model?: string;
  has_api_key?: boolean;
  has_effective_llm_config?: boolean;
};

export type AgentSession = {
  id: string;
  title: string;
  display_title?: string;
  agent: string;
  agent_name?: string;
  last_activity_at?: string;
  context_project?: string | null;
  context_project_name?: string | null;
  context_page?: string | null;
  context_page_name?: string | null;
  context_updated_at?: string | null;
  context_updated_by_surface?: "web" | "mobile" | "";
};

/** Small persisted marker on a user message — never raw media. A "voice" kind
 *  means the message's `content` is a speech-to-text transcript recorded on
 *  the device; `duration_seconds` is the recording length for the bubble's
 *  "Voice note · mm:ss" header. */
export type AgentMessageAttachment = {
  kind: string;
  duration_seconds?: number;
  name?: string;
  mime_type?: string;
  size?: number;
  data_url?: string;
  text_excerpt?: string;
  text_truncated?: boolean;
  dropped?: boolean;
};

export type AgentMessageAttachmentPayload = {
  name: string;
  mime_type: string;
  content_base64: string;
};

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  error_message?: string;
  attachments?: AgentMessageAttachment[];
};

export type AgentMessageSendOptions = {
  inputMode?: "voice";
  voiceDurationSeconds?: number;
  contextNote?: string;
  attachments?: AgentMessageAttachmentPayload[];
};

export function getAgents(workspaceSlug: string): Promise<Agent[]> {
  return apiList<Agent>(`/workspaces/${workspaceSlug}/agents/`);
}

export async function listAgentSessions(workspaceSlug: string): Promise<AgentSession[]> {
  const data = await apiFetch<{ sessions?: AgentSession[] } | AgentSession[]>(
    `/workspaces/${workspaceSlug}/agent-chats/sessions/?scope_type=personal`
  );
  return Array.isArray(data) ? data : (data.sessions ?? []);
}

export function createAgentSession(workspaceSlug: string, agentId?: string): Promise<AgentSession> {
  return apiFetch<AgentSession>(`/workspaces/${workspaceSlug}/agent-chats/sessions/`, {
    method: "POST",
    body: JSON.stringify({
      scope_type: "personal",
      ...(agentId ? { agent_id: agentId } : {}),
    }),
  });
}

export function getAgentSession(
  workspaceSlug: string,
  sessionId: string
): Promise<{ session: AgentSession; messages: AgentMessage[] }> {
  return apiFetch<{ session: AgentSession; messages: AgentMessage[] }>(
    `/workspaces/${workspaceSlug}/agent-chats/sessions/${sessionId}/`
  );
}

export function updateAgentSessionContext(
  workspaceSlug: string,
  sessionId: string,
  context: { projectId?: string; pageId?: string; surface: "mobile" }
): Promise<AgentSession> {
  return apiFetch<AgentSession>(`/workspaces/${workspaceSlug}/agent-chats/sessions/${sessionId}/`, {
    method: "PATCH",
    body: JSON.stringify({
      context_project_id: context.projectId ?? null,
      context_page_id: context.pageId ?? null,
      context_updated_by_surface: context.surface,
    }),
  });
}

export function sendAgentMessage(
  workspaceSlug: string,
  sessionId: string,
  content: string,
  // Scopes Atlas' answers and tools to a single project; omit for the whole
  // workspace (matches the web Atlas scope selector's `project_id`).
  projectId?: string,
  options?: AgentMessageSendOptions
): Promise<{ user_message: AgentMessage; assistant_message: AgentMessage }> {
  return apiFetch<{
    user_message: AgentMessage;
    assistant_message: AgentMessage;
  }>(`/workspaces/${workspaceSlug}/agent-chats/sessions/${sessionId}/messages/`, {
    method: "POST",
    timeoutMs: ACTION_REQUEST_TIMEOUT_MS,
    body: JSON.stringify({
      content,
      attachments: options?.attachments ?? [],
      tool_mode: "auto",
      ...(projectId ? { project_id: projectId } : {}),
      ...(options?.contextNote ? { context_note: options.contextNote } : {}),
      ...(options?.inputMode
        ? {
            input_mode: options.inputMode,
            voice_duration_seconds: options.voiceDurationSeconds ?? 0,
          }
        : {}),
    }),
  });
}

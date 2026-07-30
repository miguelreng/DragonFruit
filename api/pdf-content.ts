export const config = {
  runtime: "edge",
};

const API_ORIGIN = "https://api.dragonfruit.sh";
const WORKSPACE_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const errorResponse = (message: string, status: number) =>
  Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse("Method not allowed.", 405);
  }

  const requestUrl = new URL(request.url);
  const workspaceSlug = requestUrl.searchParams.get("workspace") ?? "";
  const projectId = requestUrl.searchParams.get("project") ?? "";
  const assetId = requestUrl.searchParams.get("asset") ?? "";

  if (!WORKSPACE_SLUG_PATTERN.test(workspaceSlug) || !UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(assetId)) {
    return errorResponse("Invalid PDF asset reference.", 400);
  }

  const upstreamUrl = new URL(
    `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/${assetId}/`,
    API_ORIGIN
  );
  upstreamUrl.searchParams.set("disposition", "inline");

  const upstreamHeaders = new Headers();
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  const range = request.headers.get("range");
  if (cookie) upstreamHeaders.set("cookie", cookie);
  if (authorization) upstreamHeaders.set("authorization", authorization);
  if (range) upstreamHeaders.set("range", range);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: "follow",
    });
  } catch {
    return errorResponse("The PDF source is temporarily unavailable.", 502);
  }

  if (!upstream.ok || !upstream.body) {
    return errorResponse(
      upstream.status === 401 || upstream.status === 403
        ? "You do not have permission to view this PDF."
        : "The PDF could not be loaded.",
      upstream.status
    );
  }

  const responseHeaders = new Headers({
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": "inline",
    "Content-Type": upstream.headers.get("content-type") ?? "application/pdf",
    "X-Content-Type-Options": "nosniff",
  });
  for (const headerName of ["accept-ranges", "content-length", "content-range"]) {
    const value = upstream.headers.get(headerName);
    if (value) responseHeaders.set(headerName, value);
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

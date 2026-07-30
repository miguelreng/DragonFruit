const API_ORIGIN = "https://api.dragonfruit.sh";
const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-disposition",
  "content-language",
  "content-type",
  "etag",
  "last-modified",
];

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return response.status(405).json({ detail: "Method not allowed." });
  }

  const requestUrl = new URL(request.url, "https://dragonfruit.page");
  const isInstanceRequest = request.query.scope === "instance";
  const pathSegments = Array.isArray(request.query.path) ? request.query.path : [request.query.path];
  const publicPath = pathSegments.filter(Boolean).join("/").replace(/^\/+/, "");

  if (!isInstanceRequest && !publicPath) return response.status(404).json({ detail: "Public resource not found." });

  requestUrl.searchParams.delete("path");
  requestUrl.searchParams.delete("scope");

  const upstreamUrl = new URL(isInstanceRequest ? "/api/instances/" : `/api/public/${publicPath}`, API_ORIGIN);
  upstreamUrl.search = requestUrl.searchParams.toString();

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: {
        accept: request.headers.accept || "*/*",
      },
    });

    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = upstreamResponse.headers.get(header);
      if (value) response.setHeader(header, value);
    }

    response.status(upstreamResponse.status);
    if (request.method === "HEAD") return response.end();

    return response.send(Buffer.from(await upstreamResponse.arrayBuffer()));
  } catch {
    return response.status(502).json({ detail: "Public API is temporarily unavailable." });
  }
}

import {
  fetchPublicPageMetadata,
  injectPublicPageMetadata,
  normalizePublicPageRequest,
} from "../lib/public-page-meta.mjs";

const WEB_ORIGIN = "https://app.dragonfruit.sh";

const queryValue = (value) => (Array.isArray(value) ? value[0] : value);

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return response.status(405).send("Method not allowed.");
  }

  const publicPageRequest = normalizePublicPageRequest({
    pageSlug: queryValue(request.query.pageSlug),
    pageType: queryValue(request.query.pageType),
    workspaceIdentifier: queryValue(request.query.workspaceIdentifier),
  });

  if (!publicPageRequest) return response.status(400).send("Invalid public page URL.");

  const upstreamUrl = new URL(
    `/published/${encodeURIComponent(publicPageRequest.workspaceIdentifier)}/${encodeURIComponent(publicPageRequest.pageSlug)}`,
    WEB_ORIGIN
  );

  try {
    const [metadataResult, upstreamResponse] = await Promise.all([
      fetchPublicPageMetadata(publicPageRequest),
      fetch(upstreamUrl, { headers: { accept: "text/html" } }),
    ]);
    const upstreamHtml = await upstreamResponse.text();
    const html = metadataResult.metadata
      ? injectPublicPageMetadata(upstreamHtml, metadataResult.metadata)
      : upstreamHtml;
    const status = metadataResult.status === 404 ? 404 : upstreamResponse.status;

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader(
      "Cache-Control",
      metadataResult.metadata
        ? "public, s-maxage=60, stale-while-revalidate=300"
        : "public, s-maxage=10, stale-while-revalidate=30"
    );
    response.status(status);
    if (request.method === "HEAD") return response.end();
    return response.send(html);
  } catch {
    return response.status(502).send("Public page is temporarily unavailable.");
  }
}

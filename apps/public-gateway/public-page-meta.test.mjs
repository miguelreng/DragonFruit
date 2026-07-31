import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchPublicPageMetadata,
  htmlToDescription,
  htmlToPlainText,
  injectPublicPageMetadata,
  normalizePublicPageRequest,
} from "./lib/public-page-meta.mjs";

test("validates public route identifiers", () => {
  assert.deepEqual(
    normalizePublicPageRequest({
      pageSlug: "publishing-brief",
      pageType: "doc",
      workspaceIdentifier: "rengi-media",
    }),
    {
      pageSlug: "publishing-brief",
      pageType: "doc",
      workspaceIdentifier: "rengi-media",
    }
  );
  assert.equal(
    normalizePublicPageRequest({ pageSlug: "https://example.com", pageType: "doc", workspaceIdentifier: "rengi" }),
    null
  );
});

test("converts public document HTML into safe plain text", () => {
  assert.equal(
    htmlToPlainText('<h1>Publishing &amp; Media</h1><script>alert("no")</script><p>Plan&nbsp;for August.</p>'),
    "Publishing & Media Plan for August."
  );
});

test("prefers the first meaningful paragraph for the social excerpt", () => {
  assert.equal(
    htmlToDescription("<h2>Objetivo</h2><p></p><p>Mantener un flujo de publicaciones consistente.</p>"),
    "Mantener un flujo de publicaciones consistente."
  );
});

test("uses the project name for Project Brief metadata", async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (String(url).endsWith("/anchor/")) {
      return new Response(JSON.stringify({ project_details: { name: "Publishing" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        description_html: "<p>Publishing plan for August.</p>",
        logo_props: { in_use: "emoji", emoji: { value: "🎬" } },
        name: "Project Brief",
        owned_by: { display_name: "Miguel Reng" },
        page_type: "doc",
        project_id: "1c3912cb-712d-43c5-a6d7-b2d63a8ceb72",
        updated_at: "2026-07-31T12:00:00Z",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const result = await fetchPublicPageMetadata(
    { pageSlug: "publishing-brief", pageType: "doc", workspaceIdentifier: "rengi-media" },
    fetchImpl
  );

  assert.equal(requests.length, 2);
  assert.equal(result.status, 200);
  assert.deepEqual(result.metadata, {
    author: "Miguel Reng",
    canonicalUrl: "https://dragonfruit.page/rengi-media/doc/publishing-brief",
    description: "Publishing plan for August.",
    emoji: "🎬",
    imageUrl:
      "https://dragonfruit.page/api/public-page-image?workspaceIdentifier=rengi-media&pageType=doc&pageSlug=publishing-brief",
    pageSlug: "publishing-brief",
    pageType: "doc",
    title: "Publishing",
    typeLabel: "Brief",
    updatedAt: "2026-07-31T12:00:00Z",
    workspaceIdentifier: "rengi-media",
    workspaceName: "Rengi Media",
  });
});

test("replaces generic app metadata and escapes page-owned values", () => {
  const html = `<!doctype html><html><head>
    <title>DragonFruit</title>
    <meta name="description" content="Generic app">
    <meta property="og:title" content="DragonFruit">
    <meta property="og:image" content="https://app.dragonfruit.sh/og.png">
    <meta name="viewport" content="width=device-width">
  </head><body><div id="root"></div></body></html>`;
  const result = injectPublicPageMetadata(html, {
    canonicalUrl: "https://dragonfruit.page/rengi-media/doc/publishing-brief",
    description: 'Plan with "quotes" & details.',
    imageUrl: "https://dragonfruit.page/api/public-page-image?pageSlug=publishing-brief",
    title: 'Publishing <script>alert("no")</script>',
    updatedAt: "2026-07-31T12:00:00Z",
    workspaceName: "Rengi Media",
  });

  assert.match(result, /<title>Publishing &lt;script&gt;alert\(&quot;no&quot;\)&lt;\/script&gt;<\/title>/);
  assert.match(result, /<meta name="description" content="Plan with &quot;quotes&quot; &amp; details\.">/);
  assert.match(result, /<meta property="og:site_name" content="Rengi Media">/);
  assert.match(result, /<meta name="viewport" content="width=device-width">/);
  assert.doesNotMatch(result, /content="Generic app"/);
  assert.doesNotMatch(result, /app\.dragonfruit\.sh\/og\.png/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8"));
const rewrites = new Map(config.rewrites.map(({ source, destination }) => [source, destination]));

test("proxies the public instance bootstrap through the same origin", () => {
  assert.equal(rewrites.get("/api/instances/"), "/api/public-proxy?scope=instance");
});

test("proxies manifest icons from the web application", () => {
  assert.equal(rewrites.get("/icons/:path*"), "https://app.dragonfruit.sh/icons/:path*");
});

test("does not expose private API namespaces", () => {
  const exposedApiRoutes = [...rewrites.keys()].filter((source) => source.startsWith("/api/"));

  assert.deepEqual(exposedApiRoutes, ["/api/public/(.*)", "/api/instances/"]);
});

test("renders canonical public pages through the metadata gateway", () => {
  assert.equal(
    rewrites.get("/:workspaceIdentifier/doc/:pageSlug"),
    "/api/public-page?workspaceIdentifier=:workspaceIdentifier&pageType=doc&pageSlug=:pageSlug"
  );
  assert.equal(
    rewrites.get("/published/:workspaceIdentifier/:pageSlug"),
    "/api/public-page?workspaceIdentifier=:workspaceIdentifier&pageType=auto&pageSlug=:pageSlug"
  );
});

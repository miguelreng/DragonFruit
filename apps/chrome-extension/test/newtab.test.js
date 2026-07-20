const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const extensionRoot = join(__dirname, "..");
const source = readFileSync(join(extensionRoot, "src", "newtab.js"), "utf8");
const newtabHtml = readFileSync(join(extensionRoot, "src", "newtab.html"), "utf8");
const newtabCss = readFileSync(join(extensionRoot, "src", "newtab.css"), "utf8");
const manifest = JSON.parse(readFileSync(join(extensionRoot, "manifest.json"), "utf8"));

function poolQuery() {
  const match = source.match(/const POOL_QUERY = `([\s\S]*?)`;/);
  assert.ok(match, "new-tab artwork query should exist");
  return match[1];
}

test("new-tab pool includes every painting type instead of one movement", () => {
  const query = poolQuery();

  assert.match(query, /wdt:P31 wd:Q3305213/);
  assert.doesNotMatch(query, /wdt:P135|wd:Q4692/);
  assert.doesNotMatch(source, /ERA_MAX|inEra/);
});

test("existing Renaissance-only caches are invalidated", () => {
  assert.match(source, /const POOL_KEY = "artworkPool"/);
  assert.match(source, /"renaissancePool"/);
  assert.match(source, /"renaissanceSchema"/);
});

test("extension metadata describes the broader artwork pool", () => {
  assert.doesNotMatch(manifest.description, /Renaissance/i);
});

test("new-tab loading uses the web app morphing-infinity spinner", () => {
  assert.match(newtabHtml, /class="logo-spinner-morph"/);
  assert.match(newtabHtml, /dur="1\.8s"/);
  assert.match(newtabHtml, /repeatCount="indefinite"/);
  assert.match(newtabHtml, /M 12 12 C 14 8\.5 19 8\.5 19 12/);
  assert.doesNotMatch(newtabHtml, /s-core|s-ring/);
  assert.match(newtabCss, /\.logo-spinner-static\s*\{\s*display: none;/);
});

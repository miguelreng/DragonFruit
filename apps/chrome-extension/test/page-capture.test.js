const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const extensionRoot = join(__dirname, "..");
const manifest = JSON.parse(readFileSync(join(extensionRoot, "manifest.json"), "utf8"));
const background = readFileSync(join(extensionRoot, "src", "background.js"), "utf8");
const adapters = readFileSync(join(extensionRoot, "src", "capture", "page-adapters.js"), "utf8");

function pageCaptureScript() {
  return manifest.content_scripts.find((entry) => entry.js.includes("src/capture/page-capture.js"));
}

test("page capture is registered on current app.notion.com page URLs", () => {
  const script = pageCaptureScript();

  assert.ok(script, "page-capture content script should be registered");
  assert.ok(script.matches.includes("https://app.notion.com/*"));
  assert.match(background, /PAGE_CAPTURE_HOSTS = \[[\s\S]*"app\.notion\.com"/);
  assert.match(background, /PAGE_CAPTURE_MATCHES = \[[\s\S]*"https:\/\/app\.notion\.com\/\*"/);
  assert.match(adapters, /hosts: \["app\.notion\.com", "notion\.so", "notion\.site"\]/);
});

test("captured-page project changes keep their dedicated move message", () => {
  assert.match(
    background,
    /\["MOVE_CAPTURED_CHAT", "MOVE_CAPTURED_PAGE"\]\.includes\(toastMoveType\)[\s\S]*\? toastMoveType/
  );
  assert.match(background, /message\?\.type === "MOVE_CAPTURED_PAGE"/);
});

test("service-worker diagnostic version matches the manifest", () => {
  const match = background.match(/const EXTENSION_VERSION = "([^"]+)"/);

  assert.ok(match, "background version marker should exist");
  assert.equal(match[1], manifest.version);
});

// @ts-nocheck
//
// Content-script entry for page capture. Runs on the supported document tools
// (see manifest content_scripts), answers the background worker's CAPTURE_PAGE
// request by running the matching page adapter and returning a normalized
// payload the captured-pages API ingests as a doc.
//
// Depends on extract.js (domToCleanHtml) and page-adapters.js (pickPageAdapter),
// loaded before this file in the same content-script world.

function dfBuildPage() {
  const adapter = pickPageAdapter(location.hostname);
  if (!adapter) {
    return { ok: false, error: "This page isn't a supported document." };
  }

  let html = "";
  try {
    html = adapter.extract() || "";
  } catch (error) {
    return { ok: false, error: `Could not read the page: ${error?.message || "unknown error"}` };
  }

  if (!html.trim()) {
    return {
      ok: false,
      error: "No content found on this page. Open a document with content, then try again.",
    };
  }

  const title = (adapter.title?.() || document.title || `${adapter.source} page`).slice(0, 300);

  return {
    ok: true,
    page: {
      source: adapter.source,
      external_id: adapter.externalId?.() || "",
      source_url: location.href,
      title,
      html,
    },
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CAPTURE_PAGE") return false;
  try {
    sendResponse(dfBuildPage());
  } catch (error) {
    sendResponse({ ok: false, error: error?.message || "Capture failed." });
  }
  return false;
});

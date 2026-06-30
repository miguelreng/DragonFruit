// @ts-nocheck
//
// Content-script entry for conversation capture. Runs on the AI chat domains
// (see manifest content_scripts), answers the background worker's
// CAPTURE_CONVERSATION request by running the matching adapter and returning a
// normalized payload the captured-chats API ingests.
//
// Depends on extract.js (domToCleanHtml) and adapters.js (pickChatAdapter),
// which are loaded before this file in the same content-script world.

function dfBuildConversation() {
  const adapter = pickChatAdapter(location.hostname);
  if (!adapter) {
    return { ok: false, error: "This page isn't a supported AI chat." };
  }

  let messages = [];
  try {
    messages = adapter.extract() || [];
  } catch (error) {
    return { ok: false, error: `Could not read the conversation: ${error?.message || "unknown error"}` };
  }

  if (!messages.length) {
    return {
      ok: false,
      error: "No conversation found on this page. Open a chat with messages, then try again.",
    };
  }

  const pageTitle = (document.title || "").replace(/\s*[-–|]\s*(Claude|ChatGPT|Gemini).*$/i, "").trim();
  const title = dfTitleFromMessages(messages, pageTitle || `${adapter.source} conversation`);

  return {
    ok: true,
    conversation: {
      source: adapter.source,
      external_id: adapter.externalId() || "",
      source_url: location.href,
      title,
      messages,
    },
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CAPTURE_CONVERSATION") return false;
  try {
    sendResponse(dfBuildConversation());
  } catch (error) {
    sendResponse({ ok: false, error: error?.message || "Capture failed." });
  }
  return false;
});

// @ts-nocheck
//
// Per-source conversation adapters. Each adapter locates the conversation turns
// for one AI chat site, tags each turn user/assistant, and hands the content
// element to domToCleanHtml (from extract.js).
//
// These selectors track the live sites' DOM and are the most fragile part of
// the capture pipeline — when a site ships a redesign, the fix lives here. Each
// adapter is defensive: multiple selector fallbacks, and capture.js reports a
// friendly "no conversation found" when an adapter returns nothing.
//
// Exposes `pickChatAdapter(host)` on the shared content-script scope.

// Merge several NodeLists into one array ordered by document position, tagging
// each node with its role. Lets us read interleaved user/assistant turns even
// when they match different selectors.
function dfOrderedTurns(groups) {
  const turns = [];
  for (const { role, nodes } of groups) {
    for (const node of nodes) turns.push({ role, node });
  }
  turns.sort((a, b) => {
    if (a.node === b.node) return 0;
    const position = a.node.compareDocumentPosition(b.node);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
  return turns;
}

// contentResolver returns the element(s) holding a turn's real prose. It may
// return a single element or an array (some sites split one turn's response
// across several markdown blocks, interleaved with tool-use/thinking widgets we
// want to drop). Each root is converted and the results concatenated.
function dfMessagesFromTurns(turns, contentResolver) {
  const messages = [];
  for (const { role, node } of turns) {
    const resolved = contentResolver(role, node);
    const roots = Array.isArray(resolved) ? resolved : [resolved || node];
    const html = roots
      .map((el) => domToCleanHtml(el))
      .filter(Boolean)
      .join("");
    if (html) messages.push({ role, html });
  }
  return messages;
}

// Top-level matches of `selector` within `node` (drops nodes nested inside
// another match, so a doubly-classed wrapper isn't extracted twice).
function dfTopLevelMatches(node, selector) {
  const all = [...node.querySelectorAll(selector)];
  return all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
}

function dfLastPathSegment(pathname, afterSegment) {
  const parts = pathname.split("/").filter(Boolean);
  if (afterSegment) {
    const index = parts.indexOf(afterSegment);
    if (index >= 0 && parts[index + 1]) return parts[index + 1];
  }
  return parts.length ? parts[parts.length - 1] : "";
}

function dfTitleFromMessages(messages, fallback) {
  const firstUser = messages.find((message) => message.role === "user");
  const source = firstUser || messages[0];
  if (source) {
    const text = source.html
      .replace(/<[^>]+>/g, " ")
      .replace(/&[^;]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return text.slice(0, 120);
  }
  return fallback;
}

// ---- Claude (claude.ai) -------------------------------------------------------

const claudeAdapter = {
  source: "claude",
  externalId: () => dfLastPathSegment(location.pathname, "chat"),
  extract() {
    const userNodes = document.querySelectorAll('[data-testid="user-message"]');
    // Claude's assistant turn is .font-claude-response (older builds:
    // .font-claude-message). Verified live 2026-06-29.
    const assistantNodes = document.querySelectorAll(
      ".font-claude-response, .font-claude-message, [data-testid='assistant-message']"
    );
    const turns = dfOrderedTurns([
      { role: "user", nodes: userNodes },
      { role: "assistant", nodes: assistantNodes },
    ]);
    return dfMessagesFromTurns(turns, (_role, node) => {
      // Real response prose lives in .standard-markdown blocks; tool-use and
      // "thinking" summary chips are siblings outside them, so selecting these
      // roots drops the chrome and keeps the answer. User turns have none, so
      // we fall back to .prose, then the node's own text.
      const markdown = dfTopLevelMatches(node, ".standard-markdown");
      if (markdown.length) return markdown;
      const prose = node.querySelector(".prose, [class*='prose']");
      return prose ? [prose] : [node];
    });
  },
};

// ---- ChatGPT (chatgpt.com / chat.openai.com) ---------------------------------

const chatgptAdapter = {
  source: "chatgpt",
  externalId: () => dfLastPathSegment(location.pathname, "c"),
  extract() {
    const nodes = document.querySelectorAll("[data-message-author-role]");
    const turns = [];
    for (const node of nodes) {
      const author = node.getAttribute("data-message-author-role");
      const role = author === "user" ? "user" : author === "assistant" ? "assistant" : "";
      if (role) turns.push({ role, node });
    }
    return dfMessagesFromTurns(turns, (role, node) => {
      if (role === "assistant") return node.querySelector(".markdown, .prose") || node;
      // User turns render as plain text in a whitespace-pre-wrap container.
      return node.querySelector(".whitespace-pre-wrap") || node;
    });
  },
};

// ---- Gemini (gemini.google.com) ----------------------------------------------

const geminiAdapter = {
  source: "gemini",
  externalId: () => dfLastPathSegment(location.pathname, "app"),
  extract() {
    // <user-query> and <model-response> are Angular custom elements, one per
    // turn — clean 1:1, no overlap. Verified live 2026-06-29.
    const turns = dfOrderedTurns([
      { role: "user", nodes: document.querySelectorAll("user-query") },
      { role: "assistant", nodes: document.querySelectorAll("model-response") },
    ]);
    return dfMessagesFromTurns(turns, (role, node) => {
      if (role === "user") return [node.querySelector(".query-text") || node];
      return [node.querySelector(".markdown") || node.querySelector("message-content") || node];
    });
  },
};

const DF_ADAPTERS = [
  { hosts: ["claude.ai"], adapter: claudeAdapter },
  { hosts: ["chatgpt.com", "chat.openai.com"], adapter: chatgptAdapter },
  { hosts: ["gemini.google.com"], adapter: geminiAdapter },
];

function pickChatAdapter(host) {
  const normalized = String(host || "").replace(/^www\./, "");
  for (const entry of DF_ADAPTERS) {
    if (entry.hosts.some((candidate) => normalized === candidate || normalized.endsWith(`.${candidate}`))) {
      return entry.adapter;
    }
  }
  return null;
}

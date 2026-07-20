// @ts-nocheck
//
// Per-source page adapters. Where the chat adapters (adapters.js) read a
// user/assistant transcript, these read a whole *document* from a productivity
// tool and emit clean semantic HTML the captured-pages API ingests as a doc.
//
// Like the chat adapters, the selectors here track the live sites' DOM and are
// the fragile part — when a site ships a redesign, the fix lives here. Each
// adapter is defensive (multiple selector fallbacks) and page-capture.js reports
// a friendly "no content found" when an adapter returns nothing.
//
// Depends on extract.js (domToCleanHtml, dfRenderInline, escapeHtml) loaded in
// the same content-script world. Exposes `pickPageAdapter(host)`.

// Top-level matches of `selector` within `root` (drops nodes nested inside
// another match), so a block nested inside another block isn't emitted twice.
function dfPageTopLevel(root, selector) {
  const all = [...root.querySelectorAll(selector)];
  return all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
}

function dfPageInline(el) {
  // dfRenderInline (extract.js) returns escaped inline HTML with marks kept.
  const inline = dfRenderInline(el).trim();
  if (inline) return inline;
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  return text ? escapeHtml(text) : "";
}

// Text of an element, reading .value for form fields (titles in these apps are
// often <textarea>/<input>, whose textContent is stale/empty).
function dfFieldText(el) {
  if (!el) return "";
  const isField = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
  const raw = isField ? el.value : el.textContent;
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
}

// First selector that resolves to a non-empty text/value.
function dfFirstText(selectors) {
  for (const selector of selectors) {
    const text = dfFieldText(document.querySelector(selector));
    if (text) return text;
  }
  return "";
}

// First element (across the selector list) that actually contains text — skips
// empty editor mirrors / comment composers that share the description's class.
function dfFirstContentEl(selectors) {
  for (const selector of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      if ((el.textContent || "").trim()) return el;
    }
  }
  return null;
}

function dfLastPathSegment(pathname) {
  const segments = String(pathname || "").split("/");
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index]) return segments[index];
  }
  return "";
}

// document.title minus a trailing " - App" / " | App" style suffix.
function dfCleanDocTitle(suffix) {
  let title = (document.title || "").replace(/\s+/g, " ").trim();
  if (suffix) title = title.replace(suffix, "").trim();
  return title;
}

// Shared shape for tools whose description is rendered as real semantic HTML
// (ProseMirror / Quill / Atlassian renderer): find the title, find the first
// non-empty description container, and let domToCleanHtml do the conversion.
function dfRichDocAdapter({ source, externalId, titleSelectors, titleSuffix, bodySelectors }) {
  return {
    source,
    externalId,
    title() {
      return dfFirstText(titleSelectors) || dfCleanDocTitle(titleSuffix);
    },
    extract() {
      const el = dfFirstContentEl(bodySelectors);
      return el ? domToCleanHtml(el) : "";
    },
  };
}

// ---- Notion (app.notion.com / notion.so / notion.site) -----------------------

// A page's blocks each carry data-block-id; the block *type* is on the class
// list (notion-header-block, notion-bulleted_list-block, …). We read only each
// block's own text leaf so nested child blocks aren't double-counted, map the
// block type to a semantic tag, and group runs of list items into one list.
const notionAdapter = {
  source: "notion",

  externalId() {
    // Notion URLs end in a 32-hex id (dashless), optionally after a slug:
    // /Workspace/Page-Title-<id> or /<id>?v=…. Fall back to the last segment.
    const segment = dfLastPathSegment(location.pathname);
    const hex = segment.match(/([0-9a-f]{32})/i);
    if (hex) return hex[1];
    const uuid = segment.match(/([0-9a-f-]{36})/i);
    return uuid ? uuid[1] : segment;
  },

  title() {
    const explicit = document.querySelector(
      '.notion-page-block [placeholder="Untitled"], [data-content-editable-leaf][placeholder]'
    );
    const fromDom = (explicit?.textContent || "").replace(/\s+/g, " ").trim();
    if (fromDom) return fromDom;
    return (document.title || "").replace(/\s+/g, " ").trim();
  },

  extract() {
    const content =
      document.querySelector(".notion-page-content") ||
      document.querySelector('[role="main"]') ||
      document.querySelector("main") ||
      document.body;
    if (!content) return "";

    const blocks = dfPageTopLevel(content, "[data-block-id]");
    if (!blocks.length) {
      // Unusual DOM (or a redesign): fall back to the whole content subtree.
      return domToCleanHtml(content);
    }

    const parts = [];
    let listTag = null; // "ul" | "ol" while grouping consecutive list items
    let listItems = "";

    const flushList = () => {
      if (listTag && listItems) parts.push(`<${listTag}>${listItems}</${listTag}>`);
      listTag = null;
      listItems = "";
    };

    for (const block of blocks) {
      const cls = block.className || "";
      // The block's own text lives in the first editable leaf; querying it (not
      // descending into child blocks) keeps nested content out of this block.
      const leaf =
        block.querySelector('[data-content-editable-leaf="true"]') || block.querySelector(".notranslate") || block;

      const isBulleted = cls.includes("notion-bulleted_list-block") || cls.includes("notion-to_do-block");
      const isNumbered = cls.includes("notion-numbered_list-block");

      if (isBulleted || isNumbered) {
        const wantTag = isNumbered ? "ol" : "ul";
        if (listTag && listTag !== wantTag) flushList();
        listTag = wantTag;
        const inner = dfPageInline(leaf);
        if (inner) listItems += `<li>${inner}</li>`;
        continue;
      }

      flushList();

      if (cls.includes("notion-divider-block")) {
        parts.push("<hr />");
        continue;
      }
      if (cls.includes("notion-code-block")) {
        const code = (leaf.textContent || "").replace(/\n$/, "");
        if (code.trim()) parts.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
        continue;
      }
      if (cls.includes("notion-quote-block") || cls.includes("notion-callout-block")) {
        const inner = dfPageInline(leaf);
        if (inner) parts.push(`<blockquote><p>${inner}</p></blockquote>`);
        continue;
      }
      if (cls.includes("notion-header-block")) {
        const inner = dfPageInline(leaf);
        if (inner) parts.push(`<h3>${inner}</h3>`);
        continue;
      }
      if (cls.includes("notion-sub_header-block") || cls.includes("notion-sub_sub_header-block")) {
        const inner = dfPageInline(leaf);
        if (inner) parts.push(`<h4>${inner}</h4>`);
        continue;
      }

      // Default: a text/paragraph block (also toggles, which contribute their
      // summary line here; their nested children are captured as sibling blocks).
      const inner = dfPageInline(leaf);
      if (inner) parts.push(`<p>${inner}</p>`);
    }
    flushList();

    return parts.join("");
  },
};

// ---- Linear (linear.app) -----------------------------------------------------
// Issues and Documents both render their body in a ProseMirror editor.
const linearAdapter = dfRichDocAdapter({
  source: "linear",
  externalId() {
    const issue = location.pathname.match(/\/issue\/([A-Za-z0-9]+-\d+)/);
    if (issue) return issue[1].toUpperCase();
    const doc = location.pathname.match(/\/document\/([^/]+)/);
    if (doc) return doc[1];
    return dfLastPathSegment(location.pathname);
  },
  titleSelectors: ['[data-testid="issue-title"]', "header h1", "h1", 'textarea[placeholder="Issue title"]'],
  titleSuffix: /\s*[|·–-]\s*Linear.*$/i,
  bodySelectors: ['[data-testid="issue-description"] .ProseMirror', ".ProseMirror", '[contenteditable="true"]'],
});

// ---- Asana (app.asana.com) ---------------------------------------------------
// Task detail: name in a textarea, notes in a ProseMirror rich-text field.
const asanaAdapter = dfRichDocAdapter({
  source: "asana",
  externalId() {
    // /0/<project>/<taskId>/f  or  /1/<ws>/project/<p>/task/<taskId>
    const nums = location.pathname.split("/").filter((part) => /^\d{6,}$/.test(part));
    return nums.length ? nums[nums.length - 1] : dfLastPathSegment(location.pathname);
  },
  titleSelectors: [
    '[data-testid="task-name"]',
    ".TaskName textarea",
    ".TaskName-input",
    "textarea.SimpleTextarea--taskName",
  ],
  titleSuffix: /\s*[-·|]\s*Asana.*$/i,
  bodySelectors: [".TaskDescription .ProseMirror", ".ProseMirror", '[data-testid="task-description"]'],
});

// ---- Jira (*.atlassian.net) --------------------------------------------------
// Issue view: summary heading + an Atlassian-renderer description.
const jiraAdapter = dfRichDocAdapter({
  source: "jira",
  externalId() {
    const browse = location.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    if (browse) return browse[1].toUpperCase();
    const selected = new URLSearchParams(location.search).get("selectedIssue");
    return selected || dfLastPathSegment(location.pathname);
  },
  titleSelectors: [
    '[data-testid="issue.views.issue-base.foundation.summary.heading"]',
    'h1[data-testid*="summary"]',
    "h1",
  ],
  titleSuffix: /\s*[-·|]\s*Jira.*$/i,
  bodySelectors: [
    '[data-testid="issue.views.field.rich-text.description"] .ak-renderer-document',
    '[data-testid="issue.views.field.rich-text.description"]',
    ".ak-renderer-document",
    ".ProseMirror",
  ],
});

// ---- ClickUp (app.clickup.com) -----------------------------------------------
// Task view: name in a textarea, description in a Quill (.ql-editor) field.
const clickupAdapter = dfRichDocAdapter({
  source: "clickup",
  externalId() {
    const task = location.pathname.match(/\/t\/([A-Za-z0-9]+)/);
    return task ? task[1] : dfLastPathSegment(location.pathname);
  },
  titleSelectors: [
    '[data-test="task-title__title-overlay"]',
    ".task-name textarea",
    ".cu-task-title textarea",
    "textarea.ng-task-name",
  ],
  titleSuffix: /\s*[-·|]\s*ClickUp.*$/i,
  bodySelectors: ['[data-test="task-description"] .ql-editor', ".ql-editor", ".ProseMirror"],
});

const DF_PAGE_ADAPTERS = [
  { hosts: ["app.notion.com", "notion.so", "notion.site"], adapter: notionAdapter },
  { hosts: ["linear.app"], adapter: linearAdapter },
  { hosts: ["asana.com"], adapter: asanaAdapter },
  { hosts: ["atlassian.net"], adapter: jiraAdapter },
  { hosts: ["clickup.com"], adapter: clickupAdapter },
];

// oxlint-disable-next-line no-unused-vars -- Called by page-capture.js in the shared content-script scope.
function pickPageAdapter(host) {
  const normalized = String(host || "").replace(/^www\./, "");
  for (const entry of DF_PAGE_ADAPTERS) {
    if (entry.hosts.some((candidate) => normalized === candidate || normalized.endsWith(`.${candidate}`))) {
      return entry.adapter;
    }
  }
  return null;
}

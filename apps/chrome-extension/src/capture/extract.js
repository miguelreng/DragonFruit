// @ts-nocheck
//
// Shared DOM -> clean semantic HTML converter for captured AI conversations.
//
// AI chat sites render markdown into deeply nested, class-heavy DOM trees. The
// DragonFruit doc editor only wants a small semantic subset (p, headings, lists,
// pre/code, blockquote, inline marks, links). This walker unwraps everything
// else and keeps only that subset, so a captured turn renders cleanly in the
// editor. The API sanitizes again server-side — this is about fidelity, not
// security.
//
// Loaded as a content script before adapters.js / capture.js; exposes
// `domToCleanHtml` and `escapeHtml` on the shared content-script scope.

const DF_BLOCK_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE"]);
const DF_LIST_TAGS = new Set(["UL", "OL"]);
const DF_HEADING_DOWNSHIFT = { H1: "h3", H2: "h3", H3: "h3", H4: "h4", H5: "h5", H6: "h6" };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

function dfCollapseWhitespace(text) {
  return String(text ?? "").replace(/\s+/g, " ");
}

// Screen-reader-only labels (e.g. Gemini's "You said" / ChatGPT's "ChatGPT
// said:") are visually hidden but live in the DOM. Skip them so they don't leak
// into the captured transcript. Class-based only — we deliberately do NOT skip
// aria-hidden, since syntax-highlight spans inside code blocks use it.
const DF_HIDDEN_CLASSES = ["cdk-visually-hidden", "sr-only", "visually-hidden", "screen-reader-only"];
function dfIsHidden(node) {
  const list = node.classList;
  if (!list) return false;
  return DF_HIDDEN_CLASSES.some((cls) => list.contains(cls));
}

// Inline formatting inside a block: returns escaped HTML with a handful of marks
// preserved. Recurses so nested spans/divs are unwrapped to their text.
function dfRenderInline(node) {
  let out = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += escapeHtml(dfCollapseWhitespace(child.textContent));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    if (dfIsHidden(child)) continue;

    const tag = child.tagName;
    if (tag === "BR") {
      out += "<br />";
    } else if (tag === "STRONG" || tag === "B") {
      out += `<strong>${dfRenderInline(child)}</strong>`;
    } else if (tag === "EM" || tag === "I") {
      out += `<em>${dfRenderInline(child)}</em>`;
    } else if (tag === "CODE") {
      out += `<code>${escapeHtml(child.textContent)}</code>`;
    } else if (tag === "A") {
      const href = child.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href)) {
        out += `<a href="${escapeHtml(href)}">${dfRenderInline(child)}</a>`;
      } else {
        out += dfRenderInline(child);
      }
    } else if (tag === "S" || tag === "DEL" || tag === "STRIKE") {
      out += `<s>${dfRenderInline(child)}</s>`;
    } else {
      // span, mark, sub, sup, unknown inline wrappers -> unwrap.
      out += dfRenderInline(child);
    }
  }
  return out;
}

function dfRenderCodeBlock(preEl) {
  // The actual text lives in the descendant <code>, or the <pre> itself.
  const codeEl = preEl.querySelector("code");
  const text = (codeEl || preEl).textContent || "";
  const langClass = (codeEl || preEl).getAttribute?.("class") || "";
  const langMatch = langClass.match(/language-([\w+-]+)/i);
  const langAttr = langMatch ? ` language="${escapeHtml(langMatch[1])}"` : "";
  return `<pre${langAttr}><code>${escapeHtml(text.replace(/\n$/, ""))}</code></pre>`;
}

function dfRenderList(listEl) {
  const tag = listEl.tagName === "OL" ? "ol" : "ul";
  let items = "";
  for (const li of listEl.children) {
    if (li.tagName !== "LI") continue;
    items += `<li>${dfRenderBlocks(li).trim() || dfRenderInline(li)}</li>`;
  }
  return items ? `<${tag}>${items}</${tag}>` : "";
}

// Walks a container and emits a sequence of block-level elements. Unknown
// wrappers (div/section/article) are descended into so their block children
// surface; loose inline content is gathered into a <p>.
function dfRenderBlocks(root) {
  let out = "";
  let inlineBuffer = "";

  const flushInline = () => {
    const trimmed = inlineBuffer.trim();
    if (trimmed) out += `<p>${trimmed}</p>`;
    inlineBuffer = "";
  };

  for (const child of root.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = dfCollapseWhitespace(child.textContent);
      if (text.trim()) inlineBuffer += escapeHtml(text);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    if (dfIsHidden(child)) continue;

    const tag = child.tagName;
    if (tag === "PRE") {
      flushInline();
      out += dfRenderCodeBlock(child);
    } else if (DF_LIST_TAGS.has(tag)) {
      flushInline();
      out += dfRenderList(child);
    } else if (DF_BLOCK_TAGS.has(tag)) {
      flushInline();
      const inner = dfRenderInline(child).trim();
      if (!inner) continue;
      if (tag === "BLOCKQUOTE") {
        out += `<blockquote><p>${inner}</p></blockquote>`;
      } else if (tag === "P") {
        out += `<p>${inner}</p>`;
      } else {
        out += `<${DF_HEADING_DOWNSHIFT[tag]}>${inner}</${DF_HEADING_DOWNSHIFT[tag]}>`;
      }
    } else if (tag === "HR") {
      flushInline();
      out += "<hr />";
    } else if (tag === "TABLE") {
      flushInline();
      out += dfRenderInline(child).trim() ? `<p>${dfRenderInline(child).trim()}</p>` : "";
    } else if (tag === "BR") {
      inlineBuffer += "<br />";
    } else if (["STRONG", "B", "EM", "I", "CODE", "A", "SPAN", "MARK", "S", "DEL"].includes(tag)) {
      // Inline element sitting directly in the container — buffer it.
      inlineBuffer += dfRenderInline(child.parentNode === root ? wrapNode(child) : child);
    } else {
      // div / section / article / unknown wrapper: descend for nested blocks.
      flushInline();
      out += dfRenderBlocks(child);
    }
  }
  flushInline();
  return out;
}

// Wrap a single inline node so dfRenderInline sees it as a child.
function wrapNode(node) {
  const span = document.createElement("span");
  span.append(node.cloneNode(true));
  return span;
}

// Public: convert a message content element into clean editor HTML.
function domToCleanHtml(rootEl) {
  if (!rootEl) return "";
  const html = dfRenderBlocks(rootEl).trim();
  if (html) return html;
  // Fallback: nothing matched (unusual DOM) — keep the plain text.
  const text = (rootEl.textContent || "").trim();
  return text ? `<p>${escapeHtml(dfCollapseWhitespace(text))}</p>` : "";
}

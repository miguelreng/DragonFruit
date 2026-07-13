#!/usr/bin/env python3
"""Build docs/ux/index.html — a self-contained, brand-styled reader for the strategy/UX docs.

Regenerate after editing any of the markdown files:
    python3 docs/ux/build-reader.py

The markdown is embedded raw and rendered client-side, so the HTML needs no server
and no dependencies. Fonts are inlined from the landing's font files.
"""

import base64
import json
import pathlib

HERE = pathlib.Path(__file__).parent
REPO = HERE.parent.parent

DOCS = [
    ("sot", "Source of Truth", REPO / "DRAGONFRUIT_SOURCE_OF_TRUTH.md"),
    ("icp", "01 · ICP Profiles", HERE / "01-icp-profiles.md"),
    ("story", "02 · Brand Story", HERE / "02-brand-story.md"),
    ("landing", "03 · Landing UX Spec", HERE / "03-landing-ux-spec.md"),
    ("interviews", "04 · Interview Scripts", HERE / "04-icp-interview-scripts.md"),
]

FONT_DIR = REPO / "apps" / "landing" / "public" / "fonts"


def b64(path: pathlib.Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


docs_payload = [
    {
        "id": doc_id,
        "title": title,
        "file": path.name,
        "md": path.read_text(encoding="utf-8"),
    }
    for doc_id, title, path in DOCS
]

page = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DragonFruit — Strategy &amp; UX Docs</title>
<style>
  @font-face { font-family: "Sorts Mill Goudy"; src: url(data:font/ttf;base64,__SMG__) format("truetype"); font-weight: 400; font-style: normal; font-display: swap; }
  @font-face { font-family: "Sorts Mill Goudy"; src: url(data:font/ttf;base64,__SMGI__) format("truetype"); font-weight: 400; font-style: italic; font-display: swap; }
  @font-face { font-family: "Figtree"; src: url(data:font/woff2;base64,__FIG__) format("woff2"); font-weight: 300 900; font-display: swap; }

  :root {
    --canvas: #f7f8f3; --paper: #fffef9; --ink: #171914; --muted: #667064; --quiet: #8b9288;
    --line: rgba(23, 25, 20, 0.12); --line-strong: rgba(23, 25, 20, 0.22);
    --accent: #b30f78; --green: #486c4a; --code-bg: rgba(23, 25, 20, 0.055);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --canvas: #14160f; --paper: #1c1f17; --ink: #eceade; --muted: #a8b0a2; --quiet: #7f877b;
      --line: rgba(242, 241, 232, 0.13); --line-strong: rgba(242, 241, 232, 0.26);
      --accent: #e4519f; --green: #93b894; --code-bg: rgba(242, 241, 232, 0.08);
    }
  }

  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  body {
    margin: 0;
    background: var(--canvas);
    color: var(--ink);
    font-family: "Figtree", ui-sans-serif, system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.6;
  }

  .shell { display: grid; grid-template-columns: 268px minmax(0, 1fr); min-height: 100vh; }

  aside {
    position: sticky; top: 0; align-self: start;
    display: flex; flex-direction: column; gap: 18px;
    height: 100vh; overflow-y: auto;
    padding: 26px 20px 30px;
    border-right: 1px solid var(--line);
  }
  .brand { display: flex; align-items: baseline; gap: 8px; }
  .brand strong { font-family: "Sorts Mill Goudy", Georgia, serif; font-size: 21px; font-weight: 400; }
  .brand span { color: var(--quiet); font-size: 11px; font-weight: 650; letter-spacing: 0.07em; text-transform: uppercase; }

  nav.docs { display: grid; gap: 4px; }
  nav.docs button {
    display: block; width: 100%;
    padding: 8px 10px;
    border: 1px solid transparent; border-radius: 8px;
    background: none; color: var(--muted);
    font: 600 13px/1.3 "Figtree", sans-serif;
    text-align: left; cursor: pointer;
  }
  nav.docs button:hover { color: var(--ink); border-color: var(--line); }
  nav.docs button.active { border-color: var(--line); background: var(--paper); color: var(--ink); }
  nav.docs button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .toc { display: grid; gap: 2px; padding-top: 14px; border-top: 1px solid var(--line); }
  .toc-label { margin-bottom: 6px; color: var(--quiet); font-size: 10px; font-weight: 750; letter-spacing: 0.09em; text-transform: uppercase; }
  .toc a { padding: 3px 10px; border-radius: 6px; color: var(--muted); font-size: 12px; text-decoration: none; }
  .toc a:hover { color: var(--ink); background: var(--paper); }

  main { min-width: 0; padding: clamp(24px, 4vw, 56px) clamp(20px, 5vw, 72px) 90px; }
  .doc { width: min(100%, 820px); }
  .doc-file { color: var(--quiet); font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em; }

  .doc h1 { margin: 6px 0 18px; font-family: "Sorts Mill Goudy", Georgia, serif; font-size: clamp(30px, 4.2vw, 42px); font-weight: 400; line-height: 1.1; text-wrap: balance; }
  .doc h2 { margin: 40px 0 12px; padding-top: 22px; border-top: 1px solid var(--line); font-family: "Sorts Mill Goudy", Georgia, serif; font-size: 26px; font-weight: 400; line-height: 1.15; }
  .doc h3 { margin: 26px 0 8px; font-size: 15.5px; font-weight: 700; }
  .doc p { margin: 0 0 12px; color: var(--muted); }
  .doc p strong, .doc li strong { color: var(--ink); }
  .doc a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
  .doc blockquote { margin: 0 0 14px; padding: 10px 16px; border-left: 3px solid var(--green); border-radius: 0 8px 8px 0; background: var(--paper); }
  .doc blockquote p { margin: 0 0 4px; color: var(--muted); font-size: 13.5px; }
  .doc blockquote p:last-child { margin-bottom: 0; }
  .doc ul, .doc ol { margin: 0 0 14px; padding-left: 22px; color: var(--muted); }
  .doc li { margin: 3px 0; }
  .doc li input[type="checkbox"] { accent-color: var(--accent); margin-right: 6px; }
  .doc hr { margin: 30px 0; border: 0; border-top: 1px solid var(--line); }
  .doc code { padding: 1px 5px; border-radius: 5px; background: var(--code-bg); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.86em; }

  .table-wrap { margin: 0 0 16px; overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }
  .doc table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .doc th { padding: 9px 12px; border-bottom: 1px solid var(--line-strong); color: var(--ink); font-weight: 700; text-align: left; white-space: nowrap; }
  .doc td { padding: 8px 12px; border-bottom: 1px solid var(--line); color: var(--muted); vertical-align: top; }
  .doc tr:last-child td { border-bottom: 0; }

  .mobilebar { display: none; }

  @media (max-width: 900px) {
    .shell { grid-template-columns: 1fr; }
    aside { display: none; }
    .mobilebar {
      position: sticky; top: 0; z-index: 5;
      display: flex; gap: 6px; overflow-x: auto;
      padding: 10px 14px;
      border-bottom: 1px solid var(--line);
      background: color-mix(in oklab, var(--canvas) 88%, transparent);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    }
    .mobilebar button {
      flex: 0 0 auto;
      padding: 6px 11px;
      border: 1px solid var(--line); border-radius: 999px;
      background: var(--paper); color: var(--muted);
      font: 600 12px "Figtree", sans-serif; cursor: pointer;
      white-space: nowrap;
    }
    .mobilebar button.active { border-color: var(--line-strong); color: var(--ink); }
  }

  @media print {
    aside, .mobilebar { display: none; }
    .shell { grid-template-columns: 1fr; }
    body { background: #fff; }
    .doc h2 { break-after: avoid; }
    .table-wrap { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="shell">
  <aside>
    <div class="brand"><strong>DragonFruit</strong><span>Strategy &amp; UX</span></div>
    <nav class="docs" id="docnav" aria-label="Documents"></nav>
    <div class="toc" id="toc"></div>
  </aside>
  <div>
    <div class="mobilebar" id="mobilebar"></div>
    <main><article class="doc" id="doc"></article></main>
  </div>
</div>

<script id="docs-data" type="application/json">__DOCS_JSON__</script>
<script>
(() => {
  const DOCS = JSON.parse(document.getElementById("docs-data").textContent);

  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, (_, c) => "<code>" + c + "</code>");
    s = s.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, (_, text, href) => {
      const mdDoc = DOCS.find((d) => href === d.file || href.endsWith("/" + d.file));
      if (mdDoc) return '<a href="#" data-doc="' + mdDoc.id + '">' + text + "</a>";
      if (/^https?:/.test(href)) return '<a href="' + href + '" target="_blank" rel="noreferrer noopener">' + text + "</a>";
      return "<span>" + text + "</span> <code>" + href + "</code>";
    });
    s = s.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\\s(>·—])\\*([^*\\n]+)\\*(?=[\\s).,;:!?·—]|$)/g, "$1<em>$2</em>");
    return s;
  }

  function render(md) {
    const lines = md.split("\\n");
    const out = [];
    const heads = [];
    let i = 0, list = null, quote = false, hid = 0;

    const closeList = () => { if (list) { out.push("</" + list + ">"); list = null; } };
    const closeQuote = () => { if (quote) { out.push("</blockquote>"); quote = false; } };

    while (i < lines.length) {
      const line = lines[i];

      if (/^\\s*$/.test(line)) { closeList(); closeQuote(); i++; continue; }

      const h = line.match(/^(#{1,4})\\s+(.*)$/);
      if (h) {
        closeList(); closeQuote();
        const level = h[1].length;
        const id = "h" + (++hid);
        out.push("<h" + level + ' id="' + id + '">' + inline(h[2]) + "</h" + level + ">");
        if (level === 2) heads.push({ id, text: h[2].replace(/[*`]/g, "") });
        i++; continue;
      }

      if (/^---+\\s*$/.test(line)) { closeList(); closeQuote(); out.push("<hr />"); i++; continue; }

      if (/^>\\s?/.test(line)) {
        closeList();
        if (!quote) { out.push("<blockquote>"); quote = true; }
        const content = line.replace(/^>\\s?/, "");
        out.push(content.trim() ? "<p>" + inline(content) + "</p>" : "");
        i++; continue;
      }
      closeQuote();

      if (line.includes("|") && /^\\s*\\|/.test(line) && i + 1 < lines.length && /^\\s*\\|[\\s:|-]+\\|\\s*$/.test(lines[i + 1])) {
        closeList();
        const cells = (row) => row.trim().replace(/^\\||\\|$/g, "").split("|").map((c) => inline(c.trim()));
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\\s*\\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
        out.push('<div class="table-wrap"><table><thead><tr>' + head.map((c) => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>" +
          rows.map((r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>");
        continue;
      }

      const cb = line.match(/^\\s*[-*]\\s+\\[( |x)\\]\\s+(.*)$/i);
      if (cb) {
        if (list !== "ul") { closeList(); out.push('<ul style="list-style:none;padding-left:6px">'); list = "ul"; }
        out.push('<li><input type="checkbox" disabled' + (cb[1].toLowerCase() === "x" ? " checked" : "") + " />" + inline(cb[2]) + "</li>");
        i++; continue;
      }
      const ul = line.match(/^\\s*[-*]\\s+(.*)$/);
      if (ul) {
        if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
        out.push("<li>" + inline(ul[1]) + "</li>");
        i++; continue;
      }
      const ol = line.match(/^\\s*\\d+\\.\\s+(.*)$/);
      if (ol) {
        if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
        out.push("<li>" + inline(ol[1]) + "</li>");
        i++; continue;
      }

      closeList();
      out.push("<p>" + inline(line) + "</p>");
      i++;
    }
    closeList(); closeQuote();
    return { html: out.join("\\n"), heads };
  }

  const docEl = document.getElementById("doc");
  const nav = document.getElementById("docnav");
  const mob = document.getElementById("mobilebar");
  const tocEl = document.getElementById("toc");
  let current = null;

  function show(id, push) {
    const d = DOCS.find((x) => x.id === id) || DOCS[0];
    current = d.id;
    const { html, heads } = render(d.md);
    docEl.innerHTML = '<div class="doc-file">' + d.file + "</div>" + html;
    tocEl.innerHTML = '<div class="toc-label">On this page</div>' +
      heads.map((h) => '<a href="#' + h.id + '">' + esc(h.text) + "</a>").join("");
    document.querySelectorAll("[data-nav]").forEach((b) => b.classList.toggle("active", b.dataset.nav === d.id));
    docEl.querySelectorAll("a[data-doc]").forEach((a) =>
      a.addEventListener("click", (e) => { e.preventDefault(); show(a.dataset.doc, true); }));
    window.scrollTo(0, 0);
    if (push) history.replaceState(null, "", "#" + d.id);
    document.title = "DragonFruit — " + d.title;
  }

  for (const target of [nav, mob]) {
    for (const d of DOCS) {
      const b = document.createElement("button");
      b.textContent = d.title;
      b.dataset.nav = d.id;
      b.addEventListener("click", () => show(d.id, true));
      target.appendChild(b);
    }
  }

  show((location.hash || "").slice(1) || DOCS[0].id, false);
})();
</script>
</body>
</html>
"""

page = page.replace("__SMG__", b64(FONT_DIR / "SortsMillGoudy-Regular.ttf"))
page = page.replace("__SMGI__", b64(FONT_DIR / "SortsMillGoudy-Italic.ttf"))
page = page.replace("__FIG__", b64(FONT_DIR / "Figtree-Variable.woff2"))
page = page.replace("__DOCS_JSON__", json.dumps(docs_payload).replace("</", "<\\/"))

out = HERE / "index.html"
out.write_text(page, encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB, {len(docs_payload)} docs)")

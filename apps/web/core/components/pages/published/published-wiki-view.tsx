/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { cn } from "@plane/utils";
import {
  addPublicDocHeadingIds,
  getPublicDocHeadings,
  PublicDocContent,
  transformPublicDocMentions,
} from "@/components/pages/published/public-doc-content";
import { DEFAULT_WIKI_ACCENT, getWikiViewProps, WIKI_ACCENTS } from "@/helpers/wiki-appearance";
import type { TPublicPageResponse, TPublicWikiDoc } from "@/services/page/public-page.service";

/**
 * Public reader for a published wiki (a folder page + its public child docs).
 * Design mirrors docs/ux/build-reader.py: fixed doc-nav sidebar with an
 * "On this page" outline, serif display headings, paper/canvas palette with
 * an accent picked in the wiki settings, mobile pill bar, print-friendly.
 */

type Props = {
  data: TPublicPageResponse;
};

const docAnchorId = (doc: TPublicWikiDoc) => doc.id.split("-")[0];

const scrollToHeading = (headingId: string) => {
  const target = document.getElementById(headingId);
  if (!target) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
};

export function PublishedWikiView({ data }: Props) {
  const docs = useMemo(() => data.wiki_docs ?? [], [data.wiki_docs]);
  const wikiProps = getWikiViewProps(data.view_props);
  const accent = WIKI_ACCENTS[wikiProps.accent ?? DEFAULT_WIKI_ACCENT];
  // Owner-picked theme wins; absent = follow the reader's system preference.
  const themeClass =
    wikiProps.theme === "dark" ? "wiki-theme-dark" : wikiProps.theme === "light" ? "wiki-theme-light" : undefined;

  const [activeDocId, setActiveDocId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.slice(1);
      const fromHash = docs.find((doc) => docAnchorId(doc) === hash);
      if (fromHash) return fromHash.id;
    }
    return docs[0]?.id ?? null;
  });
  const activeDoc = docs.find((doc) => doc.id === activeDocId) ?? docs[0];

  const activeHtml = useMemo(
    () =>
      activeDoc
        ? addPublicDocHeadingIds(transformPublicDocMentions(activeDoc.description_html || "<p></p>", activeDoc.mentions))
        : "",
    [activeDoc]
  );
  const headings = useMemo(() => getPublicDocHeadings(activeHtml).filter((h) => h.level <= 2), [activeHtml]);

  useEffect(() => {
    if (!activeDoc) return;
    document.title = `${data.name || "Wiki"} — ${activeDoc.name || "Untitled"}`;
  }, [activeDoc, data.name]);

  const showDoc = (doc: TPublicWikiDoc) => {
    setActiveDocId(doc.id);
    window.history.replaceState(null, "", `#${docAnchorId(doc)}`);
    window.scrollTo(0, 0);
  };

  const navButtons = (extraClass: string) =>
    docs.map((doc) => (
      <button
        key={doc.id}
        type="button"
        className={`${extraClass}${doc.id === activeDoc?.id ? " active" : ""}`}
        onClick={() => showDoc(doc)}
      >
        {doc.name || "Untitled"}
      </button>
    ));

  return (
    <div
      className={cn("df-wiki-reader", themeClass)}
      style={{ "--wiki-accent-light": accent.light, "--wiki-accent-dark": accent.dark } as React.CSSProperties}
    >
      <style>{WIKI_READER_CSS}</style>
      {data.is_preview && (
        <div className="wiki-preview-banner" role="status">
          <strong>Preview</strong>
          <span>Only workspace members can open this link. Publish the wiki to share it.</span>
        </div>
      )}
      <div className="wiki-shell">
        <aside>
          <div className="wiki-brand">
            <strong>{data.name || "Wiki"}</strong>
          </div>
          <nav className="wiki-docnav" aria-label="Documents">
            {navButtons("wiki-nav-btn")}
          </nav>
          {headings.length > 0 && (
            <div className="wiki-toc">
              <div className="wiki-toc-label">On this page</div>
              {headings.map((heading) => (
                <button key={heading.id} type="button" onClick={() => scrollToHeading(heading.id)}>
                  {heading.text}
                </button>
              ))}
            </div>
          )}
        </aside>
        <div className="wiki-main-col">
          <div className="wiki-mobilebar">{navButtons("wiki-pill")}</div>
          <main>
            <article className="wiki-doc">
              {activeDoc ? (
                <>
                  <h1 className="wiki-doc-title">{activeDoc.name || "Untitled"}</h1>
                  <PublicDocContent html={activeHtml} embeds={[]} />
                </>
              ) : (
                <p className="wiki-empty">This wiki has no visible docs yet. Add docs to the folder, or unhide them in Wiki settings.</p>
              )}
            </article>
          </main>
        </div>
      </div>
    </div>
  );
}

const WIKI_DARK_VARS = `
  --canvas: #14160f; --paper: #1c1f17; --ink: #eceade; --muted: #a8b0a2; --quiet: #7f877b;
  --line: rgba(242, 241, 232, 0.13); --line-strong: rgba(242, 241, 232, 0.26);
  --accent: var(--wiki-accent-dark); --code-bg: rgba(242, 241, 232, 0.08);
`;

const WIKI_READER_CSS = `
.df-wiki-reader {
  --canvas: #f7f8f3; --paper: #fffef9; --ink: #171914; --muted: #667064; --quiet: #8b9288;
  --line: rgba(23, 25, 20, 0.12); --line-strong: rgba(23, 25, 20, 0.22);
  --accent: var(--wiki-accent-light); --code-bg: rgba(23, 25, 20, 0.055);
  min-height: 100vh;
  background: var(--canvas);
  color: var(--ink);
  font-family: "Figtree Variable", "Figtree", ui-sans-serif, system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.6;
}
@media (prefers-color-scheme: dark) {
  .df-wiki-reader:not(.wiki-theme-light) { ${WIKI_DARK_VARS} }
}
.df-wiki-reader.wiki-theme-dark { ${WIKI_DARK_VARS} }

.df-wiki-reader .wiki-preview-banner {
  display: flex; align-items: baseline; gap: 8px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--line);
  background: color-mix(in oklab, var(--accent) 9%, var(--canvas));
  font-size: 12.5px; color: var(--muted);
}
.df-wiki-reader .wiki-preview-banner strong { color: var(--accent); font-size: 11px; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
@media print { .df-wiki-reader .wiki-preview-banner { display: none; } }

.df-wiki-reader .wiki-shell { display: grid; grid-template-columns: 268px minmax(0, 1fr); min-height: 100vh; }

.df-wiki-reader aside {
  position: sticky; top: 0; align-self: start;
  display: flex; flex-direction: column; gap: 18px;
  height: 100vh; overflow-y: auto;
  padding: 26px 20px 30px;
  border-right: 1px solid var(--line);
}
.df-wiki-reader .wiki-brand { min-width: 0; }
.df-wiki-reader .wiki-brand strong { display: block; overflow: hidden; font-family: "Sorts Mill Goudy", Georgia, serif; font-size: 21px; font-weight: 600; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }

.df-wiki-reader .wiki-docnav { display: grid; gap: 4px; }
.df-wiki-reader .wiki-nav-btn {
  display: block; width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent; border-radius: 8px;
  background: none; color: var(--muted);
  font: 600 13px/1.3 "Figtree Variable", "Figtree", ui-sans-serif, sans-serif;
  text-align: left; cursor: pointer;
}
.df-wiki-reader .wiki-nav-btn:hover { color: var(--ink); border-color: var(--line); }
.df-wiki-reader .wiki-nav-btn.active { border-color: var(--line); background: var(--paper); color: var(--ink); }
.df-wiki-reader .wiki-nav-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.df-wiki-reader .wiki-toc { display: grid; gap: 2px; padding-top: 14px; border-top: 1px solid var(--line); }
.df-wiki-reader .wiki-toc-label { margin-bottom: 6px; color: var(--quiet); font-family: "Sorts Mill Goudy", Georgia, serif; font-size: 13px; font-weight: 600; letter-spacing: normal; }
.df-wiki-reader .wiki-toc button { padding: 3px 10px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: 400 12px/1.5 "Figtree Variable", "Figtree", ui-sans-serif, sans-serif; text-align: left; cursor: pointer; }
.df-wiki-reader .wiki-toc button:hover { color: var(--ink); background: var(--paper); }

.df-wiki-reader main { min-width: 0; padding: clamp(24px, 4vw, 56px) clamp(20px, 5vw, 72px) 90px; }
.df-wiki-reader .wiki-doc { width: min(100%, 820px); }
.df-wiki-reader .wiki-doc-title { margin: 6px 0 18px; font-family: "Sorts Mill Goudy", Georgia, serif; font-size: clamp(30px, 4.2vw, 42px); font-weight: 600; line-height: 1.1; text-wrap: balance; }
.df-wiki-reader .wiki-empty { color: var(--muted); }

/* Doc body: retint the shared published-doc prose to the reader palette.
   The shared .published-doc sheet pins heading weight/sizes with !important
   (:where() keeps its specificity at 0,1,0), so the reader's overrides carry
   !important at higher specificity to win. */
.df-wiki-reader .published-doc :where(h1, h2, h3, .editor-heading-block:is(h1, h2, h3)) {
  font-weight: 600 !important;
}

.df-wiki-reader .published-doc { max-width: 820px; color: var(--muted); font-family: "Figtree Variable", "Figtree", ui-sans-serif, system-ui, sans-serif; font-size: 15px; line-height: 1.6; }
.df-wiki-reader .published-doc h1 { margin: 0; font-family: "Sorts Mill Goudy", Georgia, serif; font-size: 30px !important; font-weight: 600; line-height: 1.12 !important; color: var(--ink); }
.df-wiki-reader .published-doc h2 { margin: 26px 0 0; padding-top: 22px; padding-bottom: 6px; border-top: 1px solid var(--line); font-family: "Sorts Mill Goudy", Georgia, serif; font-size: 26px !important; font-weight: 600; line-height: 1.15 !important; color: var(--ink); }
.df-wiki-reader .published-doc h3 { margin: 0; font-family: "Figtree Variable", "Figtree", ui-sans-serif, system-ui, sans-serif; font-size: 15.5px !important; font-weight: 600; line-height: 1.5 !important; color: var(--ink); }
.df-wiki-reader .published-doc p { margin: 0; color: var(--muted); }
.df-wiki-reader .published-doc strong { color: var(--ink); }
.df-wiki-reader .published-doc a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
.df-wiki-reader .published-doc blockquote { margin: 1.25rem 0; padding: 10px 16px; border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0; background: var(--paper); font-style: normal; }
.df-wiki-reader .published-doc blockquote p { margin: 0 0 4px; color: var(--muted); font-size: 13.5px; }
.df-wiki-reader .published-doc ul, .df-wiki-reader .published-doc ol { padding-left: 22px; color: var(--muted); }
.df-wiki-reader .published-doc li { color: var(--muted); }
.df-wiki-reader .published-doc li input[type="checkbox"] { accent-color: var(--accent); margin-right: 6px; }
.df-wiki-reader .published-doc hr { margin: 30px 0; border: 0; border-top: 1px solid var(--line); }
.df-wiki-reader .published-doc code { padding: 1px 5px; border-radius: 5px; background: var(--code-bg); color: var(--ink); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.86em; }
.df-wiki-reader .published-doc code::before, .df-wiki-reader .published-doc code::after { content: none; }
.df-wiki-reader .published-doc pre { margin: 0 0 16px; padding: 12px 14px; overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }
.df-wiki-reader .published-doc pre code { padding: 0; background: none; }
.df-wiki-reader .published-doc table { width: 100%; margin: 0 0 16px; border: 1px solid var(--line); border-radius: 10px; border-collapse: separate; border-spacing: 0; overflow: hidden; background: var(--paper); font-size: 13px; }
.df-wiki-reader .published-doc th { padding: 9px 12px; border-bottom: 1px solid var(--line-strong); color: var(--ink); font-weight: 700; text-align: left; }
.df-wiki-reader .published-doc td { padding: 8px 12px; border-bottom: 1px solid var(--line); color: var(--muted); vertical-align: top; }
.df-wiki-reader .published-doc tr:last-child td { border-bottom: 0; }
.df-wiki-reader .published-doc img { max-width: 100%; border-radius: 10px; }

.df-wiki-reader .wiki-mobilebar { display: none; }

@media (max-width: 900px) {
  .df-wiki-reader .wiki-shell { grid-template-columns: 1fr; }
  .df-wiki-reader aside { display: none; }
  .df-wiki-reader .wiki-mobilebar {
    position: sticky; top: 0; z-index: 5;
    display: flex; gap: 6px; overflow-x: auto;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    background: color-mix(in oklab, var(--canvas) 88%, transparent);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  }
  .df-wiki-reader .wiki-pill {
    flex: 0 0 auto;
    padding: 6px 11px;
    border: 1px solid var(--line); border-radius: 999px;
    background: var(--paper); color: var(--muted);
    font: 600 12px "Figtree Variable", "Figtree", ui-sans-serif, sans-serif; cursor: pointer;
    white-space: nowrap;
  }
  .df-wiki-reader .wiki-pill.active { border-color: var(--line-strong); color: var(--ink); }
}

@media print {
  .df-wiki-reader aside, .df-wiki-reader .wiki-mobilebar { display: none; }
  .df-wiki-reader .wiki-shell { grid-template-columns: 1fr; }
  .df-wiki-reader { background: #fff; }
  .df-wiki-reader .published-doc h2 { break-after: avoid; }
  .df-wiki-reader .published-doc table { break-inside: avoid; }
}
`;

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { ListChecks, PenTool, StickyNote } from "@/components/icons/lucide-shim";
import type { TPublicDocEmbed } from "@/services/page/public-page.service";

export type TPublicDocHeading = {
  id: string;
  level: 1 | 2 | 3;
  text: string;
  sequence: number;
};

type Props = {
  html: string;
  embeds: TPublicDocEmbed[];
};

const TYPE_META = {
  whiteboard: { label: "Whiteboard", Icon: PenTool },
  sticky: { label: "Sticky", Icon: StickyNote },
  task_view: { label: "Task view", Icon: ListChecks },
};

export function PublicDocContent({ html, embeds }: Props) {
  const parts = useMemo(() => splitHtmlByDocEmbeds(html, embeds), [embeds, html]);

  return (
    <>
      {parts.map((part) =>
        part.kind === "html" ? (
          <article
            key={`html-${part.html.length}-${part.html.slice(0, 24)}`}
            className="published-doc prose-neutral dark:prose-invert max-w-none prose"
            dangerouslySetInnerHTML={{ __html: part.html }}
          />
        ) : (
          <PublicDocEmbedCard key={`embed-${part.embed.embed_type}-${part.embed.entity_id}`} embed={part.embed} />
        )
      )}
    </>
  );
}

export function PublicDocIndex({ headings }: { headings: TPublicDocHeading[] }) {
  if (headings.length === 0) return null;

  return (
    <div className="absolute top-[190px] right-0 z-[5] hidden h-full lg:block">
      <div className="sticky top-24">
        <div className="group/public-doc-toc relative px-page-x">
          <div className="max-h-[50vh] overflow-hidden text-left" aria-hidden="true">
            <PublicDocOutlineBars headings={headings} />
          </div>
          <div className="vertical-scrollbar pointer-events-none absolute top-0 right-0 scrollbar-sm max-h-[70vh] w-56 translate-x-1/2 overflow-y-scroll rounded-lg bg-surface-2 p-4 whitespace-nowrap opacity-0 transition-all duration-300 group-hover/public-doc-toc:pointer-events-auto group-hover/public-doc-toc:-translate-x-1/4 group-hover/public-doc-toc:opacity-100">
            <div className="flex flex-col items-start gap-y-1">
              {headings.map((heading) => (
                <button
                  key={heading.id}
                  type="button"
                  onClick={() => handleHeadingClick(heading)}
                  className={getPublicDocHeadingClassName(heading.level)}
                >
                  {heading.text}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function handleHeadingClick(heading: TPublicDocHeading) {
  document.getElementById(heading.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function PublicDocOutlineBars({ headings }: { headings: TPublicDocHeading[] }) {
  return (
    <div className="mt-2 flex h-full flex-col items-start gap-y-2">
      {headings.map((heading) => (
        <div
          key={heading.id}
          className="h-0.5 flex-shrink-0 self-end rounded-xs bg-layer-3"
          style={{
            width: heading.level === 1 ? "20px" : heading.level === 2 ? "18px" : "14px",
          }}
        />
      ))}
    </div>
  );
}

function getPublicDocHeadingClassName(level: TPublicDocHeading["level"]) {
  const common =
    "flex-shrink-0 w-full py-1 text-left font-medium text-tertiary hover:text-accent-primary truncate transition-colors";
  if (level === 1) return `${common} pl-1 text-13`;
  if (level === 2) return `${common} pl-2 text-11`;
  return `${common} pl-4 text-11`;
}

export function getPublicDocHeadings(html: string): TPublicDocHeading[] {
  if (typeof window === "undefined") return [];

  const template = document.createElement("template");
  template.innerHTML = html || "<p></p>";

  return Array.from(template.content.querySelectorAll("h1, h2, h3")).map((heading, index) => ({
    id: getPublicDocHeadingId(index),
    level: Number(heading.tagName.slice(1)) as TPublicDocHeading["level"],
    text: heading.textContent?.trim() || "Untitled section",
    sequence: index,
  }));
}

export function addPublicDocHeadingIds(html: string): string {
  if (typeof window === "undefined") return html;

  const template = document.createElement("template");
  template.innerHTML = html || "<p></p>";

  Array.from(template.content.querySelectorAll("h1, h2, h3")).forEach((heading, index) => {
    heading.id = heading.id || getPublicDocHeadingId(index);
    heading.setAttribute("data-public-doc-heading", "true");
  });

  return template.innerHTML;
}

function getPublicDocHeadingId(index: number) {
  return `public-doc-heading-${index}`;
}

function splitHtmlByDocEmbeds(html: string, embeds: TPublicDocEmbed[]) {
  if (typeof window === "undefined" || !html.includes("doc-embed-component")) {
    return [{ kind: "html" as const, html }];
  }
  const template = document.createElement("template");
  template.innerHTML = html || "<p></p>";
  const parts: ({ kind: "html"; html: string } | { kind: "embed"; embed: TPublicDocEmbed })[] = [];
  let current = "";

  template.content.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === "doc-embed-component") {
      if (current.trim()) parts.push({ kind: "html", html: current });
      current = "";
      const element = node as Element;
      const entityId = element.getAttribute("entity_identifier") ?? "";
      const embedType = element.getAttribute("embed_type");
      const embed = embeds.find((item) => item.entity_id === entityId && item.embed_type === embedType);
      parts.push({
        kind: "embed",
        embed:
          embed ??
          ({
            embed_type: (embedType || "sticky") as TPublicDocEmbed["embed_type"],
            entity_id: entityId,
            available: false,
            title: element.getAttribute("title") || "Unavailable embed",
          } satisfies TPublicDocEmbed),
      });
    } else {
      current += node instanceof Element ? node.outerHTML : (node.textContent ?? "");
    }
  });
  if (current.trim() || parts.length === 0) parts.push({ kind: "html", html: current || "<p></p>" });
  return parts;
}

function PublicDocEmbedCard({ embed }: { embed: TPublicDocEmbed }) {
  const meta = TYPE_META[embed.embed_type] ?? TYPE_META.sticky;
  const Icon = meta.Icon;

  return (
    <div className="not-prose shadow-sm my-4 rounded-lg border border-subtle bg-surface-1 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-subtle bg-layer-1 text-tertiary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="tracking-normal text-11 font-medium text-tertiary uppercase">{meta.label}</div>
          <div className="mt-0.5 truncate text-14 font-semibold text-primary">{embed.title}</div>
          {!embed.available && (
            <div className="mt-1 text-12 text-secondary">This embedded content is private or unavailable.</div>
          )}
          {embed.available && embed.embed_type === "whiteboard" && (
            <div className="mt-3 rounded border border-dashed border-subtle bg-layer-1 px-3 py-6 text-center text-12 text-tertiary">
              Whiteboard snapshot
            </div>
          )}
          {embed.available && embed.embed_type === "task_view" && (
            <div className="mt-3 divide-y divide-subtle overflow-hidden rounded border border-subtle">
              {(embed.issues ?? []).length === 0 ? (
                <div className="px-3 py-2 text-12 text-tertiary">No tasks in this view.</div>
              ) : (
                (embed.issues ?? []).map((issue) => (
                  <div key={issue.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-12 shrink-0 text-11 font-medium text-tertiary">#{issue.sequence_id}</span>
                    <span className="min-w-0 flex-1 truncate text-13 text-primary">{issue.name}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

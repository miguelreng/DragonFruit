/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { debounce } from "lodash-es";
import mermaid from "mermaid";
import type { TPageInstance } from "@/store/pages/base-page";
import type { TPageRootHandlers } from "../editor/page-root";

mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "neutral", fontFamily: "Figtree Variable, sans-serif" });

const DEFAULT_SOURCE = `flowchart LR
  A[Spec] --> B[Tasks]
  B --> C[Ship]
`;

const MERMAID_MARKER = "<!--dragonfruit:mermaid-->";

function extractSource(html: string | undefined): string {
  if (!html) return DEFAULT_SOURCE;
  // We persist as: <!--dragonfruit:mermaid--><pre>SOURCE</pre>
  const match = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  if (match) return decodeHtmlEntities(match[1]);
  return DEFAULT_SOURCE;
}

function wrapSource(source: string): string {
  return `${MERMAID_MARKER}<pre>${escapeHtml(source)}</pre>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

type Props = {
  page: TPageInstance;
  handlers: TPageRootHandlers;
  isEditable: boolean;
};

export const MermaidEditor = observer(function MermaidEditor({ page, handlers, isEditable }: Props) {
  const [source, setSource] = useState<string>(() => extractSource(page.description_html));
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const previewIdRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 9)}`);

  // Re-render the diagram whenever the source changes.
  useEffect(() => {
    let cancelled = false;
    const id = previewIdRef.current;
    mermaid
      .render(id, source)
      .then(({ svg }) => {
        if (cancelled) return;
        setSvg(svg);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Diagram render failed");
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Persist source via the regular page update endpoint, debounced.
  const persist = useMemo(
    () =>
      debounce((next: string) => {
        handlers
          .updateDescription({
            description_html: wrapSource(next),
            description_json: { mermaid_source: next },
            description_binary: "",
          })
          .catch((e) => console.error("mermaid save failed", e));
      }, 800),
    [handlers]
  );

  const handleChange = useCallback(
    (next: string) => {
      setSource(next);
      persist(next);
    },
    [persist]
  );

  return (
    <div className="grid h-full w-full grid-cols-1 gap-4 overflow-hidden p-6 md:grid-cols-2">
      <div className="flex h-full flex-col overflow-hidden rounded-md border border-subtle-1 bg-canvas">
        <div className="border-b border-subtle-1 px-3 py-2 text-xs font-medium text-tertiary">Mermaid source</div>
        <textarea
          value={source}
          readOnly={!isEditable}
          onChange={(e) => handleChange(e.target.value)}
          spellCheck={false}
          className="h-full w-full flex-1 resize-none bg-transparent p-3 font-mono text-13 leading-relaxed text-primary outline-none"
        />
        {error && (
          <div className="border-t border-danger-strong/40 bg-danger-strong/5 px-3 py-2 text-xs text-danger-primary">
            {error}
          </div>
        )}
      </div>
      <div className="flex h-full flex-col overflow-hidden rounded-md border border-subtle-1 bg-canvas">
        <div className="border-b border-subtle-1 px-3 py-2 text-xs font-medium text-tertiary">Preview</div>
        <div
          className="flex flex-1 items-center justify-center overflow-auto p-4"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
});

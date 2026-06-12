/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { fetchWikipediaSummary, GoogleLogo, searchWikipedia, WikipediaLogo } from "@plane/editor";
import type { TWikipediaSummary } from "@plane/editor";

type TExplainCard = {
  query: string;
  x: number;
  y: number;
};

/**
 * Select-to-explain. The editor bubble menu dispatches
 * `dragonfruit:explain-selection` with the selected text and anchor
 * coordinates; this listener shows a floating Wikipedia summary card there.
 * Mount once at the workspace layout level.
 */
export function WikiExplainListener() {
  const [card, setCard] = useState<TExplainCard | null>(null);
  const [summary, setSummary] = useState<TWikipediaSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not-found">("loading");
  const cardRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const handleExplain = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string; x: number; y: number }>).detail;
      if (!detail?.text) return;
      const requestId = ++requestIdRef.current;
      setCard({
        query: detail.text,
        x: Math.max(8, Math.min(detail.x, window.innerWidth - 320)),
        y: detail.y + 8,
      });
      setStatus("loading");
      setSummary(null);
      void (async () => {
        const hits = await searchWikipedia(detail.text, { limit: 1 });
        const result = hits.length ? await fetchWikipediaSummary(hits[0].title) : null;
        if (requestIdRef.current !== requestId) return;
        setSummary(result);
        setStatus(result ? "ready" : "not-found");
      })();
    };

    window.addEventListener("dragonfruit:explain-selection", handleExplain);
    return () => window.removeEventListener("dragonfruit:explain-selection", handleExplain);
  }, []);

  useEffect(() => {
    if (!card) return;
    const handleDismiss = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setCard(null);
        return;
      }
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) setCard(null);
    };
    document.addEventListener("mousedown", handleDismiss);
    document.addEventListener("keydown", handleDismiss);
    return () => {
      document.removeEventListener("mousedown", handleDismiss);
      document.removeEventListener("keydown", handleDismiss);
    };
  }, [card]);

  if (!card) return null;

  return (
    <div
      ref={cardRef}
      className="fixed z-50 w-80 rounded-lg border border-strong bg-surface-1 p-3 shadow-raised-200"
      style={{ left: card.x, top: card.y }}
    >
      {status === "loading" && <div className="text-12 text-tertiary">Looking up “{card.query}”…</div>}
      {status === "not-found" && (
        <div className="space-y-2">
          <div className="text-12 text-secondary">No Wikipedia article found for “{card.query}”.</div>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(card.query)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-12 font-medium text-accent-primary hover:underline"
          >
            <GoogleLogo className="size-3 flex-shrink-0" />
            <span>Search Google →</span>
          </a>
        </div>
      )}
      {status === "ready" && summary && (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            {summary.thumbnail ? (
              <img src={summary.thumbnail} alt="" className="size-10 flex-shrink-0 rounded object-cover" />
            ) : null}
            <div className="min-w-0">
              <div className="truncate text-13 font-semibold text-primary">{summary.title}</div>
              <div className="flex items-center gap-1 text-11 text-tertiary">
                <WikipediaLogo className="size-2.5 flex-shrink-0" />
                <span>Wikipedia</span>
              </div>
            </div>
          </div>
          <p className="line-clamp-5 text-12 leading-5 text-secondary">{summary.extract}</p>
          <a
            href={summary.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-12 font-medium text-accent-primary hover:underline"
          >
            Read on Wikipedia →
          </a>
        </div>
      )}
    </div>
  );
}

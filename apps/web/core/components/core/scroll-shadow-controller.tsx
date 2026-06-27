/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect } from "react";

/**
 * Drives the `.scroll-shadow` top-elevation shadow (defined in tailwind-config)
 * off real scroll position: it sets `data-scrolled` on any `.scroll-shadow`
 * scroll container whose `scrollTop > 0`, and clears it otherwise. A container
 * that fits its content never scrolls, so it never gets the attribute and shows
 * no shadow at rest (fixes the calendar / short pages showing a phantom shadow).
 *
 * One capture-phase listener covers every scroller: scroll events don't bubble,
 * but they do propagate during capture, so a single document-level listener sees
 * scrolls from any nested container. The handler early-returns for elements
 * without the class, so the per-event cost is negligible.
 *
 * The same listener also drives auto-hiding scrollbars: it flags `data-scrolling`
 * while a `.scroll-shadow` container is actively scrolling and clears it after a
 * short idle beat, so the thumb (transparent at rest in tailwind-config) only
 * surfaces while scrolling or on hover.
 */
export function ScrollShadowController() {
  useEffect(() => {
    const idleTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
    const onScroll = (event: Event) => {
      const el = event.target as HTMLElement | null;
      if (!el?.classList?.contains?.("scroll-shadow")) return;
      const scrolled = el.scrollTop > 0 ? "true" : "false";
      if (el.dataset.scrolled !== scrolled) el.dataset.scrolled = scrolled;

      // Reveal the scrollbar for this scroller, then hide it once scrolling stops.
      if (el.dataset.scrolling !== "true") el.dataset.scrolling = "true";
      const prev = idleTimers.get(el);
      if (prev) clearTimeout(prev);
      idleTimers.set(
        el,
        setTimeout(() => {
          el.dataset.scrolling = "false";
          idleTimers.delete(el);
        }, 700)
      );
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  return null;
}

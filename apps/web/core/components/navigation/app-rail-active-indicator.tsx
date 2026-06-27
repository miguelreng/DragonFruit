/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

// Matches the folder-tab indicator so sidebar + tab motion feel identical.
const DURATION = 220;
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Box = { top: number; left: number; width: number; height: number };

const placePill = (pill: HTMLElement, box: Box | null) => {
  if (!box) {
    pill.style.opacity = "0";
    return;
  }
  pill.style.opacity = "1";
  pill.style.width = `${box.width}px`;
  pill.style.height = `${box.height}px`;
  pill.style.transform = `translate(${box.left}px, ${box.top}px)`;
};

// Geometry of the active ([aria-current="page"]) item, relative to the container.
const measureActive = (container: HTMLElement): Box | null => {
  const active = container.querySelector<HTMLElement>('[aria-current="page"]');
  if (!active) return null;
  const c = container.getBoundingClientRect();
  const a = active.getBoundingClientRect();
  return { top: a.top - c.top, left: a.left - c.left, width: a.width, height: a.height };
};

type TAppRailActiveIndicatorProps = {
  /** The positioned (relative) group whose active item the pill tracks. */
  containerRef: RefObject<HTMLElement | null>;
  /** Changes when the active route changes — arms the slide. */
  activeKey: string;
  /** Re-measure when the rail switches between expanded/collapsed geometry. */
  isExpanded: boolean;
};

/**
 * A single highlight pill that slides to the active sidebar item, mirroring the
 * folder-tab indicator's 220ms easeInOut motion. The active item is located via
 * `aria-current="page"`; geometry is measured relative to `containerRef`.
 *
 * Like the tab indicator, an active-route change *arms* the slide and we run it
 * once the measured box actually moves; first paint, a reappearance, reduced
 * motion, or a geometry-only change snap instead.
 */
export function AppRailActiveIndicator({ containerRef, activeKey, isExpanded }: TAppRailActiveIndicatorProps) {
  const pillRef = useRef<HTMLDivElement>(null);
  const current = useRef<Box | null>(null);
  const prevKey = useRef(activeKey);
  const armed = useRef(false);
  const rafRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const pill = pillRef.current;
    if (!container || !pill) return;

    if (prevKey.current !== activeKey) {
      prevKey.current = activeKey;
      armed.current = true;
    }

    const target = measureActive(container);

    // No active item in this group — hide and reset so a later one snaps in.
    if (!target) {
      current.current = null;
      armed.current = false;
      placePill(pill, null);
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // First placement / reappearance / reduced motion — snap.
    if (!current.current || reduceMotion) {
      current.current = target;
      armed.current = false;
      placePill(pill, target);
      return;
    }

    const moved =
      Math.abs(target.top - current.current.top) > 0.5 ||
      Math.abs(target.left - current.current.left) > 0.5 ||
      Math.abs(target.width - current.current.width) > 0.5 ||
      Math.abs(target.height - current.current.height) > 0.5;

    // Armed by a route change and the box moved — slide from the current spot.
    if (armed.current && moved) {
      armed.current = false;
      const from = { ...current.current };
      const start = performance.now();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / DURATION);
        const e = easeInOut(p);
        const box: Box = {
          top: from.top + (target.top - from.top) * e,
          left: from.left + (target.left - from.left) * e,
          width: from.width + (target.width - from.width) * e,
          height: from.height + (target.height - from.height) * e,
        };
        current.current = box;
        placePill(pill, box);
        if (p < 1) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    // Geometry-only change (expand/collapse, resize) or a stale render — snap.
    current.current = target;
    placePill(pill, target);
  }, [containerRef, activeKey, isExpanded]);

  // The rail animates its width over ~250ms when toggling expanded/collapsed, and
  // this indicator only mounts while expanded — so on expand the effect above
  // measures the active item on the transition's first frame, catching the still
  // icon-only width, and its deps never change again to correct it (the pill stays
  // stuck at icon width). A ResizeObserver re-snaps the pill as the container
  // actually grows, so it tracks the active item to its real width and also stays
  // correct across viewport resizes. Geometry changed underneath any in-flight
  // route slide, so cancel it and snap.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const pill = pillRef.current;
    if (!container || !pill || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      armed.current = false;
      const box = measureActive(container);
      current.current = box;
      placePill(pill, box);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  return (
    <div
      ref={pillRef}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-0 rounded-lg bg-[var(--neutral-600)] opacity-0"
    />
  );
}

AppRailActiveIndicator.displayName = "AppRailActiveIndicator";

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";

// Geometry of the "folder" shape, in px.
const FLARE = 10; // width of the concave skirt that flares out on each side at the seam
const R_TOP = 10; // top corner radius
const DURATION = 220; // slide duration, ms — matches the prototype

type TFolderTabIndicatorProps = {
  /** left offset of the active tab, relative to the positioning container */
  left: number;
  /** measured width of the active tab */
  width: number;
  /** height from the top of the strip down to the content seam */
  height: number;
  /** key of the active tab — a change arms the slide; a resize-only change snaps */
  activeKey: string;
};

/**
 * Build the folder outline for a box of `boxW` x `h`. The tab body occupies the
 * centre (inset by FLARE on each side); at the bottom it flares outward through
 * concave corners so the active tab reads as fused with the content sheet below.
 */
function buildPath(boxW: number, h: number): string {
  const r = Math.max(0, Math.min(R_TOP, boxW / 2 - FLARE));
  return [
    `M ${FLARE} ${r}`,
    `Q ${FLARE} 0 ${FLARE + r} 0`,
    `L ${boxW - FLARE - r} 0`,
    `Q ${boxW - FLARE} 0 ${boxW - FLARE} ${r}`,
    `L ${boxW - FLARE} ${h - FLARE}`,
    `Q ${boxW - FLARE} ${h} ${boxW} ${h}`,
    `L 0 ${h}`,
    `Q ${FLARE} ${h} ${FLARE} ${h - FLARE}`,
    "Z",
  ].join(" ");
}

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The white "folder" that sits behind the active tab and melts into the content
 * panel, sliding to the active tab over ~220ms exactly like the prototype.
 *
 * Driving this off route state is subtle: when a tab is clicked, `activeKey`
 * changes one render before the new measured position lands (the position is set
 * in a layout effect). So we don't animate on the key change directly — the key
 * change *arms* the slide, and we run it when the position actually moves. A
 * geometry change with no armed slide (a resize) snaps. This is robust whether
 * React delivers the key + position in one render or two.
 */
export function FolderTabIndicator({ left, width, height, activeKey }: TFolderTabIndicatorProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const current = useRef({ left, width });
  const prevKey = useRef(activeKey);
  const hasDrawn = useRef(false);
  const armed = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const draw = (l: number, w: number) => {
      const boxW = w + FLARE * 2;
      if (wrapRef.current) {
        wrapRef.current.style.transform = `translateX(${l - FLARE}px)`;
        wrapRef.current.style.width = `${boxW}px`;
      }
      svgRef.current?.setAttribute("viewBox", `0 0 ${boxW} ${height}`);
      pathRef.current?.setAttribute("d", buildPath(boxW, height));
    };

    if (prevKey.current !== activeKey) {
      prevKey.current = activeKey;
      armed.current = true; // a tab switch — slide once the position lands
    }

    const reduceMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const moved = Math.abs(left - current.current.left) > 0.5 || Math.abs(width - current.current.width) > 0.5;

    // First paint or reduced motion: snap into place.
    if (!hasDrawn.current || reduceMotion) {
      hasDrawn.current = true;
      armed.current = false;
      current.current = { left, width };
      draw(left, width);
      return;
    }

    // Armed by a tab switch and the position has now moved: slide from here.
    if (armed.current && moved) {
      armed.current = false;
      const from = { ...current.current };
      const startTime = performance.now();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const stepFrame = (now: number) => {
        const p = Math.min(1, (now - startTime) / DURATION);
        const e = easeInOut(p);
        const l = from.left + (left - from.left) * e;
        const w = from.width + (width - from.width) * e;
        current.current = { left: l, width: w };
        draw(l, w);
        if (p < 1) rafRef.current = requestAnimationFrame(stepFrame);
      };
      rafRef.current = requestAnimationFrame(stepFrame);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    // Stale key-change render (no move yet), resize, or height change: snap.
    // Keeps `armed` intact so the real move still animates.
    current.current = { left, width };
    draw(left, width);
  }, [left, width, height, activeKey]);

  const initialBoxW = width + FLARE * 2;

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className="pointer-events-none absolute top-0 bottom-0 left-0"
      style={{ width: initialBoxW, transform: `translateX(${left - FLARE}px)` }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${initialBoxW} ${height}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path ref={pathRef} d={buildPath(initialBoxW, height)} style={{ fill: "var(--bg-surface-1)" }} />
      </svg>
    </div>
  );
}

FolderTabIndicator.displayName = "FolderTabIndicator";

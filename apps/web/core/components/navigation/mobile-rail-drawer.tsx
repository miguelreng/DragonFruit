/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@plane/utils";

type TMobileRailDrawerProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: React.ReactNode;
};

// Width of the left-edge hit zone that catches the swipe-to-open gesture.
const EDGE_WIDTH = 24;
// Fraction of the drawer width a drag must cross to commit to open/close.
const COMMIT_THRESHOLD = 0.33;
// Movement (px) before we decide a gesture is horizontal vs. a vertical scroll.
const DIRECTION_LOCK = 8;
const TRANSITION = "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)";
const SCRIM_TRANSITION = "opacity 300ms cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Mobile-only slide-over drawer for the app rail. Renders an off-canvas panel
 * that the user reveals by swiping in from the left edge (or via a trigger that
 * calls `onOpen`), and dismisses by swiping left, tapping the scrim, or
 * navigating. The drag follows the finger for a native feel, snapping to the
 * nearest resting state on release.
 *
 * Only mount this below the mobile breakpoint — on desktop the rail renders
 * inline and this component is unnecessary.
 */
export function MobileRailDrawer({ open, onOpen, onClose, children }: TMobileRailDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Live gesture bookkeeping kept in a ref; only `dragX` drives a re-render.
  const gesture = useRef<{
    mode: "open" | "close";
    startX: number;
    startY: number;
    width: number;
    locked: boolean;
    horizontal: boolean;
  } | null>(null);
  // Current panel offset (px) while a horizontal drag is in progress; null when
  // resting, so the position falls back to the declarative `open` state.
  const [dragX, setDragX] = useState<number | null>(null);

  // Once the declarative open/close state settles, drop any leftover drag
  // offset so the panel honors `open`. Guards against a missed touchend (e.g.
  // the browser fires touchcancel instead during a system gesture), which would
  // otherwise strand the panel mid-slide.
  useEffect(() => {
    setDragX(null);
    gesture.current = null;
  }, [open]);

  // Portal target is only available on the client; mount-gate so SSR and the
  // first client render agree (both render nothing).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDragging = dragX !== null;
  const width = gesture.current?.width ?? 0;
  const progress = isDragging && width > 0 ? Math.min(1, Math.max(0, (dragX + width) / width)) : open ? 1 : 0;
  const panelTransform = isDragging
    ? `translate3d(${dragX}px, 0, 0)`
    : open
      ? "translate3d(0, 0, 0)"
      : "translateX(-100%)";

  const handleTouchStart = (mode: "open" | "close") => (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    gesture.current = {
      mode,
      startX: touch.clientX,
      startY: touch.clientY,
      width: panelRef.current?.offsetWidth ?? 0,
      locked: false,
      horizontal: false,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const state = gesture.current;
    const touch = e.touches[0];
    if (!state || !touch) return;

    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;

    // Decide horizontal vs. vertical once, then commit to that axis.
    if (!state.locked) {
      if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return;
      state.locked = true;
      state.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!state.horizontal) return;

    const next =
      state.mode === "open"
        ? Math.min(0, Math.max(-state.width, -state.width + dx))
        : Math.min(0, Math.max(-state.width, dx));
    setDragX(next);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const state = gesture.current;
    gesture.current = null;
    setDragX(null);
    if (!state || !state.horizontal || state.width === 0) return;

    const touch = e.changedTouches[0];
    const dx = touch ? touch.clientX - state.startX : 0;
    const committed = Math.abs(dx) > state.width * COMMIT_THRESHOLD;

    if (state.mode === "open") {
      if (committed && dx > 0) onOpen();
    } else if (committed && dx < 0) {
      onClose();
    }
  };

  if (!mounted) return null;

  // Rendered into <body> so the overlay shares the top-level stacking context.
  // Otherwise editor chrome (cover controls at z-50, popovers/menus up to
  // z-[100], some portaled themselves) would punch through the drawer.
  return createPortal(
    <>
      {/* Left-edge catcher — only present while closed, so it never steals
          touches from the open drawer's content. */}
      {!open && (
        <div
          className="fixed inset-y-0 left-0 z-[200]"
          style={{ width: EDGE_WIDTH, touchAction: "none" }}
          onTouchStart={handleTouchStart("open")}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          aria-hidden
        />
      )}

      {/* Scrim */}
      <div
        className="fixed inset-0 z-[200] bg-black/40"
        style={{
          opacity: progress,
          pointerEvents: progress > 0 ? "auto" : "none",
          transition: isDragging ? "none" : SCRIM_TRANSITION,
        }}
        onClick={onClose}
        aria-hidden
      />

      {/* Sliding panel */}
      <div
        ref={panelRef}
        className={cn(
          "fixed inset-y-0 left-0 z-[201] flex w-[84vw] max-w-[320px] overflow-hidden rounded-r-[18px] bg-canvas shadow-raised-300 will-change-transform"
        )}
        style={{
          transform: panelTransform,
          transition: isDragging ? "none" : TRANSITION,
          touchAction: "pan-y",
        }}
        onTouchStart={handleTouchStart("close")}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        {children}
      </div>
    </>,
    document.body
  );
}
